import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hestiaApi, formatBytes, formatUptime, type ApiState } from "./api";

/**
 * Estes testes exercitam o parser de erros do safeFetch em src/lib/hestia/api.ts.
 * Estratégia:
 *  - jsdom já provê window.location; forçamos hostname=localhost para que
 *    resolveBase() retorne uma base válida e o fetch seja realmente disparado.
 *  - global.fetch é stubado com vi.fn() para simular respostas 200/500/timeout/rede.
 *  - Um teste dedicado remove o stub de localhost para exercitar o ramo "no-base".
 */

function setLocation(hostname: string, protocol = "http:") {
  // jsdom permite redefinir window.location via Object.defineProperty
  const url = new URL(`${protocol}//${hostname}:8080/`);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hostname,
      protocol,
      href: url.href,
      origin: url.origin,
      host: url.host,
      port: "8080",
      pathname: "/",
      search: "",
      hash: "",
      assign: vi.fn(),
      reload: vi.fn(),
      replace: vi.fn(),
      toString: () => url.href,
    },
    writable: true,
  });
}

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response> | Response) {
  const fn = vi.fn(impl as never);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function expectUnavailable<T>(s: ApiState<T>) {
  if (s.status !== "unavailable") {
    throw new Error(`esperava status "unavailable", recebi "${s.status}"`);
  }
  return s;
}

describe("hestiaApi.safeFetch — parser de erros estruturados", () => {
  beforeEach(() => {
    setLocation("localhost");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retorna status=ok quando a resposta é 200 JSON", async () => {
    const payload = { ok: true, appName: "Héstia" };
    mockFetch(
      () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const s = await hestiaApi.health();
    expect(s.status).toBe("ok");
    if (s.status === "ok") {
      expect(s.data).toMatchObject(payload);
      expect(typeof s.fetchedAt).toBe("string");
    }
  });

  it("formata corpo de erro estruturado (error/code/detail/hint) em HTTP 500", async () => {
    const body = {
      error: "Falha ao ler /var/log",
      code: "EACCES",
      detail: "permission denied",
      hint: "rode com usuário com acesso de leitura",
      route: "GET /api/logs",
    };
    mockFetch(
      () =>
        new Response(JSON.stringify(body), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const s = expectUnavailable(await hestiaApi.logs());
    expect(s.message).toContain("GET /api/logs respondeu 500");
    // Todos os campos relevantes concatenados na mensagem, separados por " · "
    expect(s.message).toContain("Falha ao ler /var/log");
    expect(s.message).toContain("EACCES");
    expect(s.message).toContain("permission denied");
    expect(s.message).toContain("rode com usuário com acesso de leitura");

    expect(s.details.origin).toBe("http");
    expect(s.details.httpStatus).toBe(500);
    expect(s.details.route).toBe("GET /api/logs");
    expect(s.details.code).toBe("EACCES");
    // detail preferido sobre error quando ambos existem
    expect(s.details.detail).toBe("permission denied");
    expect(s.details.hint).toBe("rode com usuário com acesso de leitura");
    expect(s.details.rawBody).toContain("EACCES");
  });

  it("usa `error` como detail quando `detail` está ausente", async () => {
    const body = { error: "algo quebrou", code: "EIO" };
    mockFetch(
      () =>
        new Response(JSON.stringify(body), {
          status: 500,
        }),
    );

    const s = expectUnavailable(await hestiaApi.server());
    expect(s.details.detail).toBe("algo quebrou");
    expect(s.details.code).toBe("EIO");
  });

  it("preserva rawBody e mensagem base quando o corpo NÃO é JSON", async () => {
    mockFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));

    const s = expectUnavailable(await hestiaApi.storage());
    expect(s.message).toContain("GET /api/storage/status respondeu 502");
    // Sem parsing JSON, não deve concatenar sufixo " — ..."
    expect(s.message).not.toContain(" — ");
    expect(s.details.origin).toBe("http");
    expect(s.details.httpStatus).toBe(502);
    expect(s.details.rawBody).toBe("<html>bad gateway</html>");
    expect(s.details.code).toBeUndefined();
    expect(s.details.detail).toBeUndefined();
  });

  it("trunca rawBody em 2000 chars", async () => {
    const huge = "x".repeat(5000);
    mockFetch(() => new Response(huge, { status: 500 }));

    const s = expectUnavailable(await hestiaApi.services());
    expect(s.details.rawBody?.length).toBe(2000);
  });

  it("classifica timeout como origin=timeout com timeoutMs", async () => {
    mockFetch(
      (_input) =>
        new Promise<Response>((_res, rej) => {
          // simula abort do AbortController
          setTimeout(() => {
            const err = new DOMException("aborted", "AbortError");
            rej(err);
          }, 5);
        }),
    );

    const s = expectUnavailable(await hestiaApi.logs(50));
    expect(s.details.origin).toBe("timeout");
    expect(s.message).toContain("timeout");
    expect(s.details.route).toBe("GET /api/logs?tail=50");
    expect(typeof s.details.timeoutMs).toBe("number");
    expect(s.details.hint).toBeDefined();
  });

  it("classifica falha de rede como origin=network e inclui a mensagem do erro", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const s = expectUnavailable(await hestiaApi.config());
    expect(s.details.origin).toBe("network");
    expect(s.message).toContain("Falha de rede em /api/config");
    expect(s.message).toContain("Failed to fetch");
    expect(s.details.detail).toBe("Failed to fetch");
    expect(s.details.route).toBe("GET /api/config");
  });

  it("retorna origin=no-base sem disparar fetch quando não estamos em host local", async () => {
    setLocation("app.exemplo.com", "https:");
    const fetchSpy = mockFetch(() => new Response("nope", { status: 200 }));

    const s = expectUnavailable(await hestiaApi.health());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(s.details.origin).toBe("no-base");
    expect(s.details.route).toBe("GET /api/health");
    expect(s.message).toContain("Aguardando Chama Local");
  });

  it("clampa e sanitiza o parâmetro tail dos logs", async () => {
    const fetchSpy = mockFetch(
      () =>
        new Response(JSON.stringify({ items: [], tail: 200 }), {
          status: 200,
        }),
    );

    await hestiaApi.logs(9999);
    await hestiaApi.logs(-5);
    await hestiaApi.logs(75);
    await hestiaApi.logs();

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/api/logs?tail=200"); // clamped para o máximo
    expect(urls[1]).toContain("/api/logs?tail=1"); // clamped para o mínimo
    expect(urls[2]).toContain("/api/logs?tail=75");
    expect(urls[3]).toMatch(/\/api\/logs$/); // sem query quando tail não é passado
  });
});

describe("hestiaApi.ping", () => {
  beforeEach(() => setLocation("localhost"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retorna {status,ok} em sucesso", async () => {
    mockFetch(() => new Response("", { status: 204 }));
    const r = await hestiaApi.ping("/api/health");
    expect(r).toEqual({ status: 204, ok: true });
  });

  it("retorna status=erro quando o fetch falha", async () => {
    mockFetch(() => {
      throw new Error("boom");
    });
    const r = await hestiaApi.ping("/api/health");
    expect(r).toEqual({ status: "erro", ok: false });
  });

  it("retorna status=erro sem disparar fetch fora de host local", async () => {
    setLocation("preview.lovable.app", "https:");
    const spy = mockFetch(() => new Response("", { status: 200 }));
    const r = await hestiaApi.ping("/api/health");
    expect(spy).not.toHaveBeenCalled();
    expect(r).toEqual({ status: "erro", ok: false });
  });
});

describe("formatBytes / formatUptime", () => {
  it("formatBytes cobre nulos, bytes e escalas", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toMatch(/GB$/);
  });

  it("formatUptime cobre nulos, minutos, horas e dias", () => {
    expect(formatUptime(null)).toBe("—");
    expect(formatUptime(30)).toBe("0m");
    expect(formatUptime(60 * 5)).toBe("5m");
    expect(formatUptime(60 * 60 * 3 + 60 * 20)).toBe("3h 20m");
    expect(formatUptime(86400 * 2 + 3600 * 4)).toBe("2d 4h");
  });
});
