import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { registerOrganizerRoutes } from "./organizerRoutes.js";

async function makeTmpDir(prefix) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function countPlanFiles(dataDir) {
  const dir = path.join(dataDir, "organizer", "plans");
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

describe("Organizer HTTP contract", () => {
  let dataDir;
  let rootDir;
  let sourcePath;
  let targetPath;
  let app;

  beforeEach(async () => {
    dataDir = await makeTmpDir("hestia-http-data-");
    rootDir = await makeTmpDir("hestia-http-root-");
    process.env.HESTIA_STORAGE_PATH = rootDir;

    sourcePath = path.join(rootDir, "entrada", "manual", "entrada.pdf");
    targetPath = path.join(rootDir, "codice", "pdf", "2026", "07", "entrada.pdf");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, "pdf content");
    const oldDate = new Date("2026-07-10T00:00:00.000Z");
    await fs.utimes(sourcePath, oldDate, oldDate);

    app = Fastify();
    registerOrganizerRoutes(app, { dataDir });
  });

  afterEach(async () => {
    delete process.env.HESTIA_STORAGE_PATH;
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("usa as rotas reais e cobre plan -> apply -> undo -> redo no filesystem", async () => {
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("pdf content");
    await expect(fs.stat(targetPath)).rejects.toThrow();

    const missingHeader = await app.inject({
      method: "POST",
      url: "/api/local/organizer/plan",
    });
    expect(missingHeader.statusCode).toBe(403);
    expect(JSON.parse(missingHeader.payload).code).toBe("EMISSINGCONFIRM");

    const wrongHeader = await app.inject({
      method: "POST",
      url: "/api/local/organizer/plan",
      headers: { "x-hestia-local-confirm": "wrong" },
    });
    expect(wrongHeader.statusCode).toBe(403);
    expect(await countPlanFiles(dataDir)).toBe(0);

    const oldGet = await app.inject({ method: "GET", url: "/api/storage/organizer/plan" });
    expect([404, 405]).toContain(oldGet.statusCode);
    const oldPost = await app.inject({ method: "POST", url: "/api/storage/organizer/plan" });
    expect([404, 405]).toContain(oldPost.statusCode);
    expect(await countPlanFiles(dataDir)).toBe(0);

    const headers = { "x-hestia-local-confirm": "organize" };
    const planResponse = await app.inject({
      method: "POST",
      url: "/api/local/organizer/plan",
      headers,
    });
    expect(planResponse.statusCode).toBe(200);
    const plan = JSON.parse(planResponse.payload);
    expect(plan.planId).toMatch(/^plan_/);
    expect(plan.items.some((item) => item.sourcePath === sourcePath)).toBe(true);
    expect(await countPlanFiles(dataDir)).toBe(1);
    await expect(
      fs.stat(path.join(dataDir, "organizer", "plans", `${plan.planId}.json`)),
    ).resolves.toBeTruthy();

    const applyWithoutHeader = await app.inject({
      method: "POST",
      url: "/api/local/organizer/apply",
      payload: { planId: plan.planId, mode: "apply" },
    });
    expect(applyWithoutHeader.statusCode).toBe(403);

    const apply = await app.inject({
      method: "POST",
      url: "/api/local/organizer/apply",
      headers,
      payload: { planId: plan.planId, mode: "apply" },
    });
    expect(apply.statusCode).toBe(200);
    const appliedRun = JSON.parse(apply.payload);
    await expect(fs.stat(sourcePath)).rejects.toThrow();
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("pdf content");

    const undoWithoutHeader = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${appliedRun.runId}/undo`,
    });
    expect(undoWithoutHeader.statusCode).toBe(403);

    const undo = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${appliedRun.runId}/undo`,
      headers,
    });
    expect(undo.statusCode).toBe(200);
    const undoRun = JSON.parse(undo.payload);
    expect(undoRun.undoOf).toBe(appliedRun.runId);
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("pdf content");
    await expect(fs.stat(targetPath)).rejects.toThrow();

    const redoWithoutHeader = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${undoRun.runId}/redo`,
    });
    expect(redoWithoutHeader.statusCode).toBe(403);

    const redo = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${undoRun.runId}/redo`,
      headers,
    });
    expect(redo.statusCode).toBe(200);
    const redoRun = JSON.parse(redo.payload);
    expect(redoRun.redoOf).toBe(undoRun.runId);
    await expect(fs.stat(sourcePath)).rejects.toThrow();
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("pdf content");
  });
});
