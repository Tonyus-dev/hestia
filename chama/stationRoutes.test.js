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
const organizerPlan = {
  ok: true,
  schemaVersion: 1,
  checkedAt,
  plan: {
    planId: "plan_123_abcdef12",
    generatedAt: checkedAt,
    dryRun: true,
    requiresExtraConfirmation: false,
    planned: 0,
    items: [],
    summary: {
      total: 0,
      planned: 0,
      conflicts: 0,
      ignored: 0,
      quarantined: 0,
      byExtension: {},
      byTargetArea: {},
    },
  },
};
const organizerRuns = { ok: true, schemaVersion: 1, checkedAt, items: [] };
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

  it("proxya apenas plan e runs do Organizer desktop com Bearer server-side", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return response(new URL(url).pathname.endsWith("/plan") ? organizerPlan : organizerRuns);
      }),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    });
    const plan = await server.inject({
      method: "POST",
      url: "/api/stations/desktop/organizer/plan",
      payload: {},
    });
    const runs = await server.inject("/api/stations/desktop/organizer/runs");
    expect(plan.statusCode).toBe(200);
    expect(runs.statusCode).toBe(200);
    expect(calls[0].init.headers.Authorization).toBe("Bearer desktop-secret");
    expect(calls[0].init.headers["X-Hestia-Local-Confirm"]).toBe("organize");
    expect(calls[0].init.body).toBe("{}");
    expect(calls[1].init.headers.Authorization).toBe("Bearer desktop-secret");
    expect(`${plan.body}${runs.body}`).not.toContain("desktop-secret");
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/stations/desktop/organizer/plan",
          payload: { path: "/tmp" },
        })
      ).statusCode,
    ).toBe(400);
    expect((await server.inject("/api/stations/tvbox/organizer/runs")).statusCode).toBe(404);
  });

  it("distingue Organizer desativado de Station indisponível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    });
    const result = await server.inject("/api/stations/desktop/organizer/runs");
    expect(result.statusCode).toBe(503);
    expect(result.json()).toMatchObject({ code: "ORGANIZER_DISABLED", state: "disabled" });
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
