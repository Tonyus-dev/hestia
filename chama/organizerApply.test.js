import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import { applyOrganizerPlan, getOrganizerRuns, getOrganizerRun } from "./organizerApply.js";

async function makeTmpDir(prefix) {
  return new Promise((resolve, reject) =>
    mkdtemp(join(tmpdir(), prefix), (err, dir) => (err ? reject(err) : resolve(dir))),
  );
}

describe("applyOrganizerPlan", () => {
  let workDir;
  let dataDir;

  beforeEach(async () => {
    workDir = await makeTmpDir("hestia-apply-work-");
    dataDir = await makeTmpDir("hestia-apply-data-");
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of [workDir, dataDir]) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignora erro ao limpar
      }
    }
  });

  it("aplica move com sucesso (mesma partição) e grava manifesto + evento", async () => {
    const sourcePath = join(workDir, "origem.pdf");
    const targetPath = join(workDir, "destino", "origem.pdf");
    await fs.writeFile(sourcePath, "conteudo-pdf");

    const plan = {
      planId: "plan_x",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("applied");
    expect(manifest.summary).toEqual({ total: 1, ok: 1, failed: 0, skipped: 0 });
    expect(manifest.operations[0]).toMatchObject({
      from: sourcePath,
      to: targetPath,
      status: "ok",
    });

    await expect(fs.access(sourcePath)).rejects.toThrow();
    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toBe("conteudo-pdf");

    const runs = await getOrganizerRuns(dataDir);
    expect(runs).toContain(manifest.runId);
    const read = await getOrganizerRun(manifest.runId, dataDir);
    expect(read).toEqual(manifest);
  });

  it("aplica copy com sucesso e preserva a origem", async () => {
    const sourcePath = join(workDir, "livro.epub");
    const targetPath = join(workDir, "destino", "livro.epub");
    await fs.writeFile(sourcePath, "conteudo-epub");

    const plan = {
      planId: "plan_y",
      items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("applied");
    const sourceStillThere = await fs.readFile(sourcePath, "utf8");
    expect(sourceStillThere).toBe("conteudo-epub");
    const targetContent = await fs.readFile(targetPath, "utf8");
    expect(targetContent).toBe("conteudo-epub");
  });

  it("pula (skipped) item já marcado conflict no plano, sem tocar no disco", async () => {
    const sourcePath = join(workDir, "arquivo.txt");
    await fs.writeFile(sourcePath, "x");
    const targetPath = join(workDir, "destino", "arquivo.txt");

    const plan = {
      planId: "plan_z",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "conflict" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("partially_applied");
    expect(manifest.summary.skipped).toBe(1);
    // Fonte não deve ter sido movida.
    const stillThere = await fs.readFile(sourcePath, "utf8");
    expect(stillThere).toBe("x");
  });

  it("nunca sobrescreve: pula (skipped) se targetPath já existir de fato, mesmo se o plano dizia 'planned'", async () => {
    const sourcePath = join(workDir, "novo.txt");
    const targetDir = join(workDir, "destino");
    const targetPath = join(targetDir, "novo.txt");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(sourcePath, "conteudo-novo");
    await fs.writeFile(targetPath, "ja-existia");

    const plan = {
      planId: "plan_w",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.operations[0].status).toBe("skipped");
    const targetContent = await fs.readFile(targetPath, "utf8");
    expect(targetContent).toBe("ja-existia"); // não sobrescrito
    const sourceContent = await fs.readFile(sourcePath, "utf8");
    expect(sourceContent).toBe("conteudo-novo"); // origem preservada
  });

  it("marca failed se a origem não existir mais (ENOENT)", async () => {
    const sourcePath = join(workDir, "nao-existe.txt");
    const targetPath = join(workDir, "destino", "nao-existe.txt");

    const plan = {
      planId: "plan_v",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("failed");
    expect(manifest.operations[0].status).toBe("failed");
  });

  it("faz fallback copy+verify+unlink quando rename lança EXDEV (cross-device)", async () => {
    const sourcePath = join(workDir, "cross-device.mp4");
    const targetPath = join(workDir, "destino", "cross-device.mp4");
    await fs.writeFile(sourcePath, "conteudo-video-grande");

    const renameSpy = vi.spyOn(fs, "rename").mockImplementationOnce(() => {
      const err = new Error("cross-device link");
      err.code = "EXDEV";
      return Promise.reject(err);
    });

    const plan = {
      planId: "plan_exdev",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.operations[0].status).toBe("ok");
    await expect(fs.access(sourcePath)).rejects.toThrow();
    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toBe("conteudo-video-grande");
    expect(renameSpy).toHaveBeenCalled();
  });

  it("continua em falha parcial: um item falha, outro é aplicado com sucesso", async () => {
    const okSource = join(workDir, "ok.txt");
    await fs.writeFile(okSource, "ok-conteudo");
    const okTarget = join(workDir, "destino", "ok.txt");
    const missingSource = join(workDir, "sumiu.txt");
    const missingTarget = join(workDir, "destino", "sumiu.txt");

    const plan = {
      planId: "plan_partial",
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

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("partially_applied");
    expect(manifest.summary).toEqual({ total: 2, ok: 1, failed: 1, skipped: 0 });
  });
});
