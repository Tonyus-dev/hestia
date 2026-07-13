import { constants } from "node:fs";
import { open } from "node:fs/promises";
import {
  getCodiceHealth,
  getCodiceLibrary,
  resolveCodiceBook,
  getBookHeaders,
  isCodiceLibraryUnavailableError,
} from "./codice.js";

export function registerCodiceRoutes(app, config) {
  app.get("/api/codice/health", async (req, reply) => {
    try {
      return await getCodiceHealth(config.storageRoot);
    } catch (err) {
      if (isCodiceLibraryUnavailableError(err)) {
        reply.code(503).send({
          ok: false,
          error: "Biblioteca do Códice indisponível",
          code: "CODICE_LIBRARY_UNAVAILABLE",
          at: new Date().toISOString(),
        });
        return;
      }
      reply.code(500).send({
        ok: false,
        error: "Erro interno do servidor",
        code: "INTERNAL_SERVER_ERROR",
        at: new Date().toISOString(),
      });
    }
  });

  app.get("/api/codice/library", async (req, reply) => {
    try {
      return await getCodiceLibrary(config.storageRoot);
    } catch (err) {
      if (isCodiceLibraryUnavailableError(err)) {
        reply.code(503).send({
          ok: false,
          error: "Biblioteca do Códice indisponível",
          code: "CODICE_LIBRARY_UNAVAILABLE",
          at: new Date().toISOString(),
        });
        return;
      }
      reply.code(500).send({
        ok: false,
        error: "Erro ao varrer a biblioteca",
        code: "INTERNAL_SERVER_ERROR",
        at: new Date().toISOString(),
      });
    }
  });

  app.head("/api/codice/books/:bookId", async (req, reply) => {
    try {
      const resolved = await resolveCodiceBook(config.storageRoot, req.params.bookId);
      if (!resolved) {
        reply.code(404).send({
          ok: false,
          error: "Livro não encontrado",
          code: "CODICE_BOOK_NOT_FOUND",
          at: new Date().toISOString(),
        });
        return;
      }
      const headers = getBookHeaders(resolved);
      reply.headers(headers);
      reply.code(200).send();
    } catch (err) {
      reply.code(500).send({
        ok: false,
        error: "Erro ao resolver livro",
        code: "INTERNAL_SERVER_ERROR",
        at: new Date().toISOString(),
      });
    }
  });

  app.get("/api/codice/books/:bookId", async (req, reply) => {
    let fileHandle = null;
    try {
      const resolved = await resolveCodiceBook(config.storageRoot, req.params.bookId);
      if (!resolved) {
        reply.code(404).send({
          ok: false,
          error: "Livro não encontrado",
          code: "CODICE_BOOK_NOT_FOUND",
          at: new Date().toISOString(),
        });
        return;
      }

      try {
        fileHandle = await open(resolved.fullPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (err) {
        reply.code(503).send({
          ok: false,
          error: "Não foi possível transmitir o livro.",
          code: "CODICE_BOOK_UNAVAILABLE",
          at: new Date().toISOString(),
        });
        return;
      }

      const openedStat = await fileHandle.stat();
      if (!openedStat.isFile()) {
        await fileHandle.close().catch(() => {});
        reply.code(503).send({
          ok: false,
          error: "Não foi possível transmitir o livro.",
          code: "CODICE_BOOK_UNAVAILABLE",
          at: new Date().toISOString(),
        });
        return;
      }

      const headers = getBookHeaders({ ...resolved, stat: openedStat });
      reply.headers(headers);

      const stream = fileHandle.createReadStream();

      stream.on("error", (err) => {
        if (!reply.raw.headersSent) {
          reply.code(503).send({
            ok: false,
            error: "Não foi possível transmitir o livro.",
            code: "CODICE_BOOK_UNAVAILABLE",
            at: new Date().toISOString(),
          });
        } else {
          reply.raw.destroy();
        }
        fileHandle?.close().catch(() => {});
      });

      reply.raw.on("close", () => {
        fileHandle?.close().catch(() => {});
      });

      return reply.send(stream);
    } catch (err) {
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
      reply.code(503).send({
        ok: false,
        error: "Não foi possível transmitir o livro.",
        code: "CODICE_BOOK_UNAVAILABLE",
        at: new Date().toISOString(),
      });
    }
  });

  // --- Wildcard router para fechar a API do Códice contra outros métodos e caminhos ---
  app.all("/api/codice/*", async (req, reply) => {
    if (req.method === "OPTIONS") {
      return reply.code(204).send();
    }

    const urlPath = req.routerPath || req.url;
    const pathname = urlPath.split("?")[0];

    const isHealth = pathname === "/api/codice/health";
    const isLibrary = pathname === "/api/codice/library";
    const parts = pathname.split("/").filter(Boolean);
    const isBook =
      parts.length === 4 && parts[0] === "api" && parts[1] === "codice" && parts[2] === "books";

    if (isHealth || isLibrary || isBook) {
      reply.code(405).send({
        ok: false,
        error: "Método não permitido",
        code: "METHOD_NOT_ALLOWED",
        at: new Date().toISOString(),
      });
      return;
    }

    reply.code(404).send({
      ok: false,
      error: "Recurso não encontrado",
      code: "CODICE_BOOK_NOT_FOUND",
      at: new Date().toISOString(),
    });
  });
}
