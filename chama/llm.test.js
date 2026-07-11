import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config.js";
import { getLlmHealth, generateLocalChat, DEFAULT_MODEL, ALLOWED_MODELS } from "./llm.js";

const originalFetch = globalThis.fetch;
const originalHealthTimeout = config.llmHealthTimeoutMs;
const originalChatTimeout = config.llmChatTimeoutMs;

describe("llm local bridge", () => {
  beforeEach(() => {
    config.llmHealthTimeoutMs = 25;
    config.llmChatTimeoutMs = 75;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.llmHealthTimeoutMs = originalHealthTimeout;
    config.llmChatTimeoutMs = originalChatTimeout;
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

  it("mantém allowlist dos modelos locais leves aprovados", () => {
    expect(ALLOWED_MODELS).toContain("qwen2.5:1.5b");
    expect(ALLOWED_MODELS).toContain("hf.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q8_0");
    expect(DEFAULT_MODEL).toBe("qwen2.5:latest");
  });

  it("health usa timeout curto e degrada para ok=false em timeout", async () => {
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

  it("chat usa timeout longo e sinaliza timeout interno", async () => {
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

    const pending = generateLocalChat({ message: "oi", facet: "klio" });
    await vi.advanceTimersByTimeAsync(74);
    await Promise.resolve();
    await expect(Promise.race([pending, Promise.resolve("still-pending")])).resolves.toBe(
      "still-pending",
    );
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).rejects.toMatchObject({
      code: "ELLMUNAVAILABLE",
      reasonCode: "LLM_TIMEOUT",
    });
  });

  it("chat valida entrada antes de chamar Ollama", async () => {
    globalThis.fetch = vi.fn();

    await expect(generateLocalChat({ message: "   ", facet: "klio" })).rejects.toMatchObject({
      code: "INVALID_MESSAGE",
    });
    await expect(generateLocalChat({ message: "oi", facet: "fora" })).rejects.toMatchObject({
      code: "INVALID_FACET",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejeita payloads gigantes ou não string antes do fetch", async () => {
    globalThis.fetch = vi.fn();

    await expect(
      generateLocalChat({ message: "x".repeat(12_001), facet: "klio" }),
    ).rejects.toMatchObject({
      code: "INVALID_MESSAGE",
    });
    await expect(
      generateLocalChat({ message: "oi", facet: "klio", contextBlock: "x".repeat(40_001) }),
    ).rejects.toMatchObject({ code: "INVALID_CONTEXT_BLOCK" });
    await expect(
      generateLocalChat({ message: "oi", facet: "klio", structuredPrompt: "x".repeat(40_001) }),
    ).rejects.toMatchObject({ code: "INVALID_STRUCTURED_PROMPT" });
    await expect(
      generateLocalChat({ message: "oi", facet: "klio", contextBlock: { unsafe: true } }),
    ).rejects.toMatchObject({ code: "INVALID_CONTEXT_BLOCK" });
    await expect(
      generateLocalChat({ message: "oi", facet: "klio", structuredPrompt: { unsafe: true } }),
    ).rejects.toMatchObject({ code: "INVALID_STRUCTURED_PROMPT" });
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
