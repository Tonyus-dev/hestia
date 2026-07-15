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
    expect(targetRelativePathFor(".docx")).toBe("documentos/textos");
    expect(targetRelativePathFor(".xlsx")).toBe("documentos/planilhas");
    expect(targetRelativePathFor(".pptx")).toBe("documentos/apresentacoes");
    expect(targetRelativePathFor(".mp4")).toBe("midia/videos");
    expect(targetRelativePathFor(".mkv")).toBe("midia/videos");
    expect(targetRelativePathFor(".wmv")).toBe("midia/videos");
    expect(targetRelativePathFor(".mp3")).toBe("midia/audio");
    expect(targetRelativePathFor(".eps")).toBe("design/vetores");
    expect(targetRelativePathFor(".svg")).toBe("design/vetores");
    expect(targetRelativePathFor(".ai")).toBe("design/vetores");
    expect(targetRelativePathFor(".psd")).toBe("design/projetos");
    expect(targetRelativePathFor(".fig")).toBe("design/projetos");
    expect(targetRelativePathFor(".jpg")).toBe("midia/imagens");
    expect(targetRelativePathFor(".png")).toBe("midia/imagens");
    expect(targetRelativePathFor(".zip")).toBe("arquivos/compactados");
    expect(targetRelativePathFor(".exe")).toBe("ash/quarentena");
    expect(targetRelativePathFor(".sh")).toBe("ash/quarentena");
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignora erro ao limpar
    }
  });

  it("gera plano normalmente com storage root terminado em barra", async () => {
    const sourceDir = join(tmpDir, "entrada", "manual");
    const sourcePath = join(sourceDir, "livro.pdf");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(sourcePath, "conteudo");
    const oldDate = new Date("2026-07-10T00:00:00.000Z");
    await fs.utimes(sourcePath, oldDate, oldDate);

    const { generateOrganizerPlan } = await import("./organizerPlan.js");
    const plan = await generateOrganizerPlan(undefined, null, {
      storagePath: `${tmpDir}/`,
      storageSources: [],
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].sourcePath).toBe(sourcePath);
    expect(plan.items[0].targetPath).toBe(join(tmpDir, "codice", "pdf", "2026", "07", "livro.pdf"));
  });

  it("gera plano com items de entrada (action:move) e fontes externas (action:copy)", async () => {
    const entradaDir = join(tmpDir, "entrada");
    const sourceDir = join(tmpDir, "hd-fonte");
    await fs.mkdir(entradaDir, { recursive: true });
    await fs.mkdir(sourceDir, { recursive: true });
    const oldDate = new Date("2026-07-10T00:00:00.000Z");
    await fs.writeFile(join(entradaDir, "recibo.pdf"), "conteudo");
    await fs.writeFile(join(sourceDir, "livro.epub"), "conteudo-livro");
    await fs.utimes(join(entradaDir, "recibo.pdf"), oldDate, oldDate);
    await fs.utimes(join(sourceDir, "livro.epub"), oldDate, oldDate);

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
    expect(entradaItem.targetPath).toBe("/KALINE/codice/pdf/2026/07/recibo.pdf");
    expect(entradaItem.sourceKind).toBe("entrada");
    expect(entradaItem.status).toBe("planned");

    const sourceItem = plan.items.find((i) => i.sourcePath.endsWith("livro.epub"));
    expect(sourceItem.action).toBe("copy");
    expect(sourceItem.targetPath).toBe("/KALINE/codice/epub/2026/07/livro.epub");
    expect(sourceItem.sourceKind).toBe("external");

    expect(plan.summary.total).toBe(2);
    expect(plan.summary.planned).toBe(2);
    expect(plan.summary.conflicts).toBe(0);
    expect(plan.summary.ignored).toBe(0);
    expect(plan.summary.quarantined).toBe(0);
    expect(plan.summary.byExtension).toMatchObject({ ".pdf": 1, ".epub": 1 });
    expect(plan.summary.byTargetArea).toMatchObject({ "codice/pdf": 1, "codice/epub": 1 });
    expect(plan.dryRun).toBe(true);
  });
  it("classifica por classe/tipo/ano/mês, quarentena, revisão e ignorados", async () => {
    const entradaDir = join(tmpDir, "entrada");
    await fs.mkdir(entradaDir, { recursive: true });
    const files = [
      "artigo.pdf",
      "foto.jpg",
      "filme.mkv",
      "clipe.mp4",
      "legado.wmv",
      "marca.eps",
      "icone.svg",
      "logo.ai",
      "layout.psd",
      "mockup.fig",
      "oficio.docx",
      "tabela.xlsx",
      "aula.pptx",
      "livro.epub",
      "nota.md",
      "semext",
      "app.exe",
      "script.sh",
      "temp.tmp",
      "novo.png",
    ];
    for (const file of files) await fs.writeFile(join(entradaDir, file), "x");
    const jul2026 = new Date("2026-07-15T12:00:00.000Z");
    const dec2025 = new Date("2025-12-20T12:00:00.000Z");
    for (const file of files.filter((f) => f !== "novo.png"))
      await fs.utimes(join(entradaDir, file), jul2026, jul2026);
    await fs.utimes(join(entradaDir, "foto.jpg"), dec2025, dec2025);
    await fs.utimes(
      join(entradaDir, "novo.png"),
      new Date("2026-07-31T23:59:30.000Z"),
      new Date("2026-07-31T23:59:30.000Z"),
    );

    vi.doMock("./storageModel.js", () => ({
      getStorageModel: () => ({
        root: "/KALINE",
        folders: [{ id: "entrada", label: "Entrada", absolutePath: entradaDir }],
      }),
    }));
    vi.doMock("./config.js", () => ({ config: { storageSources: [] } }));

    const { generateOrganizerPlan } = await import("./organizerPlan.js");
    const plan = await generateOrganizerPlan();
    const byName = Object.fromEntries(plan.items.map((i) => [i.sourcePath.split("/").pop(), i]));

    expect(byName["artigo.pdf"].targetPath).toBe("/KALINE/codice/pdf/2026/07/artigo.pdf");
    expect(byName["foto.jpg"].targetPath).toBe("/KALINE/midia/imagens/2025/12/foto.jpg");
    expect(byName["filme.mkv"].targetPath).toBe("/KALINE/midia/videos/2026/07/filme.mkv");
    expect(byName["clipe.mp4"].targetPath).toBe("/KALINE/midia/videos/2026/07/clipe.mp4");
    expect(byName["legado.wmv"].targetPath).toBe("/KALINE/midia/videos/2026/07/legado.wmv");
    expect(byName["marca.eps"].targetPath).toBe("/KALINE/design/vetores/2026/07/marca.eps");
    expect(byName["icone.svg"].targetPath).toBe("/KALINE/design/vetores/2026/07/icone.svg");
    expect(byName["logo.ai"].targetPath).toBe("/KALINE/design/vetores/2026/07/logo.ai");
    expect(byName["layout.psd"].targetPath).toBe("/KALINE/design/projetos/2026/07/layout.psd");
    expect(byName["mockup.fig"].targetPath).toBe("/KALINE/design/projetos/2026/07/mockup.fig");
    expect(byName["oficio.docx"].targetPath).toBe("/KALINE/documentos/textos/2026/07/oficio.docx");
    expect(byName["tabela.xlsx"].targetPath).toBe(
      "/KALINE/documentos/planilhas/2026/07/tabela.xlsx",
    );
    expect(byName["aula.pptx"].targetPath).toBe(
      "/KALINE/documentos/apresentacoes/2026/07/aula.pptx",
    );
    expect(byName["livro.epub"].targetPath).toBe("/KALINE/codice/epub/2026/07/livro.epub");
    expect(byName["nota.md"].targetPath).toBe("/KALINE/codice/fichamentos/2026/07/nota.md");
    expect(byName["semext"].targetPath).toBe("/KALINE/entrada/revisar/2026/07/semext");
    expect(byName["app.exe"].targetPath).toBe("/KALINE/ash/quarentena/2026/07/app.exe");
    expect(byName["script.sh"].targetPath).toBe("/KALINE/ash/quarentena/2026/07/script.sh");
    expect(byName["novo.png"].status).toBe("ignored");
    expect(byName["novo.png"].ignoredReason).toBe("recently_modified");
    expect(byName["temp.tmp"]).toBeUndefined();
    expect(plan.summary.ignored).toBe(2);
    expect(plan.summary.quarantined).toBe(2);
  });
  it("rotula dispositivos pela subpasta, mas arquivo solto usa label base", async () => {
    const dispositivosDir = join(tmpDir, "entrada", "dispositivos");
    const celularDir = join(dispositivosDir, "celular");
    await fs.mkdir(celularDir, { recursive: true });
    await fs.writeFile(join(celularDir, "foto.jpg"), "x");
    await fs.writeFile(join(dispositivosDir, "arquivo-solto.pdf"), "x");
    const oldDate = new Date("2026-07-10T00:00:00.000Z");
    await fs.utimes(join(celularDir, "foto.jpg"), oldDate, oldDate);
    await fs.utimes(join(dispositivosDir, "arquivo-solto.pdf"), oldDate, oldDate);

    vi.doMock("./storageModel.js", () => ({
      getStorageModel: () => ({
        root: "/KALINE",
        folders: [
          {
            id: "entrada-dispositivos",
            label: "Dispositivos",
            absolutePath: dispositivosDir,
          },
        ],
      }),
    }));
    vi.doMock("./config.js", () => ({ config: { storageSources: [] } }));

    const { generateOrganizerPlan } = await import("./organizerPlan.js");
    const plan = await generateOrganizerPlan();
    const byName = Object.fromEntries(plan.items.map((i) => [i.sourcePath.split("/").pop(), i]));

    expect(byName["foto.jpg"].sourceKind).toBe("dispositivo");
    expect(byName["foto.jpg"].sourceLabel).toBe("celular");
    expect(byName["arquivo-solto.pdf"].sourceKind).toBe("dispositivo");
    expect(byName["arquivo-solto.pdf"].sourceLabel).toBe("dispositivos");
  });

  it("planeja arquivo elegível em árvore profunda mantendo só o basename", async () => {
    const uploadsDir = join(tmpDir, "entrada", "uploads");
    const deepDir = join(uploadsDir, "lote-legado-001", "Users", "user", "Documents", "filmes");
    await fs.mkdir(deepDir, { recursive: true });
    await fs.writeFile(join(deepDir, "exemplo.mkv"), "x");
    const oldDate = new Date("2018-10-20T12:00:00.000Z");
    await fs.utimes(join(deepDir, "exemplo.mkv"), oldDate, oldDate);

    vi.doMock("./storageModel.js", () => ({
      getStorageModel: () => ({
        root: "/KALINE",
        folders: [{ id: "entrada-uploads", label: "Uploads", absolutePath: uploadsDir }],
      }),
    }));
    vi.doMock("./config.js", () => ({ config: { storageSources: [] } }));

    const { generateOrganizerPlan } = await import("./organizerPlan.js");
    const plan = await generateOrganizerPlan();

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].targetPath).toBe("/KALINE/midia/videos/2018/10/exemplo.mkv");
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
      planId: "plan_1783200000000_deadbeef",
      generatedAt: new Date().toISOString(),
      items: [{ id: "a", sourcePath: "/x", targetPath: "/y", action: "move", status: "planned" }],
      summary: { total: 1, planned: 1, conflicts: 0 },
    };
    await writePlan(plan, tmpDir);
    const read = await getPlan("plan_1783200000000_deadbeef", tmpDir);
    expect(read).toEqual(plan);
  });

  it("retorna null para planId bem formado mas inexistente", async () => {
    const read = await getPlan("plan_1783299999999_00000000", tmpDir);
    expect(read).toBeNull();
  });

  it("retorna null para planId malformado, sem tentar ler o disco (proteção contra path traversal)", async () => {
    expect(await getPlan("plan_nao_existe", tmpDir)).toBeNull();
    expect(await getPlan("../../../../etc/passwd", tmpDir)).toBeNull();
    expect(await getPlan(undefined, tmpDir)).toBeNull();
  });
});
