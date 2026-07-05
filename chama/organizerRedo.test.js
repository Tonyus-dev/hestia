import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import { applyOrganizerPlan, getOrganizerRun, getOrganizerRuns } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";

async function makeTmpDir(prefix) {
  return new Promise((resolve, reject) =>
    mkdtemp(join(tmpdir(), prefix), (err, dir) => (err ? reject(err) : resolve(dir))),
  );
}

describe("redoOrganizerRun", () => {
  let workDir;
  let dataDir;

  beforeEach(async () => {
    workDir = await makeTmpDir("hestia-redo-work-");
    dataDir = await makeTmpDir("hestia-redo-data-");
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
  });

  afterEach(async () => {
    for (const dir of [workDir, dataDir]) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignora erro ao limpar
      }
    }
  });

  it("retorna null para runId inexistente", async () => {
    expect(await redoOrganizerRun("nao_existe", dataDir)).toBeNull();
  });

  it("lança ENOTUNDORUN se o runId não for de um undo", async () => {
    const sourcePath = join(workDir, "x.txt");
    const targetPath = join(workDir, "destino", "x.txt");
    await fs.writeFile(sourcePath, "x");
    const plan = {
      planId: "plan_a",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);

    await expect(redoOrganizerRun(run.runId, dataDir)).rejects.toMatchObject({
      code: "ENOTUNDORUN",
    });
  });

  it("refaz um move: arquivo volta pro destino original", async () => {
    const sourcePath = join(workDir, "origem.pdf");
    const targetPath = join(workDir, "destino", "origem.pdf");
    await fs.writeFile(sourcePath, "conteudo-pdf");

    const plan = {
      planId: "plan_b",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    const redoManifest = await redoOrganizerRun(undoManifest.runId, dataDir);

    expect(redoManifest.redoOf).toBe(undoManifest.runId);
    expect(redoManifest.status).toBe("applied");
    expect(redoManifest.operations[0]).toMatchObject({
      from: sourcePath,
      to: targetPath,
      status: "ok",
    });

    await expect(fs.access(sourcePath)).rejects.toThrow();
    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toBe("conteudo-pdf");

    const updatedUndo = await getOrganizerRun(undoManifest.runId, dataDir);
    expect(updatedUndo.redoneBy).toBe(redoManifest.runId);
  });

  it("refaz um copy: cria a cópia de novo, sem tocar a origem", async () => {
    const sourcePath = join(workDir, "livro.epub");
    const targetPath = join(workDir, "destino", "livro.epub");
    await fs.writeFile(sourcePath, "conteudo-epub");

    const plan = {
      planId: "plan_c",
      items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    const redoManifest = await redoOrganizerRun(undoManifest.runId, dataDir);

    expect(redoManifest.operations[0].status).toBe("ok");
    const sourceContent = await fs.readFile(sourcePath, "utf8");
    expect(sourceContent).toBe("conteudo-epub");
    const targetContent = await fs.readFile(targetPath, "utf8");
    expect(targetContent).toBe("conteudo-epub");
  });

  it("lança EALREADYREDONE ao tentar refazer duas vezes", async () => {
    const sourcePath = join(workDir, "x.txt");
    const targetPath = join(workDir, "destino", "x.txt");
    await fs.writeFile(sourcePath, "x");
    const plan = {
      planId: "plan_d",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    const undoManifest = await undoOrganizerRun(run.runId, dataDir);
    await redoOrganizerRun(undoManifest.runId, dataDir);

    await expect(redoOrganizerRun(undoManifest.runId, dataDir)).rejects.toMatchObject({
      code: "EALREADYREDONE",
    });
  });

  it("pula (skipped) operação que não foi desfeita com sucesso — nada a refazer", async () => {
    const sourcePath = join(workDir, "conflito.txt");
    const targetDir = join(workDir, "destino");
    const targetPath = join(targetDir, "conflito.txt");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(sourcePath, "novo");
    await fs.writeFile(targetPath, "ja-existia"); // conflito real no destino

    const plan = {
      planId: "plan_e",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    expect(run.operations[0].status).toBe("skipped"); // apply nem tocou o disco

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);
    expect(undoManifest.operations[0].status).toBe("skipped"); // nada a desfazer

    const redoManifest = await redoOrganizerRun(undoManifest.runId, dataDir);
    expect(redoManifest.operations[0].status).toBe("skipped");
  });

  it("getOrganizerRuns expõe redoOf/redoneBy corretamente", async () => {
    const sourcePath = join(workDir, "y.txt");
    const targetPath = join(workDir, "destino", "y.txt");
    await fs.writeFile(sourcePath, "y");
    const plan = {
      planId: "plan_f",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    const undoManifest = await undoOrganizerRun(run.runId, dataDir);
    const redoManifest = await redoOrganizerRun(undoManifest.runId, dataDir);

    const runs = await getOrganizerRuns(dataDir);
    const undoListing = runs.find((r) => r.runId === undoManifest.runId);
    const redoListing = runs.find((r) => r.runId === redoManifest.runId);
    expect(undoListing.redoneBy).toBe(redoManifest.runId);
    expect(redoListing.redoOf).toBe(undoManifest.runId);
  });
});
