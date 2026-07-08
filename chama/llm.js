import { config } from "./config.js";

export const ALLOWED_MODELS = [
  "qwen2.5:1.5b",
  "qwen2.5:latest",
  "qwen2.5-coder",
  "qwen2.5-coder:latest",
];
export const DEFAULT_MODEL = "qwen2.5:latest";

const OLLAMA_UNAVAILABLE_DETAIL = "Ollama não respondeu em 127.0.0.1:11434";

function checkedAt() {
  return new Date().toISOString();
}

export function isAllowedModel(model) {
  return ALLOWED_MODELS.includes(model);
}

export function normalizeModel(model) {
  if (model === undefined || model === null || model === "") return DEFAULT_MODEL;
  return typeof model === "string" ? model : "";
}

export async function getLlmHealth() {
  try {
    const res = await fetch(new URL("/api/tags", config.ollamaUrl));
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
      checkedAt: checkedAt(),
    };
  } catch {
    return {
      ok: false,
      runtime: "ollama",
      models: [],
      allowedModels: ALLOWED_MODELS,
      defaultModel: DEFAULT_MODEL,
      error: "Ollama indisponível",
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
  const chosenModel = normalizeModel(model);
  if (!isAllowedModel(chosenModel)) {
    const err = new Error("Modelo local não permitido.");
    err.code = "EMODELNOTALLOWED";
    throw err;
  }

  try {
    const res = await fetch(new URL("/api/generate", config.ollamaUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        prompt: buildPrompt({ message, facet, presencaRegime, contextBlock, structuredPrompt }),
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
  } catch {
    const err = new Error("Runtime local indisponível.");
    err.code = "ELLMUNAVAILABLE";
    err.detail = OLLAMA_UNAVAILABLE_DETAIL;
    throw err;
  }
}
