import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { writePlan, getPlan } from "./organizerPlan.js";
import { applyOrganizerPlan } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";

async function makeTmpDir(prefix) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function buildApp(dataDir) {
  const app = Fastify();
  app.addHook("onRequest", async (req, reply) => {
    if (req.method !== "POST" || !req.url.startsWith("/api/local/")) return;
    if (req.headers["x-hestia-local-confirm"] === "organize") return;
    reply.code(403).send({ ok: false, code: "EMISSINGCONFIRM" });
  });
  app.post("/api/local/organizer/apply", async (req, reply) => {
    const plan = await getPlan(req.body.planId, dataDir);
    if (!plan) return reply.code(404).send({ ok: false, code: "EPLANNOTFOUND" });
    return applyOrganizerPlan(plan, dataDir);
  });
  app.post("/api/local/organizer/runs/:runId/undo", async (req) =>
    undoOrganizerRun(req.params.runId, dataDir),
  );
  app.post("/api/local/organizer/runs/:undoRunId/redo", async (req) =>
    redoOrganizerRun(req.params.undoRunId, dataDir),
  );
  return app;
}

describe("Organizer HTTP contract", () => {
  let dataDir;
  let workDir;
  let app;

  beforeEach(async () => {
    dataDir = await makeTmpDir("hestia-http-data-");
    workDir = await makeTmpDir("hestia-http-work-");
    process.env.HESTIA_STORAGE_PATH = workDir;
    app = buildApp(dataDir);
  });

  afterEach(async () => {
    delete process.env.HESTIA_STORAGE_PATH;
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  it("cobre o fluxo HTTP apply -> undo -> redo com o contrato parametrizado", async () => {
    const sourcePath = path.join(workDir, "entrada.pdf");
    const targetPath = path.join(workDir, "codice", "pdf", "2026", "07", "entrada.pdf");
    await fs.writeFile(sourcePath, "pdf");

    const plan = {
      planId: "plan_1719876543_abcdef00",
      generatedAt: new Date().toISOString(),
      dryRun: true,
      requiresExtraConfirmation: false,
      largePlanThreshold: 500,
      planned: 1,
      items: [
        {
          id: "item_1",
          sourceKind: "entrada",
          sourceLabel: "Entrada",
          sourcePath,
          targetPath,
          action: "move",
          reason: ".pdf → codice/pdf/2026/07",
          risk: "low",
          status: "planned",
          size: 3,
        },
      ],
      summary: { total: 1, planned: 1, conflicts: 0, ignored: 0, quarantined: 0 },
    };
    await writePlan(plan, dataDir);

    const headers = { "x-hestia-local-confirm": "organize" };
    const apply = await app.inject({
      method: "POST",
      url: "/api/local/organizer/apply",
      headers,
      payload: { planId: plan.planId, mode: "apply" },
    });
    expect(apply.statusCode).toBe(200);
    const appliedRun = JSON.parse(apply.payload);
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("pdf");
    await expect(fs.stat(sourcePath)).rejects.toThrow();

    const undo = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${appliedRun.runId}/undo`,
      headers,
    });
    expect(undo.statusCode).toBe(200);
    const undoRun = JSON.parse(undo.payload);
    expect(undoRun.undoOf).toBe(appliedRun.runId);
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("pdf");
    await expect(fs.stat(targetPath)).rejects.toThrow();

    const redo = await app.inject({
      method: "POST",
      url: `/api/local/organizer/runs/${undoRun.runId}/redo`,
      headers,
    });
    expect(redo.statusCode).toBe(200);
    const redoRun = JSON.parse(redo.payload);
    expect(redoRun.redoOf).toBe(undoRun.runId);
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("pdf");
    await expect(fs.stat(sourcePath)).rejects.toThrow();
  });
});
