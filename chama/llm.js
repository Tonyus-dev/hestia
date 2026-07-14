import { config } from "./config.js";

export const ALLOWED_MODELS = ["qwen2.5:0.5b", "qwen3.5-0.8b", "qwen3.5-0.8b:latest"];
export const DEFAULT_MODEL = "qwen3.5-0.8b";

const OLLAMA_UNAVAILABLE_DETAIL = "Ollama não respondeu em 127.0.0.1:11434";
const OLLAMA_TIMEOUT_DETAIL = "Tempo esgotado ao consultar o Ollama local";
const MAX_MESSAGE_CHARS = 12_000;
const MAX_PROMPT_BLOCK_CHARS = 40_000;

function checkedAt() {
  return new Date().toISOString();
}

function resolveTimeoutMs(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function healthTimeoutMs() {
  return resolveTimeoutMs(config.llmHealthTimeoutMs, 5_000);
}

function chatTimeoutMs() {
  return resolveTimeoutMs(config.llmChatTimeoutMs, 90_000);
}

async function fetchOllama(path, init = {}, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(new URL(path, config.ollamaUrl), { ...init, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error(OLLAMA_TIMEOUT_DETAIL);
      timeoutErr.code = "ELLM_TIMEOUT";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export function isAllowedModel(model) {
  return ALLOWED_MODELS.includes(model);
}

export function normalizeModel(model) {
  if (model === undefined || model === null || model === "") return DEFAULT_MODEL;
  return typeof model === "string" ? model : "";
}

export function normalizeFacet(facet) {
  if (facet === undefined || facet === null || facet === "") return "kaline";
  return typeof facet === "string" ? facet : "";
}

export function isAllowedFacet(facet) {
  return ["kaline", "klio", "kharis"].includes(facet);
}

function badChatInput(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function validateOptionalPromptBlock(value, name, code) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || value.length > MAX_PROMPT_BLOCK_CHARS) {
    badChatInput(
      `${name} deve ser string com no máximo ${MAX_PROMPT_BLOCK_CHARS} caracteres.`,
      code,
    );
  }
}

export function validateChatInput({ message, facet = "kaline", contextBlock, structuredPrompt }) {
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
    badChatInput("message deve ser string não vazia.", "INVALID_MESSAGE");
  }
  if (!isAllowedFacet(normalizeFacet(facet))) {
    badChatInput("facet inválida.", "INVALID_FACET");
  }
  validateOptionalPromptBlock(contextBlock, "contextBlock", "INVALID_CONTEXT_BLOCK");
  validateOptionalPromptBlock(structuredPrompt, "structuredPrompt", "INVALID_STRUCTURED_PROMPT");
}

export async function getLlmHealth() {
  try {
    const res = await fetchOllama("/api/tags", {}, healthTimeoutMs());
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m?.name).filter((name) => typeof name === "string")
      : [];
    return {
      ok: true,
      runtime: "ollama",
      models,
      allowedModels: ALLOWED_MODELS,
      defaultModel: DEFAULT_MODEL,
      timeoutMs: healthTimeoutMs(),
      checkedAt: checkedAt(),
    };
  } catch (err) {
    return {
      ok: false,
      runtime: "ollama",
      models: [],
      allowedModels: ALLOWED_MODELS,
      defaultModel: DEFAULT_MODEL,
      timeoutMs: healthTimeoutMs(),
      error: "Ollama indisponível",
      detail: err?.code === "ELLM_TIMEOUT" ? OLLAMA_TIMEOUT_DETAIL : OLLAMA_UNAVAILABLE_DETAIL,
      checkedAt: checkedAt(),
    };
  }
}

export function buildPrompt({
  message,
  facet = "kaline",
  presencaRegime = "",
  contextBlock = "",
  structuredPrompt = "",
}) {
  return [
    `Faceta: ${facet}`,
    `Regime de presença: ${typeof presencaRegime === "string" ? presencaRegime : ""}`,
    `Contexto:\n${typeof contextBlock === "string" ? contextBlock : ""}`,
    `Prompt estruturado:\n${typeof structuredPrompt === "string" ? structuredPrompt : ""}`,
    `Mensagem original:\n${message}`,
  ].join("\n\n");
}

export async function generateLocalChat({
  message,
  facet,
  presencaRegime,
  contextBlock,
  structuredPrompt,
  model,
}) {
  const normalizedFacet = normalizeFacet(facet);
  validateChatInput({ message, facet: normalizedFacet, contextBlock, structuredPrompt });
  const chosenModel = normalizeModel(model);
  if (!isAllowedModel(chosenModel)) {
    const err = new Error("Modelo local não permitido.");
    err.code = "EMODELNOTALLOWED";
    throw err;
  }

  try {
    const res = await fetchOllama(
      "/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: chosenModel,
          prompt: buildPrompt({
            message,
            facet: normalizedFacet,
            presencaRegime,
            contextBlock,
            structuredPrompt,
          }),
          stream: false,
        }),
      },
      chatTimeoutMs(),
    );
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return {
      ok: true,
      text: typeof data.response === "string" ? data.response : "",
      model: chosenModel,
      runtime: "hestia-llm",
      checkedAt: checkedAt(),
    };
  } catch (err) {
    const unavailable = new Error("Runtime local indisponível.");
    unavailable.code = "ELLMUNAVAILABLE";
    unavailable.reasonCode = err?.code === "ELLM_TIMEOUT" ? "LLM_TIMEOUT" : "OLLAMA_UNAVAILABLE";
    unavailable.detail =
      err?.code === "ELLM_TIMEOUT" ? OLLAMA_TIMEOUT_DETAIL : OLLAMA_UNAVAILABLE_DETAIL;
    throw unavailable;
  }
}
