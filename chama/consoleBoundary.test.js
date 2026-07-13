import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getHealth } from "./health.js";
import { getHardwareStatus } from "./hardware.js";

describe("console boundary", () => {
  it("health describes only the notebook and does not report KALINE storage", () => {
    const health = getHealth();
    expect(health.ok).toBe(true);
    expect(health).not.toHaveProperty("storageRoot");
    expect(health).not.toHaveProperty("storageSources");
    expect(health).not.toHaveProperty("kalineMounted");
    expect(health).not.toHaveProperty("kalineWritable");
  });

  it("hardware status does not include canonical storage", async () => {
    const hardware = await getHardwareStatus();
    expect(hardware.cpu).toBeDefined();
    expect(hardware.memory).toBeDefined();
    expect(hardware.services).toBeDefined();
    expect(hardware).not.toHaveProperty("storage");
  });

  it("console runtime does not register storage, organizer, or codice endpoints", () => {
    const server = readFileSync(join(process.cwd(), "hestia.js"), "utf8");
    expect(server).not.toContain('app.get("/api/storage');
    expect(server).not.toContain('app.post("/api/local/organizer');
    expect(server).not.toContain("registerCodiceRoutes(app");
  });

  it("installation scripts and systemd units do not create or grant /KALINE", () => {
    for (const file of [
      "../scripts/install.sh",
      "../packaging/hestia-console.service",
      "../packaging/hestia-console.service.in",
      "../packaging/debian/postinst",
    ]) {
      if (!existsSync(join(process.cwd(), file.replace(/^\.\.\//, "")))) continue;
      const text = readFileSync(join(process.cwd(), file.replace(/^\.\.\//, "")), "utf8");
      expect(text).not.toContain("/KALINE");
      expect(text).not.toContain("ReadWritePaths");
      expect(text).not.toContain("HESTIA_STORAGE_PATH");
    }
  });
});
