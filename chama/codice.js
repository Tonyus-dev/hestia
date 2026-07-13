import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ALLOWED_FOLDERS = ["codice/epub", "codice/pdf", "codice/txt"];
const ALLOWED_EXTENSIONS = {
  ".epub": "application/epub+zip",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export async function getCodiceHealth(storagePathBase) {
  let libraryAvailable = true;
  for (const folder of ALLOWED_FOLDERS) {
    try {
      const fullPath = path.join(storagePathBase, folder);
      await fs.access(fullPath);
    } catch {
      // Se pelo menos uma das pastas base essenciais faltar (epub ou pdf), já recusa
      if (folder === "codice/epub" || folder === "codice/pdf") {
        libraryAvailable = false;
        break;
      }
    }
  }

  if (!libraryAvailable) {
    const error = new Error("CODICE_LIBRARY_UNAVAILABLE");
    error.code = "ECODICELIBRARY";
    throw error;
  }

  return {
    ok: true,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    libraryAvailable: true,
    formats: ["epub", "pdf", "txt"],
  };
}

async function indexLibrary(storagePathBase) {
  const books = [];
  
  for (const folder of ALLOWED_FOLDERS) {
    const rootPath = path.join(storagePathBase, folder);
    try {
      // Usando withFileTypes e recursive (Node >= 20.1.0)
      const entries = await fs.readdir(rootPath, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.startsWith(".")) continue;
        
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS[ext]) continue;

        // Node >= 20.12.0 introduziu parentPath, fallback para path (20.1.0)
        const dirPath = entry.parentPath || entry.path; 
        const fullPath = path.join(dirPath, entry.name);
        
        // Verificação estrita de symlink
        const stat = await fs.lstat(fullPath);
        if (stat.isSymbolicLink()) continue;

        const relPath = path.relative(storagePathBase, fullPath);
        const bookId = crypto.createHash("sha256").update(relPath).digest("base64url");
        
        books.push({
          id: bookId,
          name: entry.name,
          title: path.parse(entry.name).name,
          author: null,
          format: ext.slice(1),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          url: `/api/codice/books/${bookId}`,
          _fullPath: fullPath,
          _relPath: relPath
        });
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  
  return books;
}

export async function getCodiceLibrary(storagePathBase) {
  const books = await indexLibrary(storagePathBase);
  books.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  
  // Limpa campos internos antes de devolver
  const publicBooks = books.map(({ _fullPath, _relPath, ...rest }) => rest);
  
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    books: publicBooks,
  };
}

export async function resolveCodiceBook(storagePathBase, bookId) {
  const books = await indexLibrary(storagePathBase);
  const book = books.find(b => b.id === bookId);
  
  if (!book) return null;

  // Segurança extra na resolução do path
  const resolvedPath = path.resolve(storagePathBase, book._relPath);
  let realPath;
  try {
    realPath = await fs.realpath(resolvedPath);
  } catch {
    return null;
  }
  
  // Garantir que o realpath continua dentro de uma das raízes permitidas
  const isContained = ALLOWED_FOLDERS.some(folder => {
    const rootFolder = path.resolve(storagePathBase, folder);
    return realPath.startsWith(rootFolder + path.sep);
  });

  if (!isContained) return null;
  
  const stat = await fs.lstat(realPath);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  
  const mimeType = ALLOWED_EXTENSIONS[path.extname(realPath).toLowerCase()];
  if (!mimeType) return null;

  return {
    fullPath: realPath,
    mimeType,
    stat,
    filename: book.name
  };
}
