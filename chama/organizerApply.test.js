import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import { applyOrganizerPlan, getOrganizerRuns, getOrganizerRun } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";
import { config } from "./config.js";

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
    process.env.HESTIA_KALINE_ROOT = workDir;
    dataDir = await makeTmpDir("hestia-apply-data-");
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    config.storageSources = [];
    delete process.env.HESTIA_KALINE_ROOT;
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
    expect(runs.map((r) => r.runId)).toContain(manifest.runId);
    const listed = runs.find((r) => r.runId === manifest.runId);
    expect(listed).toMatchObject({ status: "applied", undoOf: null, undoneBy: null });
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

    expect(manifest.status).toBe("partially_applied");
    expect(manifest.operations[0].status).toBe("skipped");
  });

  it("move por cópia verificada a partir da origem aberta e remove a origem", async () => {
    const sourcePath = join(workDir, "cross-device.mp4");
    const targetPath = join(workDir, "destino", "cross-device.mp4");
    await fs.writeFile(sourcePath, "conteudo-video-grande");

    const plan = {
      planId: "plan_exdev",
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.operations[0].status).toBe("ok");
    await expect(fs.access(sourcePath)).rejects.toThrow();
    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toBe("conteudo-video-grande");
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
    expect(manifest.summary).toEqual({ total: 2, ok: 1, failed: 0, skipped: 1 });
  });
});

describe("applyOrganizerPlan safety gates", () => {
  let workDir;
  let dataDir;

  beforeEach(async () => {
    workDir = await makeTmpDir("hestia-apply-safety-work-");
    process.env.HESTIA_KALINE_ROOT = workDir;
    dataDir = await makeTmpDir("hestia-apply-safety-data-");
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
  });

  afterEach(async () => {
    config.storageSources = [];
    delete process.env.HESTIA_KALINE_ROOT;
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  it("recusa plano velho no apply", async () => {
    await expect(
      applyOrganizerPlan(
        { planId: "plan_old", generatedAt: "2026-01-01T00:00:00.000Z", items: [] },
        dataDir,
      ),
    ).rejects.toMatchObject({ code: "EPLANEXPIRED" });
  });

  it("aceita plano recente", async () => {
    const manifest = await applyOrganizerPlan(
      { planId: "plan_recent", generatedAt: new Date().toISOString(), items: [] },
      dataDir,
    );
    expect(manifest.status).toBe("applied");
  });

  it("recusa se sourcePath for trocado depois da abertura verificada", async () => {
    const sourcePath = join(workDir, "troca.txt");
    const originalPath = join(workDir, "troca-original.txt");
    const targetPath = join(workDir, "destino", "troca.txt");
    await fs.writeFile(sourcePath, "original");

    const originalOpen = fs.open;
    const openSpy = vi.spyOn(fs, "open").mockImplementation(async (pathValue, flags, mode) => {
      const handle = await originalOpen(pathValue, flags, mode);
      if (pathValue === sourcePath) {
        await fs.rename(sourcePath, originalPath);
        await fs.writeFile(sourcePath, "trocado");
      }
      return handle;
    });

    const manifest = await applyOrganizerPlan(
      {
        planId: "plan_source_swap",
        generatedAt: new Date().toISOString(),
        items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
      },
      dataDir,
    );

    expect(manifest.operations[0]).toMatchObject({
      status: "skipped",
      error: "sourcePath mudou após abertura",
    });
    await expect(fs.readFile(originalPath, "utf8")).resolves.toBe("original");
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("trocado");
    await expect(fs.access(targetPath)).rejects.toThrow();
    openSpy.mockRestore();
  });

  it("recusa target fora de /KALINE sem derrubar o lote", async () => {
    const sourcePath = join(workDir, "origem.txt");
    await fs.writeFile(sourcePath, "x");
    const manifest = await applyOrganizerPlan(
      {
        planId: "plan_outside",
        generatedAt: new Date().toISOString(),
        items: [
          {
            id: "i1",
            sourcePath,
            targetPath: join(dataDir, "fora.txt"),
            action: "move",
            status: "planned",
          },
        ],
      },
      dataDir,
    );
    expect(manifest.operations[0]).toMatchObject({
      status: "skipped",
      error: "targetPath fora de /KALINE",
    });
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("x");
  });

  it("plano com mais de 5000 itens exige confirmação extra", async () => {
    const items = Array.from({ length: 5001 }, (_, i) => ({
      id: `i${i}`,
      sourcePath: join(workDir, `${i}.txt`),
      targetPath: join(workDir, "dest", `${i}.txt`),
      action: "move",
      status: "planned",
    }));
    await expect(
      applyOrganizerPlan(
        {
          planId: "plan_big",
          generatedAt: new Date().toISOString(),
          summary: { planned: 5001 },
          items,
        },
        dataDir,
      ),
    ).rejects.toMatchObject({ code: "ELARGEPLANCONFIRM" });
  });

  it("se link deu certo mas unlink da origem falhar, desfaz/remove o target e falha a operacao", async () => {
    const sourcePath = join(workDir, "origem.pdf");
    const targetPath = join(workDir, "destino", "origem.pdf");
    await fs.writeFile(sourcePath, "conteudo-pdf");

    const originalUnlink = fs.unlink;
    const unlinkSpy = vi.spyOn(fs, "unlink").mockImplementation((path) => {
      if (path === sourcePath) {
        const err = new Error("permission denied");
        err.code = "EACCES";
        return Promise.reject(err);
      }
      return originalUnlink(path);
    });

    const plan = {
      planId: "plan_rollback1",
      generatedAt: new Date().toISOString(),
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("failed");
    expect(manifest.summary.failed).toBe(1);
    expect(manifest.operations[0].status).toBe("failed");

    const sourceContent = await fs.readFile(sourcePath, "utf8");
    expect(sourceContent).toBe("conteudo-pdf");

    await expect(fs.access(targetPath)).rejects.toThrow();

    unlinkSpy.mockRestore();
  });

  it("se a cópia verificada deu certo mas unlink da origem falhar, desfaz/remove a copia e falha a operacao", async () => {
    const sourcePath = join(workDir, "origem.pdf");
    const targetPath = join(workDir, "destino", "origem.pdf");
    await fs.writeFile(sourcePath, "conteudo-pdf");

    const originalUnlink = fs.unlink;
    const unlinkSpy = vi.spyOn(fs, "unlink").mockImplementation((path) => {
      if (path === sourcePath) {
        const err = new Error("permission denied");
        err.code = "EACCES";
        return Promise.reject(err);
      }
      return originalUnlink(path);
    });

    const plan = {
      planId: "plan_rollback2",
      generatedAt: new Date().toISOString(),
      items: [{ id: "i1", sourcePath, targetPath, action: "move", status: "planned" }],
    };

    const manifest = await applyOrganizerPlan(plan, dataDir);

    expect(manifest.status).toBe("failed");
    expect(manifest.summary.failed).toBe(1);
    expect(manifest.operations[0].status).toBe("failed");

    const sourceContent = await fs.readFile(sourcePath, "utf8");
    expect(sourceContent).toBe("conteudo-pdf");

    await expect(fs.access(targetPath)).rejects.toThrow();

    unlinkSpy.mockRestore();
  });
});

describe("applyOrganizerPlan external read-only sources", () => {
  let kalineRoot;
  let externalRoot;
  let dataDir;

  beforeEach(async () => {
    kalineRoot = await makeTmpDir("hestia-apply-kaline-");
    externalRoot = await makeTmpDir("hestia-apply-external-");
    dataDir = await makeTmpDir("hestia-apply-external-data-");
    process.env.HESTIA_KALINE_ROOT = kalineRoot;
    await fs.mkdir(join(dataDir, "events"), { recursive: true });
    config.storageSources = [
      {
        id: "external",
        label: "External",
        path: externalRoot,
        category: "midia/videos",
        mode: "external-readonly",
      },
    ];
  });

  afterEach(async () => {
    config.storageSources = [];
    delete process.env.HESTIA_KALINE_ROOT;
    await fs.rm(kalineRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(externalRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  it("aplica copy externo, undo remove só a cópia e redo recria a cópia", async () => {
    const sourcePath = join(externalRoot, "filme.mp4");
    const targetPath = join(kalineRoot, "midia", "videos", "filme.mp4");
    await fs.writeFile(sourcePath, "conteudo-video");

    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("conteudo-video");
    await expect(fs.access(targetPath)).rejects.toThrow();

    const applyRun = await applyOrganizerPlan(
      {
        planId: "plan_external",
        items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
      },
      dataDir,
    );
    expect(applyRun.operations[0].status).toBe("ok");
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("conteudo-video");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("conteudo-video");

    const undoRun = await undoOrganizerRun(applyRun.runId, dataDir);
    expect(undoRun.operations[0].status).toBe("ok");
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("conteudo-video");
    await expect(fs.access(targetPath)).rejects.toThrow();

    const redoRun = await redoOrganizerRun(undoRun.runId, dataDir);
    expect(redoRun.operations[0].status).toBe("ok");
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("conteudo-video");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("conteudo-video");
  });

  it.each([
    ["recusa move em fonte externa", "move", "fonte externa aceita apenas copy"],
    ["recusa ação desconhecida", "delete", "action não permitida"],
  ])("%s", async (_name, action, error) => {
    const sourcePath = join(externalRoot, "arquivo.txt");
    const targetPath = join(kalineRoot, "destino", `${action}.txt`);
    await fs.writeFile(sourcePath, "x");

    const run = await applyOrganizerPlan(
      {
        planId: `plan_${action}`,
        items: [{ id: "i1", sourcePath, targetPath, action, status: "planned" }],
      },
      dataDir,
    );

    expect(run.operations[0]).toMatchObject({ status: "skipped", error });
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("x");
    await expect(fs.access(targetPath)).rejects.toThrow();
  });

  it("recusa arquivo symlink", async () => {
    const real = join(externalRoot, "real.txt");
    const sourcePath = join(externalRoot, "link.txt");
    const targetPath = join(kalineRoot, "destino", "link.txt");
    await fs.writeFile(real, "x");
    await fs.symlink(real, sourcePath);

    const run = await applyOrganizerPlan(
      {
        planId: "plan_symlink",
        items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
      },
      dataDir,
    );

    expect(run.operations[0]).toMatchObject({ status: "skipped", error: "sourcePath é symlink" });
    await expect(fs.readFile(real, "utf8")).resolves.toBe("x");
    await expect(fs.access(targetPath)).rejects.toThrow();
  });

  it("recusa origem real escapando por symlink de diretório", async () => {
    const outsideDir = await makeTmpDir("hestia-outside-");
    try {
      await fs.writeFile(join(outsideDir, "escape.txt"), "x");
      const linkDir = join(externalRoot, "atalho");
      await fs.symlink(outsideDir, linkDir, "dir");
      const sourcePath = join(linkDir, "escape.txt");
      const targetPath = join(kalineRoot, "destino", "escape.txt");

      const run = await applyOrganizerPlan(
        {
          planId: "plan_escape",
          items: [{ id: "i1", sourcePath, targetPath, action: "copy", status: "planned" }],
        },
        dataDir,
      );

      expect(run.operations[0]).toMatchObject({
        status: "skipped",
        error: "sourcePath escapa da fonte permitida via realpath",
      });
      await expect(fs.readFile(join(outsideDir, "escape.txt"), "utf8")).resolves.toBe("x");
      await expect(fs.access(targetPath)).rejects.toThrow();
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("recusa origem fora das áreas permitidas e destino fora de /KALINE", async () => {
    const outsideDir = await makeTmpDir("hestia-outside-source-");
    try {
      const outsideSource = join(outsideDir, "fora.txt");
      await fs.writeFile(outsideSource, "x");
      const externalSource = join(externalRoot, "externo.txt");
      await fs.writeFile(externalSource, "y");

      const run = await applyOrganizerPlan(
        {
          planId: "plan_rejections",
          items: [
            {
              id: "i1",
              sourcePath: outsideSource,
              targetPath: join(kalineRoot, "destino", "fora.txt"),
              action: "copy",
              status: "planned",
            },
            {
              id: "i2",
              sourcePath: externalSource,
              targetPath: join(outsideDir, "destino.txt"),
              action: "copy",
              status: "planned",
            },
          ],
        },
        dataDir,
      );

      expect(run.operations[0]).toMatchObject({
        status: "skipped",
        error: "sourcePath fora das fontes permitidas",
      });
      expect(run.operations[1]).toMatchObject({
        status: "skipped",
        error: "targetPath fora de /KALINE",
      });
      await expect(fs.readFile(outsideSource, "utf8")).resolves.toBe("x");
      await expect(fs.readFile(externalSource, "utf8")).resolves.toBe("y");
      await expect(fs.access(join(kalineRoot, "destino", "fora.txt"))).rejects.toThrow();
      await expect(fs.access(join(outsideDir, "destino.txt"))).rejects.toThrow();
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});
