import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nav } from "./kaline";

describe("navegação principal", () => {
  it("oculta o Códice legado sem remover sua rota de compatibilidade", () => {
    expect(nav.some((item) => item.to === "/codice")).toBe(false);
    expect(nav.some((item) => item.label === "Códice")).toBe(false);
    expect(nav.some((item) => item.to === "/organizador")).toBe(true);
    expect(nav.some((item) => item.to === "/assistente")).toBe(true);
    expect(existsSync(join(process.cwd(), "src/routes/_station.codice.tsx"))).toBe(true);
  });
});
