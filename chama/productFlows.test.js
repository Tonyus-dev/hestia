import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pngSize(path) {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("fluxos de produto da Console", () => {
  it("declara PWA instalável sem service worker ou cache", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({
      name: "Héstia Console",
      short_name: "Héstia",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    for (const icon of manifest.icons) {
      const path = join(root, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(path)).toBe(true);
      const expected = Number(icon.sizes.split("x", 1)[0]);
      expect(pngSize(path)).toEqual({ width: expected, height: expected });
      expect(icon.purpose).toContain("maskable");
    }
    const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
    expect(rootRoute).toContain('rel: "manifest"');
    expect(rootRoute).toContain('name: "theme-color"');
    expect(existsSync(join(root, "public/sw.js"))).toBe(false);
    expect(existsSync(join(root, "public/service-worker.js"))).toBe(false);
  });

  it("Códice ativo usa somente a API da TV Box e não expõe importação", () => {
    const route = readFileSync(join(root, "src/routes/_station.codice.tsx"), "utf8");
    expect(route).toContain("hestiaApi.tvboxCodiceLibrary");
    expect(route).toContain("hestiaApi.tvboxCodiceBookUrl");
    for (const legacy of ["hestiaLegacyApi", "codiceImport", "LibreOffice", ".docx", "FileUp"])
      expect(route).not.toContain(legacy);
  });

  it("Kaline Rede abre fluxos na Console e mantém APIs somente copiáveis", () => {
    const rede = readFileSync(join(root, "public/rede/index.html"), "utf8");
    expect(rede).toMatch(/route:\s*"\/codice"/);
    expect(rede).toMatch(/route:\s*"\/organizador"/);
    expect(rede).toContain("Abrir na Héstia");
    expect(rede).toContain("Copiar endereço da API");
    expect(rede).toContain('const STORAGE_KEY = "kaline-rede.config.v1"');
    expect(rede).toContain("localStorage.setItem(STORAGE_KEY");
    expect(rede).not.toMatch(/kind:\s*"open",\s*key:\s*"(?:srv|tv)\.station"/);
    expect(rede).not.toMatch(/token/i);
  });
});
