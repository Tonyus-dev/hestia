import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STATION_IDS,
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  fetchStationUpdates,
  fetchTvboxCodiceHealth,
  hasLegacyStationConfig,
  resolveNamedStationConfig,
} from "./stationClient.js";

const now = () => new Date().toISOString();
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
const health = () => ({
  ok: true,
  schemaVersion: 1,
  service: "hestia-station-agent",
  version: "test",
  checkedAt: now(),
});
const storage = () => ({
  ok: true,
  schemaVersion: 1,
  checkedAt: now(),
  storage: {
    id: "kaline",
    exists: true,
    status: "ok",
    totalBytes: 100,
    usedBytes: 50,
    freeBytes: 50,
    percentUsed: 50,
  },
});
const services = () => ({
  ok: true,
  schemaVersion: 1,
  checkedAt: now(),
  services: [{ id: "tailscaled", active: true, status: "active" }],
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("configuração explícita das cinco Stations", () => {
  it("mantém IDs canônicos e isolamento de todas as Stations", () => {
    expect(STATION_IDS).toEqual(["desktop", "tvbox", "pocket", "baby", "mini", "max", "note"]);
    const env = {
      NODE_ENV: "test",
      HESTIA_POCKET_BASE_URL: "http://127.0.0.1:4520",
      HESTIA_POCKET_TOKEN: "pocket-secret",
      HESTIA_BABY_BASE_URL: "http://127.0.0.1:4521",
      HESTIA_BABY_TOKEN: "baby-secret",
      HESTIA_MINI_BASE_URL: "http://127.0.0.1:4522",
      HESTIA_MINI_TOKEN: "mini-secret",
      HESTIA_MAX_BASE_URL: "http://127.0.0.1:4523",
      HESTIA_MAX_TOKEN: "max-secret",
    };
    expect(resolveNamedStationConfig("pocket", env)).toMatchObject({
      valid: true,
      token: "pocket-secret",
    });
    expect(resolveNamedStationConfig("baby", env)).toMatchObject({
      valid: true,
      token: "baby-secret",
    });
    expect(JSON.stringify(resolveNamedStationConfig("pocket", env))).not.toContain("baby-secret");
    expect(resolveNamedStationConfig("mini", env)).toMatchObject({
      valid: true,
      token: "mini-secret",
    });
    expect(resolveNamedStationConfig("max", env)).toMatchObject({
      valid: true,
      token: "max-secret",
    });
    expect(JSON.stringify(resolveNamedStationConfig("pocket", env))).not.toContain("baby-secret");
    expect(JSON.stringify(resolveNamedStationConfig("baby", env))).not.toContain("pocket-secret");
    expect(JSON.stringify(resolveNamedStationConfig("mini", env))).not.toContain("pocket-secret");
    expect(JSON.stringify(resolveNamedStationConfig("mini", env))).not.toContain("baby-secret");
    expect(JSON.stringify(resolveNamedStationConfig("max", env))).not.toContain("pocket-secret");
    expect(JSON.stringify(resolveNamedStationConfig("max", env))).not.toContain("baby-secret");
    expect(JSON.stringify(resolveNamedStationConfig("max", env))).not.toContain("mini-secret");
  });

  it("preserva defaults antigos e permite novos serviços somente com configuração explícita", () => {
    expect(resolveNamedStationConfig("desktop", {})).toMatchObject({ configured: false });
    const desktopAgent = { HESTIA_STATION_TOKEN: "token" };
    // Regressão coberta em stationAgent/services: ausência de HESTIA_STATION_SERVICES mantém os três antigos.
    expect(JSON.stringify(desktopAgent)).not.toContain("hermes");
  });

  it("cobre nenhuma, apenas uma, ambas e combinações incompletas", () => {
    expect(resolveNamedStationConfig("desktop", {})).toMatchObject({ configured: false });
    const onlyDesktop = {
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    };
    expect(resolveNamedStationConfig("desktop", onlyDesktop)).toMatchObject({ valid: true });
    expect(resolveNamedStationConfig("tvbox", onlyDesktop)).toMatchObject({ configured: false });
    expect(resolveNamedStationConfig("mini", onlyDesktop)).toMatchObject({ configured: false });
    const both = {
      ...onlyDesktop,
      HESTIA_TVBOX_BASE_URL: "http://127.0.0.1:4519",
      HESTIA_TVBOX_TOKEN: "tvbox-secret",
    };
    expect(resolveNamedStationConfig("tvbox", both)).toMatchObject({ valid: true });
    expect(
      resolveNamedStationConfig("desktop", { HESTIA_DESKTOP_BASE_URL: "https://desktop.example" }),
    ).toMatchObject({ valid: false, errorCode: "STATION_MISCONFIGURED" });
    expect(resolveNamedStationConfig("mini", { HESTIA_MINI_TOKEN: "orphan" })).toMatchObject({
      valid: false,
      errorCode: "STATION_MISCONFIGURED",
    });
  });

  it("preserva as regras de URL e rejeita IDs fora da allowlist", () => {
    for (const value of [
      "https://user:pass@example.test",
      "https://example.test/path",
      "https://example.test?x=1",
      "https://example.test#x",
      "http://example.test",
    ]) {
      expect(
        resolveNamedStationConfig("desktop", {
          HESTIA_DESKTOP_BASE_URL: value,
          HESTIA_DESKTOP_TOKEN: "secret",
        }).valid,
      ).toBe(false);
    }
    expect(() => resolveNamedStationConfig("outro", {})).toThrow("Station desconhecida");
  });

  it("detecta legado sem expor valores", () => {
    const secret = "legacy-secret";
    expect(hasLegacyStationConfig({ HESTIA_STATION_TOKEN: secret })).toBe(true);
    expect(JSON.stringify(resolveNamedStationConfig("desktop", {}))).not.toContain(secret);
  });
});

describe("cliente reutilizável e isolado", () => {
  it("usa URL e token próprios para health, storage e services", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), authorization: init.headers.Authorization });
        if (String(url).endsWith("/health")) return json(health());
        if (String(url).includes("/storage/")) return json(storage());
        return json(services());
      }),
    );
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    const tvbox = resolveNamedStationConfig("tvbox", {
      HESTIA_TVBOX_BASE_URL: "https://tvbox.example",
      HESTIA_TVBOX_TOKEN: "tvbox-token",
    });
    expect((await fetchStationHealth(desktop)).ok).toBe(true);
    expect((await fetchStationStorageStatus(tvbox)).ok).toBe(true);
    expect((await fetchStationServicesStatus(tvbox)).ok).toBe(true);
    expect(calls).toEqual([
      { url: "https://desktop.example/api/station/health", authorization: "Bearer desktop-token" },
      {
        url: "https://tvbox.example/api/station/storage/status",
        authorization: "Bearer tvbox-token",
      },
      {
        url: "https://tvbox.example/api/station/services/status",
        authorization: "Bearer tvbox-token",
      },
    ]);
  });

  it("rejeita redirect, body excessivo e contrato inválido sem contaminar a outra Station", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const value = String(url);
        if (value.includes("desktop")) return json({}, { status: 302 });
        if (value.includes("large"))
          return new Response("{}", {
            headers: { "content-type": "application/json", "content-length": "65537" },
          });
        return json(health());
      }),
    );
    const cfg = (stationId, host) => ({
      stationId,
      configured: true,
      valid: true,
      baseUrl: new URL(`https://${host}.example`),
      token: `${host}-token`,
      timeoutMs: 1000,
      errorCode: null,
    });
    const [bad, good] = await Promise.all([
      fetchStationHealth(cfg("desktop", "desktop")),
      fetchStationHealth(cfg("tvbox", "tvbox")),
    ]);
    expect(bad).toMatchObject({ ok: false, code: "STATION_REDIRECT_REJECTED" });
    expect(good.ok).toBe(true);
    expect(await fetchStationHealth(cfg("desktop", "large"))).toMatchObject({
      ok: false,
      code: "STATION_RESPONSE_TOO_LARGE",
    });
  });

  it("Códice consulta somente a rota interna da TV Box com o Station token", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        ok: true,
        schemaVersion: 1,
        generatedAt: now(),
        libraryAvailable: true,
        formats: ["epub", "pdf"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = resolveNamedStationConfig("tvbox", {
      HESTIA_TVBOX_BASE_URL: "https://tvbox.example",
      HESTIA_TVBOX_TOKEN: "station-secret",
    });
    expect(await fetchTvboxCodiceHealth(config)).toMatchObject({
      ok: true,
      formats: ["epub", "pdf"],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://tvbox.example/api/station/codice/health");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer station-secret",
    });
    expect(
      JSON.stringify(await fetchTvboxCodiceHealth({ ...config, stationId: "desktop" })),
    ).not.toContain("station-secret");
  });

  it.each([
    [["epub", "pdf"], true],
    [["epub", "pdf", "txt"], true],
    [["txt", "epub", "pdf"], true],
    [["epub"], false],
    [["pdf"], false],
    [["epub", "pdf", "mobi"], false],
    [["epub", "pdf", "txt", "txt"], false],
  ])("valida formatos do Códice %j", async (formats, valid) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          ok: true,
          schemaVersion: 1,
          generatedAt: now(),
          libraryAvailable: true,
          formats,
        }),
      ),
    );
    const config = resolveNamedStationConfig("tvbox", {
      HESTIA_TVBOX_BASE_URL: "https://tvbox.example",
      HESTIA_TVBOX_TOKEN: "station-secret",
    });
    const result = await fetchTvboxCodiceHealth(config);
    if (valid) {
      expect(result).toMatchObject({ ok: true, formats });
    } else {
      expect(result).toMatchObject({ ok: false, code: "STATION_CONTRACT_MISMATCH" });
    }
  });

  it("propaga status 'unsupported' da Station sem mascarar como contract mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          ok: false,
          status: "unsupported",
          reason: "APT_NOT_AVAILABLE",
          checkedAt: now(),
        }),
      ),
    );
    const config = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    const result = await fetchStationUpdates(config);
    expect(result).toMatchObject({
      ok: false,
      updates: { ok: false, status: "unsupported", reason: "APT_NOT_AVAILABLE" },
    });
  });

  it("propaga status 'error' (APT_EXEC_FAILED) sem regredir para unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          ok: false,
          status: "error",
          reason: "APT_EXEC_FAILED",
          checkedAt: now(),
        }),
      ),
    );
    const config = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    const result = await fetchStationUpdates(config);
    expect(result).toMatchObject({
      ok: false,
      updates: { ok: false, status: "error", reason: "APT_EXEC_FAILED" },
    });
    expect(result.updates.status).not.toBe("unsupported");
  });

  it("rejeita respostas de updates com status desconhecido como contract mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ ok: false, status: "nonsense", reason: "WHATEVER", checkedAt: now() }),
      ),
    );
    const config = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    const result = await fetchStationUpdates(config);
    expect(result).toMatchObject({ ok: false, code: "STATION_CONTRACT_MISMATCH" });
  });
});
