import { describe, it, expect } from "vitest";
import { stableStringify } from "@/components/hestia/UnavailableNote";

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
