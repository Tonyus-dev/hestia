import { config } from "./config.js";
import { generatePromptForge } from "./llm.js";

export function applyKalineLlmCors(req, reply) {
  const origin = req.headers.origin;
  if (!config.kalineCorsOrigin || origin !== config.kalineCorsOrigin) return;
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
}

export function registerLlmCorsHooks(app) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/llm/")) return;
    applyKalineLlmCors(req, reply);
    if (req.method === "OPTIONS") return reply.code(204).send();
  });
}

export function registerPromptForgeRoute(app) {
  app.post("/api/llm/prompt-forge", async (req, reply) => {
    try {
      return await generatePromptForge(req.body || {});
    } catch (err) {
      if (["INVALID_REQUEST", "TASK_NOT_ALLOWED"].includes(err.code)) {
        reply.code(400).send({ ok: false, code: err.code, error: err.message });
        return;
      }
      if (err.code === "INPUT_TOO_LARGE") {
        reply.code(413).send({ ok: false, code: err.code, error: err.message });
        return;
      }
      if (err.code === "LOCAL_LLM_INVALID_RESPONSE") {
        reply.code(502).send({ ok: false, code: err.code, error: err.message });
        return;
      }
      if (["LOCAL_LLM_UNAVAILABLE", "LOCAL_LLM_TIMEOUT"].includes(err.code)) {
        reply.code(503).send({
          ok: false,
          code: err.code,
          error: "Runtime local indisponível.",
          runtime: "hestia-llm",
          detail: err.detail,
        });
        return;
      }
      throw err;
    }
  });
}
