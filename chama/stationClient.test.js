import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STATION_IDS,
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  fetchTvboxCodiceHealth,
  fetchDesktopOrganizerPlan,
  fetchDesktopOrganizerRuns,
  hasLegacyStationConfig,
  resolveOrganizerTimeout,
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
const organizerPlan = () => ({
  ok: true,
  schemaVersion: 1,
  checkedAt: now(),
  ignoredTopLevel: "omitido",
  plan: {
    planId: "plan_123_abcdef12",
    generatedAt: now(),
    dryRun: true,
    requiresExtraConfirmation: false,
    largePlanThreshold: 500,
    planned: 1,
    items: [
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        source: { kind: "entrada", label: "Entrada manual", relativePath: "documento.pdf" },
        target: { relativePath: "codice/pdf/2026/07/documento.pdf" },
        action: "move",
        reason: "pdf para biblioteca",
        risk: "low",
        status: "planned",
        size: 42,
        mtimeIso: now(),
        ignoredReason: null,
        unknown: "omitido",
      },
    ],
    summary: {
      total: 1,
      planned: 1,
      conflicts: 0,
      ignored: 0,
      quarantined: 0,
      byExtension: { ".pdf": 1 },
      byTargetArea: { "codice/pdf": 1 },
      rules: { fallback: "entrada/revisar" },
    },
  },
});
const organizerRuns = () => ({
  ok: true,
  schemaVersion: 1,
  checkedAt: now(),
  ignoredTopLevel: true,
  items: [
    {
      runId: "org_123_abcdef12",
      status: "applied",
      undoOf: null,
      undoneBy: "undo_124_abcdef13",
      redoOf: null,
      redoneBy: null,
      unknown: "omitido",
    },
  ],
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("configuração explícita das quatro Stations", () => {
  it("mantém IDs canônicos e isolamento Pocket/Baby", () => {
    expect(STATION_IDS).toEqual(["desktop", "tvbox", "pocket", "baby"]);
    const env = {
      NODE_ENV: "test",
      HESTIA_POCKET_BASE_URL: "http://127.0.0.1:4520",
      HESTIA_POCKET_TOKEN: "pocket-secret",
      HESTIA_BABY_BASE_URL: "http://127.0.0.1:4521",
      HESTIA_BABY_TOKEN: "baby-secret",
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
    expect(JSON.stringify(resolveNamedStationConfig("baby", env))).not.toContain("pocket-secret");
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
    const both = {
      ...onlyDesktop,
      HESTIA_TVBOX_BASE_URL: "http://127.0.0.1:4519",
      HESTIA_TVBOX_TOKEN: "tvbox-secret",
    };
    expect(resolveNamedStationConfig("tvbox", both)).toMatchObject({ valid: true });
    expect(
      resolveNamedStationConfig("desktop", { HESTIA_DESKTOP_BASE_URL: "https://desktop.example" }),
    ).toMatchObject({ valid: false, errorCode: "STATION_MISCONFIGURED" });
    expect(resolveNamedStationConfig("tvbox", { HESTIA_TVBOX_TOKEN: "orphan" })).toMatchObject({
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

  it("resolve o timeout dedicado do Organizer com padrão e limites estritos", () => {
    expect(resolveOrganizerTimeout()).toBe(120000);
    expect(resolveOrganizerTimeout("5000")).toBe(5000);
    expect(resolveOrganizerTimeout("600000")).toBe(600000);
    for (const invalid of ["", "4999", "600001", "1.5", "invalido"]) {
      expect(resolveOrganizerTimeout(invalid)).toBe(120000);
    }
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

  it("Organizer usa apenas desktop, autenticação e confirmação server-side", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), init });
        return json(String(url).endsWith("/plan") ? organizerPlan() : organizerRuns());
      }),
    );
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    expect((await fetchDesktopOrganizerPlan(desktop)).ok).toBe(true);
    expect((await fetchDesktopOrganizerRuns(desktop)).ok).toBe(true);
    expect(calls[0].init.headers.Authorization).toBe("Bearer desktop-token");
    expect(calls[0].init.headers["X-Hestia-Local-Confirm"]).toBe("organize");
    expect(calls[0].init.headers).not.toHaveProperty("token");
    await expect(
      fetchDesktopOrganizerPlan({ ...desktop, stationId: "tvbox" }),
    ).resolves.toMatchObject({ ok: false, code: "STATION_MISCONFIGURED" });
  });

  it("reconstrói plano e runs somente com campos conhecidos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => json(String(url).endsWith("/plan") ? organizerPlan() : organizerRuns())),
    );
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    const plan = await fetchDesktopOrganizerPlan(desktop);
    const runs = await fetchDesktopOrganizerRuns(desktop);
    expect(plan).not.toHaveProperty("ignoredTopLevel");
    expect(plan.plan).not.toHaveProperty("largePlanThreshold");
    expect(plan.plan.summary).not.toHaveProperty("rules");
    expect(plan.plan.items[0]).not.toHaveProperty("unknown");
    expect(runs).not.toHaveProperty("ignoredTopLevel");
    expect(runs.items[0]).not.toHaveProperty("unknown");
    expect(runs.items[0]).toEqual({
      runId: "org_123_abcdef12",
      status: "applied",
      undoOf: null,
      undoneBy: "undo_124_abcdef13",
      redoOf: null,
      redoneBy: null,
    });
  });

  it.each([
    ["planId", (body) => (body.plan.planId = "../plan")],
    ["generatedAt", (body) => (body.plan.generatedAt = "ontem")],
    ["dryRun", (body) => (body.plan.dryRun = false)],
    ["requiresExtraConfirmation", (body) => (body.plan.requiresExtraConfirmation = "não")],
    ["planned", (body) => (body.plan.planned = -1)],
    ["item id", (body) => (body.plan.items[0].id = "item")],
    ["source kind", (body) => (body.plan.items[0].source.kind = "ruim\0")],
    ["source label", (body) => (body.plan.items[0].source.label = "")],
    ["source path", (body) => (body.plan.items[0].source.relativePath = "../segredo")],
    ["target path", (body) => (body.plan.items[0].target.relativePath = "/segredo")],
    ["action", (body) => (body.plan.items[0].action = "delete")],
    ["reason", (body) => (body.plan.items[0].reason = 42)],
    ["risk", (body) => (body.plan.items[0].risk = "critical")],
    ["status", (body) => (body.plan.items[0].status = "applied")],
    ["size", (body) => (body.plan.items[0].size = -1)],
    ["mtimeIso", (body) => (body.plan.items[0].mtimeIso = "agora")],
    ["ignoredReason", (body) => (body.plan.items[0].ignoredReason = 1)],
    ["summary count", (body) => (body.plan.summary.conflicts = -1)],
    ["summary map", (body) => (body.plan.summary.byExtension[".pdf"] = 1.5)],
    ["dangerous extra", (body) => (body.plan.token = "segredo")],
    ["absolute extra", (body) => (body.plan.debug = "C:\\segredo")],
  ])("rejeita contrato de plano inválido: %s", async (_name, mutate) => {
    const body = organizerPlan();
    mutate(body);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(body)),
    );
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    await expect(fetchDesktopOrganizerPlan(desktop)).resolves.toMatchObject({
      ok: false,
      code: "STATION_CONTRACT_MISMATCH",
    });
  });

  it("rejeita runs parciais, status inválido e dados perigosos", async () => {
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
    });
    for (const mutate of [
      (body) => (body.items[0].runId = "run"),
      (body) => (body.items[0].status = "running"),
      (body) => (body.items[0].undoOf = "invalido"),
      (body) => (body.items[0].sourcePath = "/privado"),
      (body) => (body.items[0].note = "controle\n"),
    ]) {
      const body = organizerRuns();
      mutate(body);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(body)),
      );
      await expect(fetchDesktopOrganizerRuns(desktop)).resolves.toMatchObject({
        ok: false,
        code: "STATION_CONTRACT_MISMATCH",
      });
    }
  });

  it("plan não aborta em 5s, respeita timeout dedicado e health mantém o timeout normal", async () => {
    vi.useFakeTimers();
    const signals = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url, init) =>
          await new Promise((_resolve, reject) => {
            signals.push(init.signal);
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const desktop = resolveNamedStationConfig("desktop", {
      HESTIA_DESKTOP_BASE_URL: "https://desktop.example",
      HESTIA_DESKTOP_TOKEN: "desktop-token",
      HESTIA_STATION_TIMEOUT_MS: "1000",
      HESTIA_ORGANIZER_TIMEOUT_MS: "6000",
    });
    const planPromise = fetchDesktopOrganizerPlan(desktop);
    await vi.advanceTimersByTimeAsync(5000);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(planPromise).resolves.toMatchObject({ code: "STATION_TIMEOUT" });

    const healthPromise = fetchStationHealth(desktop);
    await vi.advanceTimersByTimeAsync(999);
    expect(signals[1].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(healthPromise).resolves.toMatchObject({ code: "STATION_TIMEOUT" });
  });
});
