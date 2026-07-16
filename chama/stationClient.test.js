import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
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

afterEach(() => vi.unstubAllGlobals());

describe("configuração explícita das duas Stations", () => {
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

  it("Códice consulta somente a TV Box e nunca envia Bearer", async () => {
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
    expect(String(url)).toBe("https://tvbox.example/api/codice/health");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(
      JSON.stringify(await fetchTvboxCodiceHealth({ ...config, stationId: "desktop" })),
    ).not.toContain("station-secret");
  });
});
