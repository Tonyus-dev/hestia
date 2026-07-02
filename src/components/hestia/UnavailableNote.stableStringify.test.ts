import { describe, it, expect } from "vitest";
import {
  buildDownloadFilename,
  buildReadableDetails,
  formatJson,
  stableStringify,
} from "@/components/hestia/UnavailableNote";
import type { ApiErrorDetails } from "@/lib/hestia/api";


describe("stableStringify", () => {
  it("orders keys alphabetically at any depth", () => {
    const a = stableStringify({ b: 1, a: 2, c: { z: 1, a: 2 } });
    const b = stableStringify({ c: { a: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe(
      ['{', '  "a": 2,', '  "b": 1,', '  "c": {', '    "a": 2,', '    "z": 1', '  }', "}"].join(
        "\n",
      ),
    );
  });

  it("preserves array element order", () => {
    expect(stableStringify({ items: [3, 1, 2] })).toContain('"items": [\n    3,\n    1,\n    2\n  ]');
  });

  it("handles circular refs without throwing", () => {
    const obj: Record<string, unknown> = { name: "x" };
    obj.self = obj;
    const out = stableStringify(obj);
    expect(out).toContain('"self": "[Circular]"');
    expect(out).toContain('"name": "x"');
  });
});

describe("buildDownloadFilename", () => {
  it("uses route slug and timestamp", () => {
    const name = buildDownloadFilename("/api/server/status");
    expect(name).toMatch(/^hestia-api_server_status-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });

  it("falls back to error when route is absent", () => {
    const name = buildDownloadFilename();
    expect(name).toMatch(/^hestia-error-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });

  it("sanitizes special characters in route", () => {
    const name = buildDownloadFilename("/api/logs?tail=100");
    expect(name).toMatch(/^hestia-api_logs_tail_100-/);
  });

  it("falls back to error for empty slug after stripping slash", () => {
    const name = buildDownloadFilename("/");
    expect(name).toMatch(/^hestia-error-/);
  });
});

describe("buildReadableDetails", () => {
  const baseDetails: ApiErrorDetails = {
    origin: "http",
    route: "/api/server/status",
    httpStatus: 500,
    code: "ENOENT",
    error: "Disk read failed",
    detail: "could not read /tmp/logs",
    hint: "Verifique permissões de leitura",
    at: "2026-07-02T17:00:00Z",
  };

  it("produces a human-readable multiline string with all expected fields", () => {
    const text = buildReadableDetails("Server indisponível", baseDetails);
    expect(text).toContain("Héstia Console — detalhes do erro");
    expect(text).toContain("status: http");
    expect(text).toContain("rota: /api/server/status");
    expect(text).toContain("http: 500");
    expect(text).toContain("code: ENOENT");
    expect(text).toContain("error: Disk read failed");
    expect(text).toContain("hint: Verifique permissões de leitura");
    expect(text).toContain("at: 2026-07-02T17:00:00Z");
    expect(text).toContain("timeout: —");
    expect(text).toContain("mensagem: Server indisponível");
  });

  it("renders timeout ms when provided", () => {
    const text = buildReadableDetails(undefined, {
      ...baseDetails,
      origin: "timeout",
      timeoutMs: 3000,
      httpStatus: undefined,
    });
    expect(text).toContain("status: timeout");
    expect(text).toContain("http: —");
    expect(text).toContain("timeout: 3000ms");
    expect(text).toContain("mensagem: —");
  });

  it("falls back to em dashes for missing fields", () => {
    const text = buildReadableDetails(undefined, { origin: "no-base" });
    expect(text).toContain("status: no-base");
    expect(text).toContain("rota: —");
    expect(text).toContain("http: —");
    expect(text).toContain("code: —");
    expect(text).toContain("error: —");
  });
});
