import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchStationHealth,
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
