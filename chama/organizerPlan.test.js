import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import { targetRelativePathFor, writePlan, getPlan } from "./organizerPlan.js";

async function makeTmpDir(prefix) {
  return new Promise((resolve, reject) =>
    mkdtemp(join(tmpdir(), prefix), (err, dir) => (err ? reject(err) : resolve(dir))),
  );
}

describe("targetRelativePathFor", () => {
  it("mapeia extensões conhecidas para as pastas canônicas", () => {
    expect(targetRelativePathFor(".pdf")).toBe("codice/pdf");
    expect(targetRelativePathFor(".epub")).toBe("codice/epub");
    expect(targetRelativePathFor(".md")).toBe("codice/fichamentos");
    expect(targetRelativePathFor(".txt")).toBe("codice/fichamentos");
    expect(targetRelativePathFor(".docx")).toBe("arquivos");
    expect(targetRelativePathFor(".mp4")).toBe("midia/videos");
    expect(targetRelativePathFor(".mkv")).toBe("midia/videos");
    expect(targetRelativePathFor(".mp3")).toBe("midia/audio");
    expect(targetRelativePathFor(".jpg")).toBe("midia/imagens");
    expect(targetRelativePathFor(".png")).toBe("midia/imagens");
    expect(targetRelativePathFor(".zip")).toBe("arquivos/compactados");
  });

  it("cai para entrada/revisar em extensão desconhecida", () => {
    expect(targetRelativePathFor(".xyz")).toBe("entrada/revisar");
    expect(targetRelativePathFor("(sem extensão)")).toBe("entrada/revisar");
  });
});

describe("generateOrganizerPlan", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await makeTmpDir("hestia-organizerplan-");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.resetModules();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignora erro ao limpar
    }
  });

  it("gera plano com items de entrada (action:move) e fontes externas (action:copy)", async () => {
    const entradaDir = join(tmpDir, "entrada");
    const sourceDir = join(tmpDir, "hd-fonte");
    await fs.mkdir(entradaDir, { recursive: true });
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(join(entradaDir, "recibo.pdf"), "conteudo");
    await fs.writeFile(join(sourceDir, "livro.epub"), "conteudo-livro");

    vi.doMock("./storageModel.js", () => ({
      getStorageModel: () => ({
        root: "/KALINE",
        folders: [{ id: "entrada", label: "Entrada", absolutePath: entradaDir }],
      }),
    }));
    vi.doMock("./config.js", () => ({
      config: {
        storageSources: [
          {
            id: "fonte-hd",
            label: "Fonte HD",
            path: sourceDir,
            category: "codice/epub",
            mode: "external-readonly",
          },
        ],
      },
    }));

    const { generateOrganizerPlan } = await import("./organizerPlan.js");
    const plan = await generateOrganizerPlan();

    expect(plan.planId).toMatch(/^plan_/);
    expect(plan.items).toHaveLength(2);

    const entradaItem = plan.items.find((i) => i.sourcePath.endsWith("recibo.pdf"));
    expect(entradaItem.action).toBe("move");
    expect(entradaItem.targetPath).toBe("/KALINE/codice/pdf/recibo.pdf");
    expect(entradaItem.status).toBe("planned");

    const sourceItem = plan.items.find((i) => i.sourcePath.endsWith("livro.epub"));
    expect(sourceItem.action).toBe("copy");
    expect(sourceItem.targetPath).toBe("/KALINE/codice/epub/livro.epub");

    expect(plan.summary.total).toBe(2);
    expect(plan.summary.planned).toBe(2);
    expect(plan.summary.conflicts).toBe(0);
  });
});

describe("writePlan / getPlan", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await makeTmpDir("hestia-planstore-");
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignora erro ao limpar
    }
  });

  it("escreve e lê o plano de volta identicamente", async () => {
    const plan = {
      planId: "plan_teste_123",
      generatedAt: new Date().toISOString(),
      items: [{ id: "a", sourcePath: "/x", targetPath: "/y", action: "move", status: "planned" }],
      summary: { total: 1, planned: 1, conflicts: 0 },
    };
    await writePlan(plan, tmpDir);
    const read = await getPlan("plan_teste_123", tmpDir);
    expect(read).toEqual(plan);
  });

  it("retorna null para planId inexistente", async () => {
    const read = await getPlan("plan_nao_existe", tmpDir);
    expect(read).toBeNull();
  });
});
