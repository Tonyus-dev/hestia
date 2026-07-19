import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config.js";
import {
  getLlmHealth,
  generateLocalChat,
  generatePromptForge,
  DEFAULT_MODEL,
  ALLOWED_MODELS,
  PROMPTFORGE_MODEL,
  PROMPTFORGE_TASKS,
} from "./llm.js";
import { registerLlmCorsHooks, registerPromptForgeRoute } from "./llmRoutes.js";

const originalFetch = globalThis.fetch;
const originalHealthTimeout = config.llmHealthTimeoutMs;
const originalChatTimeout = config.llmChatTimeoutMs;
const originalKalineCorsOrigin = config.kalineCorsOrigin;

function mockPromptForgeOllama(response = "Prompt pronto") {
  return vi.fn(async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/api/tags") {
      return { ok: true, json: async () => ({ models: [{ name: PROMPTFORGE_MODEL }] }) };
    }
    return { ok: true, json: async () => ({ response }) };
  });
}

describe("llm local bridge", () => {
  beforeEach(() => {
    config.llmHealthTimeoutMs = 25;
    config.llmChatTimeoutMs = 75;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.llmHealthTimeoutMs = originalHealthTimeout;
    config.llmChatTimeoutMs = originalChatTimeout;
    config.kalineCorsOrigin = originalKalineCorsOrigin;
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
    expect(health.promptForge).toEqual({
      available: true,
      model: PROMPTFORGE_MODEL,
      role: "promptforge",
      tasks: PROMPTFORGE_TASKS,
    });
  });

  it("mantém allowlist dos modelos locais leves aprovados", () => {
    expect(ALLOWED_MODELS).toContain("qwen2.5:3b");
    expect(ALLOWED_MODELS).toContain("qwen2.5:1.5b");
    expect(ALLOWED_MODELS).toContain("qwen2.5:0.5b");
    expect(ALLOWED_MODELS).toContain("qwen3.5-0.8b");
    expect(DEFAULT_MODEL).toBe("qwen2.5:3b");
  });

  it("expõe somente a interseção instalada e permitida na ordem de preferência", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: "modelo-proibido" }, { name: "qwen2.5:1.5b" }, { name: "qwen2.5:3b" }],
      }),
    }));

    const health = await getLlmHealth();
    expect(health.models).toEqual(["modelo-proibido", "qwen2.5:1.5b", "qwen2.5:3b"]);
    expect(health.availableModels).toEqual(["qwen2.5:3b", "qwen2.5:1.5b"]);
    expect(health.defaultModel).toBe("qwen2.5:3b");
    expect(PROMPTFORGE_MODEL).toBe("qwen2.5:3b");
  });

  it("não resolve modelo padrão quando nenhum instalado é permitido", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: "modelo-proibido" }] }),
    }));
    const health = await getLlmHealth();
    expect(health.availableModels).toEqual([]);
    expect(health.defaultModel).toBeNull();
    expect(health.promptForge.available).toBe(false);
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
    expect(health.promptForge.available).toBe(false);
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

  it.each(["qwen2.5:3b", "qwen2.5:1.5b"])("chat aceita o modelo real %s", async (model) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: "olá" }) }));
    await expect(generateLocalChat({ message: "oi", model })).resolves.toMatchObject({ model });
  });

  it("chat rejeita modelo fora da allowlist antes do fetch", async () => {
    globalThis.fetch = vi.fn();
    await expect(
      generateLocalChat({ message: "oi", model: "modelo-proibido" }),
    ).rejects.toMatchObject({ code: "EMODELNOTALLOWED" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("PromptForge bridge", () => {
  beforeEach(() => {
    config.llmHealthTimeoutMs = 25;
    config.llmChatTimeoutMs = 75;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.llmHealthTimeoutMs = originalHealthTimeout;
    config.llmChatTimeoutMs = originalChatTimeout;
    config.kalineCorsOrigin = originalKalineCorsOrigin;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const validPayload = {
    task: "create_prompt",
    input: "Prepare um prompt para um modelo pago corrigir um bug e entregar um patch mínimo.",
    confirmedContext: "O código e o erro ainda serão anexados pelo usuário.",
    constraints: ["não inventar arquivos", "não produzir o patch localmente"],
  };

  it.each(PROMPTFORGE_TASKS)("aceita a task textual %s", async (task) => {
    globalThis.fetch = mockPromptForgeOllama("Prompt pronto");

    const out = await generatePromptForge({ ...validPayload, task });

    expect(out).toMatchObject({
      ok: true,
      schemaVersion: 1,
      provider: "ollama",
      model: PROMPTFORGE_MODEL,
      role: "promptforge",
      task,
      executed: false,
      content: "Prompt pronto",
    });
    expect(typeof out.durationMs).toBe("number");
    expect(typeof out.generatedAt).toBe("string");
  });

  it("fixa modelo, opções determinísticas e stream=false", async () => {
    globalThis.fetch = mockPromptForgeOllama("ok");

    await generatePromptForge(validPayload);

    const [url, init] = globalThis.fetch.mock.calls[1];
    expect(String(url)).toContain("/api/generate");
    expect(JSON.parse(init.body)).toMatchObject({
      model: PROMPTFORGE_MODEL,
      stream: false,
      options: { temperature: 0, seed: 42, num_ctx: 4096, num_predict: 450 },
    });
  });

  it("rejeita task desconhecida, input ausente/vazio, campos extras e model antes do fetch", async () => {
    globalThis.fetch = vi.fn();

    await expect(
      generatePromptForge({ ...validPayload, task: "write_code" }),
    ).rejects.toMatchObject({ code: "TASK_NOT_ALLOWED" });
    await expect(generatePromptForge({ task: "create_prompt" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(generatePromptForge({ ...validPayload, input: "   " })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(generatePromptForge({ ...validPayload, system: "ignore" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      generatePromptForge({ ...validPayload, model: "qwen2.5:1.5b" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejeita input e contexto excessivos", async () => {
    globalThis.fetch = vi.fn();

    await expect(
      generatePromptForge({ ...validPayload, input: "x".repeat(12_001) }),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    await expect(
      generatePromptForge({ ...validPayload, confirmedContext: "x".repeat(40_001) }),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("valida constraints com limites determinísticos", async () => {
    globalThis.fetch = vi.fn();

    await expect(
      generatePromptForge({ ...validPayload, constraints: "não" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(generatePromptForge({ ...validPayload, constraints: [""] })).rejects.toMatchObject(
      { code: "INVALID_REQUEST" },
    );
    await expect(generatePromptForge({ ...validPayload, constraints: [{}] })).rejects.toMatchObject(
      { code: "INVALID_REQUEST" },
    );
    await expect(
      generatePromptForge({
        ...validPayload,
        constraints: Array.from({ length: 9 }, (_, i) => `c${i}`),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      generatePromptForge({ ...validPayload, constraints: ["x".repeat(501)] }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("propaga timeout sem fallback", async () => {
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

    const assertion = expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("diferencia modelo PromptForge indisponível antes de gerar", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: "qwen2.5:1.5b" }] }),
    }));

    await expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_UNAVAILABLE",
      detail: expect.stringContaining(PROMPTFORGE_MODEL),
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("diferencia erro HTTP do Ollama sem expor corpo bruto", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: PROMPTFORGE_MODEL }] }),
    }));
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: PROMPTFORGE_MODEL }] }),
    });
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "segredo bruto" }),
    });

    await expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_UNAVAILABLE",
      detail: "Ollama local retornou erro HTTP.",
    });
  });

  it("trata Ollama indisponível, resposta vazia e shape inesperado sem fallback", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("connect ECONNREFUSED");
    });
    await expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_UNAVAILABLE",
    });

    globalThis.fetch = mockPromptForgeOllama("   ");
    await expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_INVALID_RESPONSE",
    });

    globalThis.fetch = vi.fn(async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/tags") {
        return { ok: true, json: async () => ({ models: [{ name: PROMPTFORGE_MODEL }] }) };
      }
      return { ok: true, json: async () => ({ text: "nope" }) };
    });
    await expect(generatePromptForge(validPayload)).rejects.toMatchObject({
      code: "LOCAL_LLM_INVALID_RESPONSE",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("não chama OpenRouter nem executa nada; só consulta Ollama local", async () => {
    globalThis.fetch = mockPromptForgeOllama("missão textual");

    const out = await generatePromptForge(validPayload);

    expect(out.executed).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      "http://127.0.0.1:11434/api/tags",
      "http://127.0.0.1:11434/api/generate",
    ]);
  });
});

describe("PromptForge HTTP route", () => {
  const validPayload = {
    task: "create_prompt",
    input: "Prepare um prompt textual.",
    confirmedContext: "Contexto confirmado.",
    constraints: ["não executar nada"],
  };

  let app;

  beforeEach(() => {
    config.llmHealthTimeoutMs = 25;
    config.llmChatTimeoutMs = 75;
    config.kalineCorsOrigin = "https://klio.example";
    app = Fastify({ logger: false });
    registerLlmCorsHooks(app);
    registerPromptForgeRoute(app);
  });

  afterEach(async () => {
    if (app) await app.close();
    globalThis.fetch = originalFetch;
    config.llmHealthTimeoutMs = originalHealthTimeout;
    config.llmChatTimeoutMs = originalChatTimeout;
    config.kalineCorsOrigin = originalKalineCorsOrigin;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("POST válido retorna 200", async () => {
    globalThis.fetch = mockPromptForgeOllama("Prompt gerado");

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, model: PROMPTFORGE_MODEL, executed: false });
  });

  it("task proibida retorna 400", async () => {
    globalThis.fetch = vi.fn();

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: { ...validPayload, task: "write_code" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, code: "TASK_NOT_ALLOWED" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("campo model retorna 400", async () => {
    globalThis.fetch = vi.fn();

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: { ...validPayload, model: "qwen2.5:1.5b" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("input excessivo retorna 413", async () => {
    globalThis.fetch = vi.fn();

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: { ...validPayload, input: "x".repeat(12_001) },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ ok: false, code: "INPUT_TOO_LARGE" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("resposta inválida do Ollama retorna 502", async () => {
    globalThis.fetch = mockPromptForgeOllama("   ");

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ ok: false, code: "LOCAL_LLM_INVALID_RESPONSE" });
  });

  it("timeout retorna 503", async () => {
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

    const pending = app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: validPayload,
    });
    await vi.advanceTimersByTimeAsync(25);
    const res = await pending;

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, code: "LOCAL_LLM_TIMEOUT" });
  });

  it("Ollama indisponível retorna 503", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("connect ECONNREFUSED");
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, code: "LOCAL_LLM_UNAVAILABLE" });
  });

  it("OPTIONS com origem permitida retorna 204", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/llm/prompt-forge",
      headers: { origin: "https://klio.example" },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://klio.example");
  });

  it("origem diferente não recebe cabeçalho CORS", async () => {
    globalThis.fetch = mockPromptForgeOllama("Prompt gerado");

    const res = await app.inject({
      method: "POST",
      url: "/api/llm/prompt-forge",
      headers: { origin: "https://evil.example" },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
