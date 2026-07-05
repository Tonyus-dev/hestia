import { describe, expect, it } from "vitest";
import {
  classifyCpu,
  classifyDisk,
  classifyMemory,
  classifySwap,
  getHardwareConfig,
  getHardwareStatus,
} from "./hardware.js";

describe("hardware diagnostics", () => {
  it("classifies thresholds", () => {
    expect(classifyCpu(0.8)).toBe("ok");
    expect(classifyCpu(0.81)).toBe("warn");
    expect(classifyCpu(1.51)).toBe("critical");
    expect(classifyMemory(91)).toBe("critical");
    expect(classifySwap(null)).toBe("ok");
    expect(classifyDisk("/KALINE", false, null)).toBe("critical");
  });

  it("getHardwareStatus returns schema even without requiring temperature", async () => {
    const status = await getHardwareStatus();
    expect(status.generatedAt).toEqual(expect.any(String));
    expect(status.temperature).toMatchObject({
      available: expect.any(Boolean),
      sensors: expect.any(Array),
    });
    expect(status.cpu.threads).toBeGreaterThan(0);
  });

  it("getHardwareConfig falls back when lsblk is unavailable and does not require root", async () => {
    const config = await getHardwareConfig(async () => {
      const err = new Error("missing");
      err.code = "ENOENT";
      throw err;
    });
    expect(config.disks).toEqual({ available: false, items: [], error: "lsblk indisponível" });
    expect(config.hostname).toEqual(expect.any(String));
  });
});
