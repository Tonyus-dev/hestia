import { describe, it, expect } from "vitest";
import { getCapabilities } from "./capabilities.js";

describe("getCapabilities", () => {
  it("retorna capabilities com mode 'local-write-with-approval'", () => {
    const caps = getCapabilities();
    expect(caps.mode).toBe("local-write-with-approval");
  });

  it("habilita leitura de health/metrics/events/snapshots/logs/config", () => {
    const caps = getCapabilities();
    expect(caps.reading.health).toBe(true);
    expect(caps.reading.metrics).toBe(true);
    expect(caps.reading.events).toBe(true);
    expect(caps.reading.snapshots).toBe(true);
    expect(caps.reading.logs).toBe(true);
    expect(caps.reading.config).toBe(true);
  });

  it("habilita só modifyStorage; todo o resto continua desabilitado", () => {
    const caps = getCapabilities();
    expect(caps.writing.executeCommands).toBe(false);
    expect(caps.writing.configureServices).toBe(false);
    expect(caps.writing.manageBackups).toBe(false);
    expect(caps.writing.modifyStorage).toBe(true);
    expect(caps.writing.manageUsers).toBe(false);
  });
});
