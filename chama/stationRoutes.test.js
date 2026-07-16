import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStationRoutes } from "./stationRoutes.js";

const checkedAt = "2026-07-16T12:00:00.000Z";
const health = {
  ok: true,
  schemaVersion: 1,
  service: "hestia-station-agent",
  version: "test",
  checkedAt,
};
const storage = {
  ok: true,
  schemaVersion: 1,
  checkedAt,
  storage: {
    id: "kaline",
    exists: true,
    status: "ok",
    totalBytes: 10,
    usedBytes: 5,
    freeBytes: 5,
    percentUsed: 50,
  },
};
const services = {
  ok: true,
  schemaVersion: 1,
  checkedAt,
  services: [{ id: "tailscaled", active: true, status: "active" }],
};
const codice = {
  ok: true,
  schemaVersion: 1,
  generatedAt: checkedAt,
  libraryAvailable: true,
  formats: ["epub", "pdf"],
};
const response = (body) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

function app(env) {
  const server = Fastify({ logger: false });
  registerStationRoutes(server, env);
  return server;
}

describe("rotas plurais da Console", () => {
  it("expõe exatamente oito leituras e Códice somente na TV Box", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/health") && path.startsWith("/api/codice")) return response(codice);
        if (path.endsWith("/health")) return response(health);
        if (path.includes("/storage/")) return response(storage);
        return response(services);
      }),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
      HESTIA_TVBOX_BASE_URL: "http://127.0.0.1:4519",
      HESTIA_TVBOX_TOKEN: "tvbox-token",
    });
    for (const id of ["desktop", "tvbox"]) {
      for (const suffix of ["connection", "health", "storage/status", "services/status"]) {
        expect((await server.inject(`/api/stations/${id}/${suffix}`)).statusCode).toBe(200);
      }
    }
    expect((await server.inject("/api/stations/tvbox/codice/health")).statusCode).toBe(200);
    expect((await server.inject("/api/stations/desktop/codice/health")).statusCode).toBe(404);
    expect((await server.inject("/api/stations/outro/health")).statusCode).toBe(404);
    expect((await server.inject("/api/station/health")).statusCode).toBe(404);
    expect(
      (await server.inject({ method: "POST", url: "/api/station/organizer/plan" })).statusCode,
    ).toBe(404);
  });

  it("mantém uma Station válida quando a outra está inválida e não vaza configuração", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(health)),
    );
    const secret = "tvbox-secret";
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "url-inválida",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
      HESTIA_TVBOX_BASE_URL: "http://127.0.0.1:4519",
      HESTIA_TVBOX_TOKEN: secret,
    });
    const desktop = await server.inject("/api/stations/desktop/health");
    const tvbox = await server.inject("/api/stations/tvbox/health");
    expect(desktop.statusCode).toBe(503);
    expect(tvbox.statusCode).toBe(200);
    const serialized = `${desktop.body}${tvbox.body}`;
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("127.0.0.1:4519");
  });
});
