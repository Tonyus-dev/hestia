import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHermesStatus, processHermesOnce } from "./hermes.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function hermesRoot() {
  return await mkdtemp(path.join(tmpdir(), "hestia-hermes-"));
}

describe("hermes inbox/outbox", () => {
  it("status cria pastas e retorna contadores estáveis", async () => {
    const root = await hermesRoot();

    const status = await getHermesStatus({ hermesRoot: root });

    expect(status).toMatchObject({ ok: true, root, pending: 0, processed: 0, failed: 0 });
    expect(status.folders).toEqual({ inbox: true, outbox: true, archive: true, errors: true });
  });

  it("process-once executa station.status e arquiva comando", async () => {
    const root = await hermesRoot();
    await getHermesStatus({ hermesRoot: root });
    await writeFile(
      path.join(root, "inbox", "001.json"),
      JSON.stringify({
        id: "cmd-1",
        source: "klio",
        target: "hestia",
        type: "station.status",
        createdAt: new Date().toISOString(),
        payload: {},
      }),
    );

    const summary = await processHermesOnce({ hermesRoot: root });
    const result = JSON.parse(
      await readFile(path.join(root, "outbox", "cmd-1.result.json"), "utf8"),
    );

    expect(summary).toMatchObject({ ok: true, processed: 1, failed: 0, skipped: 0 });
    expect(result).toMatchObject({ id: "cmd-1", ok: true, type: "station.status.result" });
    await expect(readFile(path.join(root, "archive", "001.json"), "utf8")).resolves.toContain(
      "cmd-1",
    );
  });

  it("process-once rejeita llm.chat inválido sem chamar Ollama", async () => {
    const root = await hermesRoot();
    await getHermesStatus({ hermesRoot: root });
    globalThis.fetch = vi.fn();
    await writeFile(
      path.join(root, "inbox", "bad.json"),
      JSON.stringify({
        id: "bad-llm",
        source: "klio",
        target: "hestia",
        type: "llm.chat",
        createdAt: new Date().toISOString(),
        payload: { message: "" },
      }),
    );

    const summary = await processHermesOnce({ hermesRoot: root });
    const error = JSON.parse(
      await readFile(path.join(root, "errors", "bad-llm.error.json"), "utf8"),
    );

    expect(summary).toMatchObject({ ok: true, processed: 0, failed: 1 });
    expect(error.error).toContain("message deve ser string");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
