import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import { applyOrganizerPlan, getOrganizerRun, getOrganizerRuns } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";

async function makeTmpDir(prefix) {
  return new Promise((resolve, reject) =>
    mkdtemp(join(tmpdir(), prefix), (err, dir) => (err ? reject(err) : resolve(dir))),
  );
}

describe("undoOrganizerRun", () => {
  let workDir;
  let dataDir;

  beforeEach(async () => {
    workDir = await makeTmpDir("hestia-undo-work-");
    process.env.HESTIA_KALINE_ROOT = workDir;
    dataDir = await makeTmpDir("hestia-undo-data-");
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
  });

  afterEach(async () => {
    delete process.env.HESTIA_KALINE_ROOT;
    for (const dir of [workDir, dataDir]) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignora erro ao limpar
      }
    }
  });

  it("retorna null para runId inexistente", async () => {
    const result = await undoOrganizerRun("nao_existe", dataDir);
    expect(result).toBeNull();
  });

  it("desfaz um move com sucesso: arquivo volta pro lugar original", async () => {
    const sourcePath = join(workDir, "origem.pdf");
    const targetPath = join(workDir, "destino", "origem.pdf");
    await fs.writeFile(sourcePath, "conteudo-pdf");

    const plan = {
      planId: "plan_a",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    expect(run.status).toBe("applied");

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    expect(undoManifest.undoOf).toBe(run.runId);
    expect(undoManifest.status).toBe("applied");
    expect(undoManifest.operations[0]).toMatchObject({
      from: targetPath,
      to: sourcePath,
      action: "move",
      status: "ok",
    });

    const content = await fs.readFile(sourcePath, "utf8");
    expect(content).toBe("conteudo-pdf");
    await expect(fs.access(targetPath)).rejects.toThrow();

    const updatedOriginal = await getOrganizerRun(run.runId, dataDir);
    expect(updatedOriginal.undoneBy).toBe(undoManifest.runId);
  });

  it("desfaz um copy apagando só a cópia, nunca a origem", async () => {
    const sourcePath = join(workDir, "livro.epub");
    const targetPath = join(workDir, "destino", "livro.epub");
    await fs.writeFile(sourcePath, "conteudo-epub");

    const plan = {
      planId: "plan_b",
      items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    expect(undoManifest.operations[0].status).toBe("ok");
    const sourceStillThere = await fs.readFile(sourcePath, "utf8");
    expect(sourceStillThere).toBe("conteudo-epub");
    await expect(fs.access(targetPath)).rejects.toThrow();
  });

  it("recusa desfazer move se a origem já foi recriada (não sobrescreve)", async () => {
    const sourcePath = join(workDir, "arquivo.txt");
    const targetPath = join(workDir, "destino", "arquivo.txt");
    await fs.writeFile(sourcePath, "original");

    const plan = {
      planId: "plan_c",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);

    // Algo recriou um arquivo na origem depois do apply.
    await fs.writeFile(sourcePath, "arquivo-novo-diferente");

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    expect(undoManifest.operations[0].status).toBe("skipped");
    const content = await fs.readFile(sourcePath, "utf8");
    expect(content).toBe("arquivo-novo-diferente"); // não sobrescrito
    const targetContent = await fs.readFile(targetPath, "utf8");
    expect(targetContent).toBe("original"); // continua no destino
  });

  it("recusa desfazer copy se a origem sumiu (mantém a cópia por segurança)", async () => {
    const sourcePath = join(workDir, "foto.jpg");
    const targetPath = join(workDir, "destino", "foto.jpg");
    await fs.writeFile(sourcePath, "conteudo-foto");

    const plan = {
      planId: "plan_d",
      items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);

    await fs.unlink(sourcePath); // origem externa sumiu depois do apply

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    expect(undoManifest.operations[0].status).toBe("skipped");
    const targetContent = await fs.readFile(targetPath, "utf8");
    expect(targetContent).toBe("conteudo-foto"); // cópia mantida
  });

  it("lança EALREADYUNDONE ao tentar desfazer duas vezes", async () => {
    const sourcePath = join(workDir, "x.txt");
    const targetPath = join(workDir, "destino", "x.txt");
    await fs.writeFile(sourcePath, "x");

    const plan = {
      planId: "plan_e",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    await expect(undoOrganizerRun(run.runId, dataDir)).rejects.toMatchObject({
      code: "EALREADYUNDONE",
    });

    // getOrganizerRuns expõe undoOf/undoneBy para a UI decidir quando esconder "Desfazer".
    const runs = await getOrganizerRuns(dataDir);
    const originalListing = runs.find((r) => r.runId === run.runId);
    const undoListing = runs.find((r) => r.runId === undoManifest.runId);
    expect(originalListing.undoneBy).toBe(undoManifest.runId);
    expect(undoListing.undoOf).toBe(run.runId);
  });

  it("pula operações que não eram 'ok' no apply original (skipped/failed)", async () => {
    const okSource = join(workDir, "ok.txt");
    await fs.writeFile(okSource, "ok");
    const okTarget = join(workDir, "destino", "ok.txt");
    const missingSource = join(workDir, "sumiu.txt");
    const missingTarget = join(workDir, "destino", "sumiu.txt");

    const plan = {
      planId: "plan_f",
      items: [
        { id: "i1", sourcePath: okSource, targetPath: okTarget, action: "move", status: "planned" },
        {
          id: "i2",
          sourcePath: missingSource,
          targetPath: missingTarget,
          action: "move",
          status: "planned",
        },
      ],
    };
    const run = await applyOrganizerPlan(plan, dataDir);
    expect(run.status).toBe("partially_applied");

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    const failedOpUndo = undoManifest.operations.find((o) => o.to === missingSource);
    expect(failedOpUndo.status).toBe("skipped");
    const okOpUndo = undoManifest.operations.find((o) => o.to === okSource);
    expect(okOpUndo.status).toBe("ok");
  });

  it("pula undo se o destino foi alterado depois da execução", async () => {
    const sourcePath = join(workDir, "alterado.txt");
    const targetPath = join(workDir, "destino", "alterado.txt");
    await fs.writeFile(sourcePath, "original");
    const run = await applyOrganizerPlan(
      {
        planId: "plan_changed",
        items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
      },
      dataDir,
    );
    await fs.writeFile(targetPath, "modificado");

    const undoManifest = await undoOrganizerRun(run.runId, dataDir);

    expect(undoManifest.operations[0].status).toBe("skipped");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("modificado");
  });
});
