import { describe, it, expect } from "vitest";
import { isValidOrganizerId } from "./organizerIds.js";

describe("isValidOrganizerId", () => {
  it("aceita ids reais no formato gerado pelo próprio código", () => {
    expect(isValidOrganizerId("plan_1783204307166_b5741b91")).toBe(true);
    expect(isValidOrganizerId("org_1783204373777_04ed5e56")).toBe(true);
    expect(isValidOrganizerId("undo_1783205683641_9843fa4f")).toBe(true);
    expect(isValidOrganizerId("redo_1783206000000_deadbeef")).toBe(true);
  });

  it("rejeita path traversal", () => {
    expect(isValidOrganizerId("../../../../etc/passwd")).toBe(false);
    expect(isValidOrganizerId("plan_123_abcdefgh/../../../etc/passwd")).toBe(false);
    expect(isValidOrganizerId("..%2f..%2fetc%2fpasswd")).toBe(false);
  });

  it("rejeita prefixo desconhecido, hex inválido, ou formato incompleto", () => {
    expect(isValidOrganizerId("evil_123_abcdef12")).toBe(false);
    expect(isValidOrganizerId("plan_123_ZZZZZZZZ")).toBe(false);
    expect(isValidOrganizerId("plan_123")).toBe(false);
    expect(isValidOrganizerId("plan_123_abcdef1")).toBe(false); // 7 chars, precisa de 8
  });

  it("rejeita tipos não-string e valores vazios/nulos", () => {
    expect(isValidOrganizerId(undefined)).toBe(false);
    expect(isValidOrganizerId(null)).toBe(false);
    expect(isValidOrganizerId("")).toBe(false);
    expect(isValidOrganizerId(123)).toBe(false);
    expect(isValidOrganizerId({})).toBe(false);
  });
});
