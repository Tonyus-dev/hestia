import { describe, expect, it } from "vitest";
import { getStationSystemStatus } from "./systemStatus.js";
import { fetchStationSystemStatus, resolveNamedStationConfig } from "./stationClient.js";

const cfg = resolveNamedStationConfig("pocket", {
  HESTIA_POCKET_BASE_URL: "https://pocket.example",
  HESTIA_POCKET_TOKEN: "pocket-token",
});

function validSystem(overrides = {}) {
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    system: {
      hostname: "station-host",
      platform: "linux",
      release: "6.8.0",
      arch: "x64",
      uptimeSeconds: 123,
      cpu: { model: "cpu", cores: 1, threads: 2, loadAverage: [0.1, 0.2, 0.3], usagePercent: 7.4 },
      memory: { totalBytes: 100, usedBytes: 40, freeBytes: 60, usedPercent: 40 },
      swap: { totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPercent: 0 },
      rootDisk: { totalBytes: 1000, usedBytes: 200, freeBytes: 800, usedPercent: 20 },
      ...overrides,
    },
  };
}

describe("system status", () => {
  it("gera contrato real sem path ou dados sensíveis proibidos", async () => {
    const body = await getStationSystemStatus();
    expect(body.ok).toBe(true);
    expect(body.schemaVersion).toBe(1);
    expect(body.system.hostname).toBeTruthy();
    expect(body.system.arch).toBeTruthy();
    expect(body.system.memory.totalBytes).toBeGreaterThan(0);
    expect(body.system.rootDisk.totalBytes).toBeGreaterThan(0);
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain('"env"');
    expect(serialized).not.toContain('"user"');
    expect(serialized).not.toContain('"ip"');
  });

  it("valida estritamente o contrato remoto", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(validSystem()), {
        headers: { "content-type": "application/json" },
      });
    expect((await fetchStationSystemStatus(cfg)).ok).toBe(true);

    globalThis.fetch = async () =>
      new Response(JSON.stringify(validSystem({ extra: true })), {
        headers: { "content-type": "application/json" },
      });
    expect((await fetchStationSystemStatus(cfg)).code).toBe("STATION_CONTRACT_MISMATCH");

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify(
          validSystem({
            memory: { totalBytes: 100, usedBytes: 101, freeBytes: 0, usedPercent: 101 },
          }),
        ),
        {
          headers: { "content-type": "application/json" },
        },
      );
    expect((await fetchStationSystemStatus(cfg)).code).toBe("STATION_CONTRACT_MISMATCH");
  });
});
