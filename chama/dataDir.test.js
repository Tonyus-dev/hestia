import { describe, it, expect } from "vitest";
import { resolveDataDir } from "./dataDir.js";

describe("resolveDataDir", () => {
  it("prioriza HESTIA_DATA_DIR sobre tudo", () => {
    const dir = resolveDataDir({
      HESTIA_DATA_DIR: "/custom/data",
      STATE_DIRECTORY: "/var/lib/hestia-console",
      HOME: "/home/x",
    });
    expect(dir).toBe("/custom/data");
  });

  it("usa STATE_DIRECTORY (systemd) quando HESTIA_DATA_DIR não está setado", () => {
    const dir = resolveDataDir({ STATE_DIRECTORY: "/var/lib/hestia-console", HOME: "/home/x" });
    expect(dir).toBe("/var/lib/hestia-console");
  });

  it("usa só o primeiro diretório se STATE_DIRECTORY tiver múltiplos separados por ':'", () => {
    const dir = resolveDataDir({ STATE_DIRECTORY: "/var/lib/a:/var/lib/b", HOME: "/home/x" });
    expect(dir).toBe("/var/lib/a");
  });

  it("cai para <homedir>/.chama/data quando nada está setado", () => {
    const dir = resolveDataDir({}, () => "/home/x");
    expect(dir.replace(/\\/g, "/")).toBe("/home/x/.chama/data");
  });
});
