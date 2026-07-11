import { config } from "./config.js";

export const ALLOWED_MODELS = [
  "qwen2.5:1.5b",
  "qwen2.5:latest",
  "qwen2.5-coder",
  "qwen2.5-coder:latest",
];
export const DEFAULT_MODEL = "qwen2.5:latest";

const OLLAMA_UNAVAILABLE_DETAIL = "Ollama não respondeu em 127.0.0.1:11434";
const OLLAMA_TIMEOUT_DETAIL = "Tempo esgotado ao consultar o Ollama local";

function checkedAt() {
  return new Date().toISOString();
}

function timeoutMs() {
  return Number.isFinite(config.llmTimeoutMs) && config.llmTimeoutMs > 0
    ? config.llmTimeoutMs
    : 15_000;
}

async function fetchOllama(path, init = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs());
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

export function validateChatInput({ message, facet = "kaline" }) {
  if (typeof message !== "string" || !message.trim()) {
    const err = new Error("message deve ser string não vazia.");
    err.code = "ELLMBADREQUEST";
    throw err;
  }
  if (!isAllowedFacet(normalizeFacet(facet))) {
    const err = new Error("facet inválida.");
    err.code = "ELLMBADREQUEST";
    throw err;
  }
}

export async function getLlmHealth() {
  try {
    const res = await fetchOllama("/api/tags");
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
      timeoutMs: timeoutMs(),
      checkedAt: checkedAt(),
    };
  } catch (err) {
    return {
      ok: false,
      runtime: "ollama",
      models: [],
      allowedModels: ALLOWED_MODELS,
      defaultModel: DEFAULT_MODEL,
      timeoutMs: timeoutMs(),
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
  validateChatInput({ message, facet: normalizedFacet });
  const chosenModel = normalizeModel(model);
  if (!isAllowedModel(chosenModel)) {
    const err = new Error("Modelo local não permitido.");
    err.code = "EMODELNOTALLOWED";
    throw err;
  }

  try {
    const res = await fetchOllama("/api/generate", {
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
    });
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
    unavailable.detail =
      err?.code === "ELLM_TIMEOUT" ? OLLAMA_TIMEOUT_DETAIL : OLLAMA_UNAVAILABLE_DETAIL;
    throw unavailable;
  }
}
