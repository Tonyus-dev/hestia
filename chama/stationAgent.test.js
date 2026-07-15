import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { fetchStationHealth } from "./stationClient.js";
import { registerStationRoutes } from "./stationRoutes.js";
import Fastify from "fastify";
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

async function start(overrides = {}, providers) {
  const app = await startStationAgent(
    {
      host: "127.0.0.1",
      port: 0,
      token,
      allowedHosts: "",
      ...overrides,
    },
    providers,
  );
  apps.push(app);
  const { port } = app.server.address();
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

async function authenticated(baseUrl, path, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
}

function request(baseUrl, options) {
  return fetch(`${baseUrl}/api/station/health`, options);
}

function requestWithHost(baseUrl, host) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      `${baseUrl}/api/station/health`,
      { headers: { Host: host, Authorization: `Bearer ${token}` } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) });
        });
      },
    );
    request.on("error", reject);
  });
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

  it("resolve storage e serviços internos com fallback, allowlist e ordem canônica", () => {
    expect(
      resolveStationAgentConfig({
        HESTIA_STATION_TOKEN: token,
        HESTIA_KALINE_ROOT: "/legacy",
        HESTIA_STATION_SERVICES: " tailscaled,evil,jellyfin,tailscaled ",
      }),
    ).toMatchObject({ storagePath: "/legacy", services: ["jellyfin", "tailscaled"] });
    expect(
      resolveStationAgentConfig({
        HESTIA_STATION_TOKEN: token,
        HESTIA_STORAGE_PATH: "/current",
        HESTIA_KALINE_ROOT: "/legacy",
      }),
    ).toMatchObject({
      storagePath: "/current",
      services: ["jellyfin", "smbd", "tailscaled"],
    });
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

  it("rejeita Host não permitido pelo HTTP real", async () => {
    const { baseUrl } = await start();
    const response = await requestWithHost(baseUrl, "attacker.example");
    expect(response.status).toBe(421);
    expect(response.body).toEqual({ ok: false, error: "host_not_allowed" });
  });

  it("aceita Host exato da allowlist pelo HTTP real", async () => {
    const { baseUrl } = await start({ allowedHosts: "station.example.test" });
    const response = await requestWithHost(baseUrl, "station.example.test");
    expect(response.status).toBe(200);
    const body = response.body;
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

  it("publica storage sanitizado com contrato exato", async () => {
    const getStorageStatus = async () => ({
      checkedAt: new Date().toISOString(),
      items: [
        {
          path: "/secret/KALINE",
          error: "raw error",
          exists: true,
          status: "ok",
          total: 1000,
          used: 500,
          free: 500,
          percentUsed: 50,
        },
      ],
    });
    const { baseUrl } = await start({}, { getStorageStatus });
    const response = await authenticated(baseUrl, "/api/station/storage/status");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(["ok", "schemaVersion", "checkedAt", "storage"]);
    expect(Object.keys(body.storage)).toEqual([
      "id",
      "exists",
      "status",
      "totalBytes",
      "usedBytes",
      "freeBytes",
      "percentUsed",
    ]);
    expect(body.storage).toEqual({
      id: "kaline",
      exists: true,
      status: "ok",
      totalBytes: 1000,
      usedBytes: 500,
      freeBytes: 500,
      percentUsed: 50,
    });
    expect(JSON.stringify(body)).not.toContain("/secret");
    expect(JSON.stringify(body)).not.toContain("raw error");
  });

  it.each([
    ["missing", false],
    ["unavailable", true],
  ])("normaliza storage %s sem derrubar o Agent", async (status, exists) => {
    const { baseUrl } = await start(
      {},
      {
        getStorageStatus: async () => ({
          checkedAt: new Date().toISOString(),
          items: [{ path: "/hidden", exists, status, error: "hidden" }],
        }),
      },
    );
    const response = await authenticated(baseUrl, "/api/station/storage/status");
    expect(response.status).toBe(200);
    expect((await response.json()).storage).toMatchObject({
      exists,
      status,
      totalBytes: null,
      usedBytes: null,
      freeBytes: null,
      percentUsed: null,
    });
  });

  it("publica serviços sanitizados, determinísticos e sem consultar nome proibido", async () => {
    const calls = [];
    const { baseUrl } = await start(
      { services: ["jellyfin", "tailscaled"] },
      {
        getServicesStatus: async (names) => {
          calls.push(names);
          return {
            items: [
              { name: "jellyfin", active: false, status: "not-installed", checkedAt: "hidden" },
              { name: "tailscaled", active: false, status: "unavailable", stdout: "/hidden" },
            ],
          };
        },
      },
    );
    const response = await authenticated(baseUrl, "/api/station/services/status");
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["ok", "schemaVersion", "checkedAt", "services"]);
    expect(body.services).toEqual([
      { id: "jellyfin", active: false, status: "not-installed" },
      { id: "tailscaled", active: false, status: "unavailable" },
    ]);
    expect(body.services.map(Object.keys)).toEqual([
      ["id", "active", "status"],
      ["id", "active", "status"],
    ]);
    expect(calls).toEqual([["jellyfin", "tailscaled"]]);
    expect(JSON.stringify(body)).not.toContain("hidden");
  });

  it("usa df real em diretório temporário e remove o path público", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hestia-storage-"));
    try {
      const { baseUrl } = await start({ storagePath: directory });
      const response = await authenticated(baseUrl, "/api/station/storage/status");
      const body = await response.json();
      expect(body.storage.status).toBe("ok");
      expect(body.storage.totalBytes).toBeGreaterThanOrEqual(0);
      expect(body.storage.usedBytes).toBeGreaterThanOrEqual(0);
      expect(body.storage.freeBytes).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(body)).not.toContain(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("faz Console → Client → Agent por HTTP real sem fallback local", async () => {
    const station = await start(
      {},
      {
        getStorageStatus: async () => ({
          checkedAt: new Date().toISOString(),
          items: [{ exists: true, status: "ok", total: 777, used: 7, free: 770, percentUsed: 1 }],
        }),
      },
    );
    const consoleApp = Fastify({ logger: false });
    registerStationRoutes(consoleApp, {
      NODE_ENV: "test",
      HESTIA_STATION_BASE_URL: station.baseUrl,
      HESTIA_STATION_TOKEN: token,
    });
    await consoleApp.listen({ host: "127.0.0.1", port: 0 });
    apps.push(consoleApp);
    const { port } = consoleApp.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/station/storage/status`);
    expect(response.status).toBe(200);
    expect((await response.json()).storage.totalBytes).toBe(777);
  });

  it("Console mapeia falha da Estação sem vazar token ou URL", async () => {
    const station = await start();
    const secret = "wrong-secret-value";
    const consoleApp = Fastify({ logger: false });
    registerStationRoutes(consoleApp, {
      NODE_ENV: "test",
      HESTIA_STATION_BASE_URL: station.baseUrl,
      HESTIA_STATION_TOKEN: secret,
    });
    await consoleApp.listen({ host: "127.0.0.1", port: 0 });
    apps.push(consoleApp);
    const { port } = consoleApp.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/station/storage/status`);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(Object.keys(body)).toEqual(["ok", "code", "state", "error", "checkedAt"]);
    expect(body).toMatchObject({
      ok: false,
      code: "STATION_AUTH_FAILED",
      state: "unauthorized",
      error: "Station storage indisponível",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain(station.baseUrl);
  });

  it("mantém autenticação, Host Guard, health e 404 nas novas rotas", async () => {
    const { baseUrl } = await start();
    expect((await fetch(`${baseUrl}/api/station/storage/status`)).status).toBe(401);
    expect((await requestWithHost(baseUrl, "attacker.example")).status).toBe(421);
    expect((await authenticated(baseUrl, "/api/station/health")).status).toBe(200);
    expect((await authenticated(baseUrl, "/unknown")).status).toBe(404);
  });
});
