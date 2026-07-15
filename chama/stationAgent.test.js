import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { fetchStationHealth } from "./stationClient.js";
import {
  createStationAgent,
  resolveStationAgentConfig,
  startStationAgent,
} from "./stationAgent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
const token = "station-test-token";
const apps = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start() {
  const app = await startStationAgent({
    host: "127.0.0.1",
    port: 0,
    token,
    allowedHosts: "",
  });
  apps.push(app);
  const { port } = app.server.address();
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

function request(baseUrl, options) {
  return fetch(`${baseUrl}/api/station/health`, options);
}

describe("Station Agent", () => {
  it("falha imediatamente sem token e protege bind não-loopback", () => {
    expect(() => resolveStationAgentConfig({})).toThrow("HESTIA_STATION_TOKEN é obrigatório");
    expect(() =>
      resolveStationAgentConfig({
        HESTIA_STATION_TOKEN: token,
        HESTIA_STATION_HOST: "0.0.0.0",
      }),
    ).toThrow("bind não-loopback exige HESTIA_STATION_ALLOWED_HOSTS");
    expect(() =>
      resolveStationAgentConfig({
        HESTIA_STATION_TOKEN: token,
        HESTIA_STATION_ALLOWED_HOSTS: "*",
      }),
    ).toThrow("não aceita wildcard");
  });

  it("retorna o contrato exato com autenticação correta", async () => {
    const { baseUrl } = await start();
    const response = await request(baseUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["ok", "schemaVersion", "service", "version", "checkedAt"]);
    expect(body).toEqual({
      ok: true,
      schemaVersion: 1,
      service: "hestia-station-agent",
      version: pkg.version,
      checkedAt: body.checkedAt,
    });
    expect(new Date(body.checkedAt).toISOString()).toBe(body.checkedAt);
  });

  it.each([
    [undefined, 401],
    ["Basic abc", 401],
    ["Bearer", 401],
    ["Bearer wrong-token", 403],
  ])("normaliza autenticação %s como %i", async (authorization, status) => {
    const { baseUrl } = await start();
    const headers = authorization ? { Authorization: authorization } : {};
    const response = await request(baseUrl, { headers });
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain(token);
  });

  it("retorna 404 em rota desconhecida", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/unknown`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("integra com fetchStationHealth real e rejeita token incorreto", async () => {
    const { baseUrl } = await start();
    const good = await fetchStationHealth({
      NODE_ENV: "test",
      HESTIA_STATION_BASE_URL: baseUrl,
      HESTIA_STATION_TOKEN: token,
    });
    expect(good).toMatchObject({
      ok: true,
      state: "available",
      station: { service: "hestia-station-agent", version: pkg.version },
    });
    const bad = await fetchStationHealth({
      NODE_ENV: "test",
      HESTIA_STATION_BASE_URL: baseUrl,
      HESTIA_STATION_TOKEN: "wrong-token",
    });
    expect(bad).toMatchObject({
      ok: false,
      state: "unauthorized",
      code: "STATION_AUTH_FAILED",
    });
  });

  it("encerramento libera a porta", async () => {
    const first = createStationAgent({ host: "127.0.0.1", port: 0, token, allowedHosts: "" });
    await first.listen({ host: "127.0.0.1", port: 0 });
    const { port } = first.server.address();
    await first.close();
    const second = createStationAgent({ host: "127.0.0.1", port, token, allowedHosts: "" });
    await second.listen({ host: "127.0.0.1", port });
    await second.close();
  });
});
