import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  getStationConnectionStatus,
  resolveStationConfig,
} from "./stationClient.js";

function env(extra) {
  return { NODE_ENV: "test", ...extra };
}

function startPeer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers });
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, requests, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function peer(handler) {
  const p = await startPeer(handler);
  servers.push(p.server);
  return p;
}

function validHealth(version = "test") {
  return JSON.stringify({
    ok: true,
    schemaVersion: 1,
    service: "hestia-station-agent",
    version,
    checkedAt: new Date().toISOString(),
  });
}

function validStorage(overrides = {}) {
  return JSON.stringify({
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    storage: {
      id: "kaline",
      exists: true,
      status: "ok",
      totalBytes: 1000,
      usedBytes: 500,
      freeBytes: 500,
      percentUsed: 50,
      ...overrides,
    },
  });
}

function validServices(
  services = [
    { id: "jellyfin", active: true, status: "active" },
    { id: "smbd", active: false, status: "inactive" },
    { id: "tailscaled", active: false, status: "not-installed" },
  ],
) {
  return JSON.stringify({
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    services,
  });
}

describe("resolveStationConfig", () => {
  it("normaliza estados de configuração sem derrubar o Console", () => {
    expect(resolveStationConfig(env({}))).toMatchObject({
      configured: false,
      valid: false,
      errorCode: "STATION_NOT_CONFIGURED",
      timeoutMs: 5000,
    });
    expect(resolveStationConfig(env({ HESTIA_STATION_BASE_URL: "notaurl" }))).toMatchObject({
      configured: true,
      valid: false,
      errorCode: "STATION_MISCONFIGURED",
    });
    expect(
      resolveStationConfig(
        env({
          HESTIA_STATION_BASE_URL: "https://station.example.ts.net",
          HESTIA_STATION_TOKEN: "secret",
        }),
      ),
    ).toMatchObject({ configured: true, valid: true, timeoutMs: 5000 });
    expect(
      resolveStationConfig(env({ HESTIA_STATION_BASE_URL: "https://station.example.ts.net" })),
    ).toMatchObject({ valid: false, errorCode: "STATION_MISCONFIGURED" });
    expect(
      resolveStationConfig(
        env({
          HESTIA_STATION_BASE_URL: "https://station.example.ts.net",
          HESTIA_STATION_TOKEN: "secret",
          HESTIA_STATION_TIMEOUT_MS: "999",
        }),
      ).timeoutMs,
    ).toBe(5000);
    expect(
      resolveStationConfig(
        env({
          HESTIA_STATION_BASE_URL: "https://station.example.ts.net",
          HESTIA_STATION_TOKEN: "secret",
          HESTIA_STATION_TIMEOUT_MS: "30001",
        }),
      ).timeoutMs,
    ).toBe(5000);
  });

  it("rejeita URL fora do contrato e permite HTTP loopback em teste", () => {
    for (const bad of [
      "https://user:pass@station.example.ts.net",
      "https://station.example.ts.net/api",
      "https://station.example.ts.net?token=x",
      "https://station.example.ts.net#x",
      "http://station.example.ts.net",
      "file:///KALINE",
      "javascript:alert(1)",
    ]) {
      expect(
        resolveStationConfig(env({ HESTIA_STATION_BASE_URL: bad, HESTIA_STATION_TOKEN: "secret" })),
      ).toMatchObject({ valid: false });
    }
    expect(
      resolveStationConfig(
        env({ HESTIA_STATION_BASE_URL: "http://127.0.0.1:1", HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ valid: true });
    expect(
      resolveStationConfig({
        NODE_ENV: "production",
        HESTIA_STATION_BASE_URL: "http://127.0.0.1:1",
        HESTIA_STATION_TOKEN: "secret",
      }),
    ).toMatchObject({ valid: false });
  });
});

describe("fetchStationHealth", () => {
  it("usa GET, headers allowlisted, bearer e request id UUID", async () => {
    const p = await peer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(validHealth());
    });
    const result = await fetchStationHealth(
      env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
    );
    expect(result.state).toBe("available");
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0].method).toBe("GET");
    expect(p.requests[0].url).toBe("/api/station/health");
    expect(p.requests[0].headers.accept).toBe("application/json");
    expect(p.requests[0].headers.authorization).toBe("Bearer secret");
    expect(p.requests[0].headers.cookie).toBeUndefined();
    expect(p.requests[0].headers["x-hestia-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("não segue redirect", async () => {
    const p = await peer((req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "https://example.com");
      res.end();
    });
    const result = await fetchStationHealth(
      env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
    );
    expect(result).toMatchObject({ state: "incompatible", code: "STATION_REDIRECT_REJECTED" });
    expect(p.requests).toHaveLength(1);
  });

  it("aborta timeout real e vira unavailable", async () => {
    const p = await peer(() => {});
    const result = await fetchStationHealth(
      env({
        HESTIA_STATION_BASE_URL: p.baseUrl,
        HESTIA_STATION_TOKEN: "secret",
        HESTIA_STATION_TIMEOUT_MS: "1000",
      }),
    );
    expect(result).toMatchObject({ state: "unavailable", code: "STATION_TIMEOUT" });
  }, 4000);

  it("normaliza falhas HTTP, content-type, tamanho e contrato", async () => {
    for (const authStatus of [401, 403]) {
      const unauthorized = await peer((req, res) => {
        res.statusCode = authStatus;
        res.end();
      });
      expect(
        await fetchStationHealth(
          env({ HESTIA_STATION_BASE_URL: unauthorized.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
        ),
      ).toMatchObject({ state: "unauthorized", code: "STATION_AUTH_FAILED" });
    }

    for (const contentType of ["text/html", "application/jsonp"]) {
      const html = await peer((req, res) => {
        res.setHeader("content-type", contentType);
        res.end("<html></html>");
      });
      expect(
        await fetchStationHealth(
          env({ HESTIA_STATION_BASE_URL: html.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
        ),
      ).toMatchObject({ state: "incompatible", code: "STATION_INVALID_CONTENT_TYPE" });
    }

    const large = await peer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ x: "x".repeat(70 * 1024) }));
    });
    expect(
      await fetchStationHealth(
        env({ HESTIA_STATION_BASE_URL: large.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ state: "incompatible", code: "STATION_RESPONSE_TOO_LARGE" });

    const declaredLarge = await peer((req, res) => {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("content-length", String(70 * 1024));
      res.end(validHealth());
    });
    expect(
      await fetchStationHealth(
        env({ HESTIA_STATION_BASE_URL: declaredLarge.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ state: "incompatible", code: "STATION_RESPONSE_TOO_LARGE" });

    for (const body of [
      {
        ok: true,
        schemaVersion: 2,
        service: "hestia-station-agent",
        version: "x",
        checkedAt: new Date().toISOString(),
      },
      {
        ok: true,
        schemaVersion: 1,
        service: "wrong",
        version: "x",
        checkedAt: new Date().toISOString(),
      },
      {
        ok: true,
        schemaVersion: 1,
        service: "hestia-station-agent",
        version: "x",
        checkedAt: "invalid",
      },
    ]) {
      const bad = await peer((req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      });
      expect(
        await fetchStationHealth(
          env({ HESTIA_STATION_BASE_URL: bad.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
        ),
      ).toMatchObject({ state: "incompatible", code: "STATION_CONTRACT_MISMATCH" });
    }
  });

  it("conexão recusada vira indisponível", async () => {
    const p = await peer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(validHealth());
    });
    const baseUrl = p.baseUrl;
    await new Promise((resolve) => p.server.close(resolve));
    servers.splice(servers.indexOf(p.server), 1);

    expect(
      await fetchStationHealth(
        env({ HESTIA_STATION_BASE_URL: baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ state: "unavailable", code: "STATION_UNAVAILABLE" });
  });

  it("não vaza token em status de conexão", async () => {
    const status = await getStationConnectionStatus(
      env({ HESTIA_STATION_BASE_URL: "http://127.0.0.1:1", HESTIA_STATION_TOKEN: "top-secret" }),
    );
    expect(JSON.stringify(status)).not.toContain("top-secret");
  });
});

describe("Station diagnostics client", () => {
  it.each([
    [fetchStationStorageStatus, "/api/station/storage/status", validStorage()],
    [fetchStationServicesStatus, "/api/station/services/status", validServices()],
  ])("reutiliza GET seguro para %s", async (fetchResource, path, body) => {
    const p = await peer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(body);
    });
    const result = await fetchResource(
      env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
    );
    expect(result).toMatchObject({ ok: true, state: "available" });
    expect(p.requests[0]).toMatchObject({ method: "GET", url: path });
    expect(p.requests[0].headers.authorization).toBe("Bearer secret");
    expect(p.requests[0].headers.cookie).toBeUndefined();
    expect(p.requests[0].headers["x-hestia-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("devolve cópia sanitizada e rejeita path ou propriedades extras", async () => {
    const remote = JSON.parse(validStorage());
    const p = await peer((_req, res) => {
      remote.storage.path = "/KALINE";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(remote));
    });
    expect(
      await fetchStationStorageStatus(
        env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ state: "incompatible", code: "STATION_CONTRACT_MISMATCH" });

    const clean = await peer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(validStorage());
    });
    const result = await fetchStationStorageStatus(
      env({ HESTIA_STATION_BASE_URL: clean.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
    );
    expect(Object.keys(result.storage.storage)).toEqual([
      "id",
      "exists",
      "status",
      "totalBytes",
      "usedBytes",
      "freeBytes",
      "percentUsed",
    ]);
  });

  it.each([
    { schemaVersion: 2 },
    { checkedAt: "invalid" },
    {
      storage: {
        id: "kaline",
        exists: true,
        status: "ok",
        totalBytes: -1,
        usedBytes: 0,
        freeBytes: 0,
        percentUsed: 0,
      },
    },
    {
      storage: {
        id: "kaline",
        exists: true,
        status: "ok",
        totalBytes: 1,
        usedBytes: 0,
        freeBytes: 1,
        percentUsed: 101,
      },
    },
    {
      storage: {
        id: "kaline",
        exists: true,
        status: "mystery",
        totalBytes: null,
        usedBytes: null,
        freeBytes: null,
        percentUsed: null,
      },
    },
  ])("rejeita contrato de storage inválido %#", async (override) => {
    const body = JSON.parse(validStorage());
    Object.assign(body, override);
    const p = await peer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    });
    expect(
      await fetchStationStorageStatus(
        env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ code: "STATION_CONTRACT_MISMATCH" });
  });

  it.each([
    [{ id: "docker", active: true, status: "active" }],
    [{ id: "jellyfin", active: false, status: "mystery" }],
    [{ id: "jellyfin", active: false, status: "active" }],
    [
      { id: "tailscaled", active: true, status: "active" },
      { id: "jellyfin", active: true, status: "active" },
    ],
  ])("rejeita contrato de serviços inválido %#", async (services) => {
    const p = await peer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(validServices(services));
    });
    expect(
      await fetchStationServicesStatus(
        env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
      ),
    ).toMatchObject({ code: "STATION_CONTRACT_MISMATCH" });
  });

  it.each([fetchStationStorageStatus, fetchStationServicesStatus])(
    "rejeita autenticação, redirect, content-type e corpo grande em %s",
    async (fetchResource) => {
      for (const setup of [
        (res) => {
          res.statusCode = 403;
          res.end();
        },
        (res) => {
          res.statusCode = 302;
          res.setHeader("location", "https://example.com");
          res.end();
        },
        (res) => {
          res.setHeader("content-type", "text/plain");
          res.end("no");
        },
        (res) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ x: "x".repeat(70 * 1024) }));
        },
      ]) {
        const p = await peer((_req, res) => setup(res));
        const result = await fetchResource(
          env({ HESTIA_STATION_BASE_URL: p.baseUrl, HESTIA_STATION_TOKEN: "secret" }),
        );
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain("secret");
      }
    },
  );

  it.each([fetchStationStorageStatus, fetchStationServicesStatus])(
    "aplica timeout em %s",
    async (fetchResource) => {
      const p = await peer(() => {});
      expect(
        await fetchResource(
          env({
            HESTIA_STATION_BASE_URL: p.baseUrl,
            HESTIA_STATION_TOKEN: "secret",
            HESTIA_STATION_TIMEOUT_MS: "1000",
          }),
        ),
      ).toMatchObject({ state: "unavailable", code: "STATION_TIMEOUT" });
    },
    4000,
  );
});
