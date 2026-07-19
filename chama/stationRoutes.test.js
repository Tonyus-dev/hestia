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
const system = {
  ok: true,
  schemaVersion: 1,
  checkedAt,
  system: {
    hostname: "station-host",
    platform: "linux",
    release: "6.8",
    arch: "x64",
    uptimeSeconds: 10,
    cpu: { model: "cpu", cores: 1, threads: 1, loadAverage: [0, 0, 0], usagePercent: 0 },
    memory: { totalBytes: 100, usedBytes: 50, freeBytes: 50, usedPercent: 50 },
    swap: { totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPercent: 0 },
    rootDisk: { totalBytes: 100, usedBytes: 10, freeBytes: 90, usedPercent: 10 },
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
        if (path === "/api/station/codice/health") return response(codice);
        if (path.endsWith("/health")) return response(health);
        if (path.includes("/system/")) return response(system);
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
      HESTIA_POCKET_BASE_URL: "http://127.0.0.1:4520",
      HESTIA_POCKET_TOKEN: "pocket-token",
      HESTIA_BABY_BASE_URL: "http://127.0.0.1:4521",
      HESTIA_BABY_TOKEN: "baby-token",
    });
    for (const id of ["desktop", "tvbox", "pocket", "baby"]) {
      for (const suffix of [
        "connection",
        "health",
        "system/status",
        "storage/status",
        "services/status",
      ]) {
        expect((await server.inject(`/api/stations/${id}/${suffix}`)).statusCode).toBe(200);
      }
    }
    expect((await server.inject("/api/stations/tvbox/codice/health")).statusCode).toBe(200);
    expect((await server.inject("/api/stations/desktop/codice/health")).statusCode).toBe(404);
    expect((await server.inject("/api/stations/pocket/codice/health")).statusCode).toBe(404);
    expect((await server.inject("/api/stations/baby/organizer/runs")).statusCode).toBe(404);
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
      payload: { extensions: [] },
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

describe("contrato Console Organizer plan/apply", () => {
  it("normaliza filtro, envia query e mantém body remoto vazio", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return response(organizerPlan);
      }),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    });
    const result = await server.inject({
      method: "POST",
      url: "/api/stations/desktop/organizer/plan",
      payload: { extensions: [".MKV", ".mkv", ".srt"] },
    });
    expect(result.statusCode).toBe(200);
    expect(new URL(calls[0].url).search).toBe("?extensions=.mkv%2C.srt");
    expect(calls[0].init.body).toBe("{}");
    expect(`${result.body}`).not.toContain("desktop-secret");
  });

  it("rejeita filtro inválido, chave extra e excesso", async () => {
    const server = app({ NODE_ENV: "test" });
    for (const payload of [
      { extensions: ["mkv"] },
      { extensions: [".mk v"] },
      { extensions: [".mkv"], path: "/tmp" },
      { extensions: Array.from({ length: 101 }, (_, i) => `.x${i}`) },
    ]) {
      const result = await server.inject({
        method: "POST",
        url: "/api/stations/desktop/organizer/plan",
        payload,
      });
      expect(result.statusCode).toBe(400);
    }
  });

  it("proxya apply real com body mínimo, confirmação e header grande opcional", async () => {
    const calls = [];
    const run = {
      ok: true,
      schemaVersion: 1,
      checkedAt,
      run: {
        runId: "org_123_abcdef12",
        planId: "plan_123_abcdef12",
        kind: "apply",
        status: "applied",
        createdAt: checkedAt,
        appliedAt: checkedAt,
        operations: [],
        summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return response(run);
      }),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    });
    const plain = await server.inject({
      method: "POST",
      url: "/api/stations/desktop/organizer/apply",
      payload: {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: null,
      },
    });
    const large = await server.inject({
      method: "POST",
      url: "/api/stations/desktop/organizer/apply",
      payload: {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: "plan_123_abcdef12",
      },
    });
    expect(plain.statusCode).toBe(200);
    expect(large.statusCode).toBe(200);
    expect(new URL(calls[0].url).pathname).toBe("/api/station/organizer/apply");
    expect(JSON.parse(calls[0].init.body)).toEqual({ planId: "plan_123_abcdef12", mode: "apply" });
    expect(calls[0].init.headers["X-Hestia-Local-Confirm"]).toBe("organize");
    expect(calls[0].init.headers["X-Hestia-Large-Plan-Confirm"]).toBeUndefined();
    expect(calls[1].init.headers["X-Hestia-Large-Plan-Confirm"]).toBe("plan_123_abcdef12");
    expect(`${plain.body}${large.body}`).not.toContain("desktop-secret");
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/stations/tvbox/organizer/apply",
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });

  it("rejeita apply com planId, confirmação, chaves e paths inválidos", async () => {
    const server = app({ NODE_ENV: "test" });
    for (const payload of [
      { planId: "bad", confirmation: "EFETIVAR", largePlanConfirmation: null },
      { planId: "plan_123_abcdef12", confirmation: "APLICAR", largePlanConfirmation: null },
      {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: "plan_999_abcdef12",
      },
      {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: null,
        path: "/tmp",
      },
      {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: null,
        items: [],
      },
    ]) {
      const result = await server.inject({
        method: "POST",
        url: "/api/stations/desktop/organizer/apply",
        payload,
      });
      expect(result.statusCode).toBe(400);
    }
  });

  it("preserva erros de domínio do apply sem virar disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, code: "EPLANNOTFOUND", error: "Plano não encontrado" }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    const server = app({
      NODE_ENV: "test",
      HESTIA_DESKTOP_BASE_URL: "http://127.0.0.1:4518",
      HESTIA_DESKTOP_TOKEN: "desktop-secret",
    });
    const result = await server.inject({
      method: "POST",
      url: "/api/stations/desktop/organizer/apply",
      payload: {
        planId: "plan_123_abcdef12",
        confirmation: "EFETIVAR",
        largePlanConfirmation: null,
      },
    });
    expect(result.statusCode).toBe(404);
    expect(result.json()).toMatchObject({ code: "EPLANNOTFOUND" });
  });
});
