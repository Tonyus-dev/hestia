import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config.js";
import { getLlmHealth, generateLocalChat, DEFAULT_MODEL } from "./llm.js";

const originalFetch = globalThis.fetch;
const originalTimeout = config.llmTimeoutMs;

describe("llm local bridge", () => {
  beforeEach(() => {
    config.llmTimeoutMs = 25;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.llmTimeoutMs = originalTimeout;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("health retorna shape previsível quando Ollama responde", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: DEFAULT_MODEL }, { name: 123 }, {}] }),
    }));

    const health = await getLlmHealth();

    expect(health.ok).toBe(true);
    expect(health.runtime).toBe("ollama");
    expect(health.models).toEqual([DEFAULT_MODEL]);
    expect(health.defaultModel).toBe(DEFAULT_MODEL);
    expect(health.timeoutMs).toBe(25);
  });

  it("health não trava e degrada para ok=false em timeout", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const pending = getLlmHealth();
    await vi.advanceTimersByTimeAsync(25);
    const health = await pending;

    expect(health.ok).toBe(false);
    expect(health.error).toBe("Ollama indisponível");
    expect(health.detail).toContain("Tempo esgotado");
    expect(health.timeoutMs).toBe(25);
  });

  it("chat valida entrada antes de chamar Ollama", async () => {
    globalThis.fetch = vi.fn();

    await expect(generateLocalChat({ message: "   ", facet: "klio" })).rejects.toMatchObject({
      code: "ELLMBADREQUEST",
    });
    await expect(generateLocalChat({ message: "oi", facet: "fora" })).rejects.toMatchObject({
      code: "ELLMBADREQUEST",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("chat usa modelo default permitido e stream=false", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: "olá" }) }));

    const out = await generateLocalChat({ message: "oi", facet: "klio" });

    expect(out).toMatchObject({
      ok: true,
      text: "olá",
      model: DEFAULT_MODEL,
      runtime: "hestia-llm",
    });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ model: DEFAULT_MODEL, stream: false });
  });
});
