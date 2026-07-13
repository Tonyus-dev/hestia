import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage.js", () => ({
  getStorageStatus: vi.fn(() => {
    throw new Error("STORAGE_MUST_NOT_BE_CALLED");
  }),
}));

const { config } = await import("./config.js");
const { getHealth } = await import("./health.js");
const { getHardwareStatus } = await import("./hardware.js");
const { getPresenceSummary } = await import("./presenceSummary.js");
const { generateSnapshot, runSnapshotCycle, getLatestSnapshot } = await import("./snapshots.js");
const { getStorageStatus } = await import("./storage.js");

describe("console runtime storage boundary", () => {
  let dataDir;
  let oldDataDir;
  let oldStationBaseUrl;
  let oldStoragePath;
  let oldKalineRoot;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "hestia-console-boundary-"));
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
    await fs.mkdir(join(dataDir, "snapshots"), { recursive: true });
    oldDataDir = process.env.HESTIA_DATA_DIR;
    oldStationBaseUrl = process.env.HESTIA_STATION_BASE_URL;
    oldStoragePath = process.env.HESTIA_STORAGE_PATH;
    oldKalineRoot = process.env.HESTIA_KALINE_ROOT;
    process.env.HESTIA_DATA_DIR = dataDir;
    delete process.env.HESTIA_STATION_BASE_URL;
    delete process.env.HESTIA_STORAGE_PATH;
    delete process.env.HESTIA_KALINE_ROOT;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (oldDataDir === undefined) delete process.env.HESTIA_DATA_DIR;
    else process.env.HESTIA_DATA_DIR = oldDataDir;
    if (oldStationBaseUrl === undefined) delete process.env.HESTIA_STATION_BASE_URL;
    else process.env.HESTIA_STATION_BASE_URL = oldStationBaseUrl;
    if (oldStoragePath === undefined) delete process.env.HESTIA_STORAGE_PATH;
    else process.env.HESTIA_STORAGE_PATH = oldStoragePath;
    if (oldKalineRoot === undefined) delete process.env.HESTIA_KALINE_ROOT;
    else process.env.HESTIA_KALINE_ROOT = oldKalineRoot;
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("config sem env retorna stationBaseUrl null e não possui storage global", () => {
    expect(config.stationBaseUrl).toBeNull();
    expect(config).not.toHaveProperty("storageRoot");
    expect(config).not.toHaveProperty("storagePaths");
  });

  it("health, hardware, presence e snapshot não chamam getStorageStatus", async () => {
    expect(getHealth().ok).toBe(true);
    const hardware = await getHardwareStatus();
    expect(hardware).not.toHaveProperty("storage");

    const summary = await getPresenceSummary(dataDir);
    expect(summary).not.toHaveProperty("storageSummary");

    const snapshot = await generateSnapshot();
    expect(snapshot).not.toHaveProperty("storage");

    expect(getStorageStatus).not.toHaveBeenCalled();
  });

  it("ciclo de snapshot e leitura latest funcionam sem KALINE e sem fallback storage", async () => {
    await runSnapshotCycle(dataDir);
    const latest = await getLatestSnapshot(dataDir);

    expect(latest.server).toBeDefined();
    expect(latest.services).toBeDefined();
    expect(latest).not.toHaveProperty("storage");
    expect(getStorageStatus).not.toHaveBeenCalled();
  });
});
