import { describe, it, expect } from "vitest";
import {
  buildDownloadFilename,
  buildReadableDetails,
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
