import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

import { getCodiceHealth, getCodiceLibrary, resolveCodiceBook } from "./codice.js";

describe("Códice API", () => {
  let tempDir;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hestia-codice-test-"));
    // Cria a estrutura
    await fs.mkdir(path.join(tempDir, "codice/epub"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "codice/pdf"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "codice/txt"), { recursive: true });

    // Cria alguns arquivos fictícios
    await fs.writeFile(path.join(tempDir, "codice/epub/test1.epub"), "dummy epub");
    await fs.writeFile(path.join(tempDir, "codice/pdf/test2.pdf"), "dummy pdf");
    await fs.writeFile(path.join(tempDir, "codice/txt/test3.txt"), "dummy txt");
    await fs.writeFile(path.join(tempDir, "codice/epub/.hidden.epub"), "hidden");
    await fs.writeFile(path.join(tempDir, "codice/pdf/invalid.jpg"), "invalid");
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should return health ok when folders exist", async () => {
    const health = await getCodiceHealth(tempDir);
    expect(health.ok).toBe(true);
    expect(health.libraryAvailable).toBe(true);
  });

  it("should fail health if epub/pdf missing", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "hestia-codice-test-fail-"));
    await expect(getCodiceHealth(emptyDir)).rejects.toThrow("CODICE_LIBRARY_UNAVAILABLE");
    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it("should index valid books and ignore hidden/invalid formats", async () => {
    const library = await getCodiceLibrary(tempDir);
    expect(library.schemaVersion).toBe(1);
    expect(library.books.length).toBe(3);
    
    const formats = library.books.map(b => b.format).sort();
    expect(formats).toEqual(["epub", "pdf", "txt"]);
    
    // Check if internal fields were stripped
    const book = library.books[0];
    expect(book).not.toHaveProperty("_fullPath");
    expect(book).not.toHaveProperty("_relPath");
  });

  it("should resolve a valid book by ID", async () => {
    const library = await getCodiceLibrary(tempDir);
    const book = library.books.find(b => b.format === "epub");
    
    const resolved = await resolveCodiceBook(tempDir, book.id);
    expect(resolved).not.toBeNull();
    expect(resolved.mimeType).toBe("application/epub+zip");
    expect(resolved.filename).toBe(book.name);
  });

  it("should refuse to resolve invalid book ID", async () => {
    const resolved = await resolveCodiceBook(tempDir, "invalid-id");
    expect(resolved).toBeNull();
  });
});
