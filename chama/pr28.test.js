import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import Fastify from "fastify";

import {
  getCodiceHealth,
  getCodiceLibrary,
  resolveCodiceBook,
  getBookHeaders,
  clearCodiceCache,
} from "./codice.js";
import { registerCodiceRoutes } from "./codiceRoutes.js";
import { claimAndApplyOrganizerPlan, LARGE_PLAN_THRESHOLD } from "./organizerApply.js";
import { getPlanState } from "./organizerPlan.js";

async function makeTmpDir(prefix) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("PR #28 - Codice and Organizer Security Contracts", () => {
  let workDir;
  let dataDir;

  beforeEach(async () => {
    clearCodiceCache();
    workDir = await makeTmpDir("hestia-pr28-work-");
    process.env.HESTIA_STORAGE_PATH = workDir;
    dataDir = await makeTmpDir("hestia-pr28-data-");
    await fs.mkdir(path.join(dataDir, "events"), { recursive: true });
    await fs.mkdir(path.join(dataDir, "organizer", "plans"), { recursive: true });

    // Setup codice directories
    await fs.mkdir(path.join(workDir, "codice/epub"), { recursive: true });
    await fs.mkdir(path.join(workDir, "codice/pdf"), { recursive: true });
    await fs.mkdir(path.join(workDir, "codice/txt"), { recursive: true });
  });

  afterEach(async () => {
    delete process.env.HESTIA_STORAGE_PATH;
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("Códice Security", () => {
    it("valida health check de acordo com presença de pastas essenciais", async () => {
      const health = await getCodiceHealth(workDir);
      expect(health.ok).toBe(true);
      expect(health.libraryAvailable).toBe(true);

      const emptyDir = await makeTmpDir("hestia-pr28-empty-");
      await expect(getCodiceHealth(emptyDir)).rejects.toThrow("CODICE_LIBRARY_UNAVAILABLE");
      await fs.rm(emptyDir, { recursive: true, force: true }).catch(() => {});
    });

    it("filtra dotfiles, formatos inválidos, limita recursão/profundidade e não vaza caminhos internos", async () => {
      // 1. Arquivos válidos
      await fs.writeFile(path.join(workDir, "codice/epub/livro.epub"), "epub content");
      await fs.writeFile(path.join(workDir, "codice/pdf/doc.pdf"), "pdf content");
      await fs.writeFile(path.join(workDir, "codice/txt/readme.txt"), "txt content");

      // 2. Arquivos inválidos/dotfiles
      await fs.writeFile(path.join(workDir, "codice/epub/.hidden.epub"), "hidden");
      await fs.writeFile(path.join(workDir, "codice/pdf/image.png"), "png"); // ext desconhecida

      // 3. Profundidade excessiva (MAX_DEPTH = 5)
      let deepDir = path.join(workDir, "codice/epub");
      for (let i = 0; i < 7; i++) {
        deepDir = path.join(deepDir, `sub_${i}`);
        await fs.mkdir(deepDir, { recursive: true });
      }
      await fs.writeFile(path.join(deepDir, "deep.epub"), "too deep");

      const library = await getCodiceLibrary(workDir);
      expect(library.books.length).toBe(3); // livro, doc, readme

      const titles = library.books.map((b) => b.title);
      expect(titles).toContain("livro");
      expect(titles).toContain("doc");
      expect(titles).toContain("readme");
      expect(titles).not.toContain("deep");
      expect(titles).not.toContain(".hidden");

      // Prova que campos internos não são vazados na biblioteca pública
      for (const book of library.books) {
        expect(book._fullPath).toBeUndefined();
        expect(book._relPath).toBeUndefined();
        // ID deve ser sha256 base64url do relPath
        expect(book.id).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it("rejeita symlinks e escapes de diretório usando resolveCodiceBook", async () => {
      // Cria arquivo real
      await fs.writeFile(path.join(workDir, "codice/epub/real.epub"), "real content");
      const library = await getCodiceLibrary(workDir);
      const book = library.books[0];

      // Prova que resolve com sucesso
      const resolved = await resolveCodiceBook(workDir, book.id);
      expect(resolved).not.toBeNull();
      expect(resolved.filename).toBe("real.epub");

      // Cria symlink apontando para arquivo fora da raiz
      const outsideFile = path.join(os.tmpdir(), "outside.epub");
      await fs.writeFile(outsideFile, "outside content");
      const symlinkPath = path.join(workDir, "codice/epub/sym.epub");
      await fs.symlink(outsideFile, symlinkPath);

      // Limpa cache gerando biblioteca de novo
      clearCodiceCache();
      const library2 = await getCodiceLibrary(workDir);
      const symBook = library2.books.find((b) => b.name === "sym.epub");
      // O indexador já deve ignorar symlinks
      expect(symBook).toBeUndefined();

      // Limpa arquivo fora do temporário
      await fs.unlink(outsideFile).catch(() => {});
    });

    it("gera headers corretos: Weak ETag estável e Content-Disposition com RFC 5987", async () => {
      const resolved = {
        fullPath: "/some/path/doc.pdf",
        mimeType: "application/pdf",
        stat: {
          size: 1024,
          mtime: new Date("2026-07-13T00:00:00.000Z"),
        },
        filename: "Livro de Héstia & Códice.pdf",
      };

      const headers = getBookHeaders(resolved);
      expect(headers["Content-Type"]).toBe("application/pdf");
      expect(headers["Content-Length"]).toBe("1024");

      const expectedEtag = `W/"1024-${resolved.stat.mtime.getTime()}"`;
      expect(headers["ETag"]).toBe(expectedEtag);
      expect(headers["Cache-Control"]).toBe("private, no-store");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");

      // Content-Disposition format
      const cd = headers["Content-Disposition"];
      expect(cd).toContain('filename="Livro de H_stia & C_dice.pdf"'); // ASCII sanitizado, & preservado
      expect(cd).toContain("filename*=UTF-8''Livro%20de%20H%C3%A9stia%20%26%20C%C3%B3dice.pdf"); // RFC 5987 UTF-8
    });

    it("valida rotas HTTP reais do Códice usando Fastify inject", async () => {
      const app = Fastify();
      registerCodiceRoutes(app, { storageRoot: workDir });

      // 1. Testa health
      const resHealth = await app.inject({
        method: "GET",
        url: "/api/codice/health",
      });
      expect(resHealth.statusCode).toBe(200);
      const healthData = JSON.parse(resHealth.payload);
      expect(healthData.ok).toBe(true);

      // 2. Cria livros
      await fs.writeFile(path.join(workDir, "codice/epub/test.epub"), "epub book");

      // 3. Testa library
      const resLib = await app.inject({
        method: "GET",
        url: "/api/codice/library",
      });
      expect(resLib.statusCode).toBe(200);
      const libData = JSON.parse(resLib.payload);
      expect(libData.books.length).toBe(1);
      const book = libData.books[0];
      expect(book.name).toBe("test.epub");

      // 4. Testa HEAD livro
      const resHead = await app.inject({
        method: "HEAD",
        url: `/api/codice/books/${book.id}`,
      });
      expect(resHead.statusCode).toBe(200);
      expect(resHead.headers["content-type"]).toBe("application/epub+zip");
      expect(resHead.headers["content-length"]).toBe("9");
      expect(resHead.headers["etag"]).toContain('W/"9-');

      // 5. Testa GET livro
      const resGet = await app.inject({
        method: "GET",
        url: `/api/codice/books/${book.id}`,
      });
      expect(resGet.statusCode).toBe(200);
      expect(resGet.payload).toBe("epub book");

      // 6. Testa wildcard rota inexistente
      const res404 = await app.inject({
        method: "GET",
        url: "/api/codice/invalid-endpoint-abc",
      });
      expect(res404.statusCode).toBe(404);

      // 7. Testa wildcard método inválido (POST na library)
      const res405 = await app.inject({
        method: "POST",
        url: "/api/codice/library",
      });
      expect(res405.statusCode).toBe(405);
    });
  });

  describe("Organizer Idempotency & Claims", () => {
    it("valida claiming atômico de planos e idempotência", async () => {
      const planId = "plan_1719876543_abcdef00";
      const plansDir = path.join(dataDir, "organizer", "plans");
      const planFile = path.join(plansDir, `${planId}.json`);

      const sourceFile = path.join(workDir, "origem.pdf");
      const targetFile = path.join(workDir, "codice/pdf/2026/07/origem.pdf");
      await fs.writeFile(sourceFile, "pdf content");

      const planData = {
        planId,
        generatedAt: new Date().toISOString(),
        items: [
          {
            id: "item1",
            sourcePath: sourceFile,
            targetPath: targetFile,
            action: "move",
            status: "planned",
          },
        ],
      };

      await fs.writeFile(planFile, JSON.stringify(planData));

      // Estado inicial deve ser "available"
      expect(await getPlanState(planId, dataDir)).toBe("available");

      // Primeira execução: reivindica e aplica com sucesso
      const manifest = await claimAndApplyOrganizerPlan(planId, dataDir);
      expect(manifest.status).toBe("applied");

      // Estado agora deve ser "consumed"
      expect(await getPlanState(planId, dataDir)).toBe("consumed");

      // Segunda execução: deve falhar informando que o plano já foi consumido/aplicado
      await expect(claimAndApplyOrganizerPlan(planId, dataDir)).rejects.toMatchObject({
        code: "PLAN_ALREADY_APPLIED",
      });
    });

    it("rejeita e não sobrescreve se o target já existe no disco durante apply", async () => {
      const planId = "plan_1719876544_abcdef01";
      const plansDir = path.join(dataDir, "organizer", "plans");
      const planFile = path.join(plansDir, `${planId}.json`);

      const sourceFile = path.join(workDir, "origem2.pdf");
      const targetFile = path.join(workDir, "codice/pdf/2026/07/origem2.pdf");
      await fs.writeFile(sourceFile, "pdf content new");

      // Cria o arquivo de destino antecipadamente para simular um conflito real no disco
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, "existing target content");

      const planData = {
        planId,
        generatedAt: new Date().toISOString(),
        items: [
          {
            id: "item1",
            sourcePath: sourceFile,
            targetPath: targetFile,
            action: "copy",
            status: "planned",
          },
        ],
      };

      await fs.writeFile(planFile, JSON.stringify(planData));

      // Deve executar, mas marcar a operação como falha/skipped devido ao conflito no disco
      const manifest = await claimAndApplyOrganizerPlan(planId, dataDir);
      expect(manifest.operations[0].status).not.toBe("ok");
      expect(manifest.summary.ok).toBe(0);

      // Garante que o arquivo de destino NÃO foi modificado/sobrescrito
      const content = await fs.readFile(targetFile, "utf8");
      expect(content).toBe("existing target content");
    });

    it("valida claiming concorrente com Promise.allSettled", async () => {
      const planId = "plan_1719876545_abcdef02";
      const plansDir = path.join(dataDir, "organizer", "plans");
      const planFile = path.join(plansDir, `${planId}.json`);

      const sourceFile = path.join(workDir, "origem3.pdf");
      const targetFile = path.join(workDir, "codice/pdf/2026/07/origem3.pdf");
      await fs.writeFile(sourceFile, "pdf content concorrente");

      const planData = {
        planId,
        generatedAt: new Date().toISOString(),
        items: [
          {
            id: "item1",
            sourcePath: sourceFile,
            targetPath: targetFile,
            action: "copy",
            status: "planned",
          },
        ],
      };

      await fs.writeFile(planFile, JSON.stringify(planData));

      // Dispara 5 execuções concorrentes do mesmo plano
      const results = await Promise.allSettled([
        claimAndApplyOrganizerPlan(planId, dataDir),
        claimAndApplyOrganizerPlan(planId, dataDir),
        claimAndApplyOrganizerPlan(planId, dataDir),
        claimAndApplyOrganizerPlan(planId, dataDir),
        claimAndApplyOrganizerPlan(planId, dataDir),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Comprova que APENAS UMA chamada executou com sucesso
      expect(fulfilled.length).toBe(1);
      // E as demais 4 foram rejeitadas
      expect(rejected.length).toBe(4);

      // Comprova que os erros das rejeitadas são de concorrência ou plano consumido
      for (const r of rejected) {
        expect(["PLAN_ALREADY_CLAIMED", "PLAN_ALREADY_APPLIED", "EPLANNOTFOUND"]).toContain(
          r.reason.code,
        );
      }
    });

    it("GET livro com erro de leitura (arquivo removido antes de abrir) retorna 503 controlado sem vazar paths", async () => {
      const app = Fastify();
      registerCodiceRoutes(app, { storageRoot: workDir });

      const bookPath = path.join(workDir, "codice/epub/removido.epub");
      await fs.writeFile(bookPath, "conteudo temporario");

      const resLib = await app.inject({
        method: "GET",
        url: "/api/codice/library",
      });
      const libData = JSON.parse(resLib.payload);
      const book = libData.books.find((b) => b.name === "removido.epub");
      expect(book).toBeDefined();

      // Torna o arquivo ilegível para simular falha de abertura/leitura física
      await fs.chmod(bookPath, 0o000);

      try {
        const resGet = await app.inject({
          method: "GET",
          url: `/api/codice/books/${book.id}`,
        });

        expect(resGet.statusCode).toBe(503);
        const payload = JSON.parse(resGet.payload);
        expect(payload.ok).toBe(false);
        expect(payload.code).toBe("CODICE_BOOK_UNAVAILABLE");

        const strPayload = JSON.stringify(payload);
        expect(strPayload).not.toContain("removido.epub");
        expect(strPayload).not.toContain(workDir);
        expect(strPayload).not.toContain("/KALINE");
        expect(strPayload).not.toContain("tonyus-dev");
      } finally {
        // Restaura permissão para permitir remoção limpa
        await fs.chmod(bookPath, 0o644).catch(() => {});
      }
    });

    it("GET livro com O_NOFOLLOW recusa e falha com 503 quando o arquivo foi substituído por symlink", async () => {
      const app = Fastify();
      registerCodiceRoutes(app, { storageRoot: workDir });

      const realFilePath = path.join(workDir, "codice/epub/symlink-target.epub");
      await fs.writeFile(realFilePath, "livro legitimo");

      const resLib = await app.inject({
        method: "GET",
        url: "/api/codice/library",
      });
      const libData = JSON.parse(resLib.payload);
      const book = libData.books.find((b) => b.name === "symlink-target.epub");
      expect(book).toBeDefined();

      const externalPath = path.join(os.tmpdir(), "pr28-external-content.txt");
      await fs.writeFile(externalPath, "conteudo secreto fora da raiz");

      const originalLstat = fs.lstat;
      const lstatSpy = vi.spyOn(fs, "lstat").mockImplementation(async (path) => {
        if (path === realFilePath) {
          return {
            isSymbolicLink: () => false,
            isFile: () => true,
            size: 14,
            mtime: new Date(),
          };
        }
        return originalLstat(path);
      });

      const originalRealpath = fs.realpath;
      const realpathSpy = vi.spyOn(fs, "realpath").mockImplementation(async (path) => {
        if (path === realFilePath) {
          return realFilePath;
        }
        return originalRealpath(path);
      });

      await fs.unlink(realFilePath);
      await fs.symlink(externalPath, realFilePath);

      try {
        const resGet = await app.inject({
          method: "GET",
          url: `/api/codice/books/${book.id}`,
        });

        expect(resGet.statusCode).toBe(503);
        const payload = JSON.parse(resGet.payload);
        expect(payload.ok).toBe(false);
        expect(payload.code).toBe("CODICE_BOOK_UNAVAILABLE");

        expect(resGet.payload).not.toContain("conteudo secreto fora da raiz");
        expect(resGet.payload).not.toContain(workDir);
        expect(resGet.payload).not.toContain("pr28-external-content.txt");
      } finally {
        lstatSpy.mockRestore();
        realpathSpy.mockRestore();
        await fs.unlink(realFilePath).catch(() => {});
        await fs.unlink(externalPath).catch(() => {});
      }
    });

    describe("Mapeamento de Erros da Biblioteca para 503", () => {
      afterEach(() => {
        vi.restoreAllMocks();
        clearCodiceCache();
      });

      const unavailabilityCodes = ["EACCES", "EPERM", "EIO", "EMFILE", "ENFILE", "ESTALE", "ENODEV"];

      unavailabilityCodes.forEach((code) => {
        it(`retorna HTTP 503 com CODICE_LIBRARY_UNAVAILABLE para erro de disco ${code}`, async () => {
          const app = Fastify();
          registerCodiceRoutes(app, { storageRoot: workDir });

          const spy = vi.spyOn(fs, "readdir").mockRejectedValue(Object.assign(new Error(code), { code }));

          const res = await app.inject({
            method: "GET",
            url: "/api/codice/library",
          });

          expect(res.statusCode).toBe(503);
          const payload = JSON.parse(res.payload);
          expect(payload.ok).toBe(false);
          expect(payload.code).toBe("CODICE_LIBRARY_UNAVAILABLE");
        });
      });

      it("retorna HTTP 503 com CODICE_LIBRARY_UNAVAILABLE quando a biblioteca está ausente (ECODICELIBRARY)", async () => {
        const app = Fastify();
        registerCodiceRoutes(app, { storageRoot: workDir });

        const spy = vi.spyOn(fs, "access").mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

        const res = await app.inject({
          method: "GET",
          url: "/api/codice/library",
        });

        expect(res.statusCode).toBe(503);
        const payload = JSON.parse(res.payload);
        expect(payload.ok).toBe(false);
        expect(payload.code).toBe("CODICE_LIBRARY_UNAVAILABLE");
      });

      it("retorna HTTP 500 para erros desconhecidos na biblioteca", async () => {
        const app = Fastify();
        registerCodiceRoutes(app, { storageRoot: workDir });

        const spy = vi.spyOn(fs, "readdir").mockRejectedValue(new Error("unknown unexpected error"));

        const res = await app.inject({
          method: "GET",
          url: "/api/codice/library",
        });

        expect(res.statusCode).toBe(500);
        const payload = JSON.parse(res.payload);
        expect(payload.ok).toBe(false);
        expect(payload.code).toBe("INTERNAL_SERVER_ERROR");
        expect(res.payload).not.toContain("unknown unexpected error");
      });
    });

    it("exporta limite de plano grande coerente com o limiar", () => {
      expect(LARGE_PLAN_THRESHOLD).toBe(5000);
    });
  });
});
