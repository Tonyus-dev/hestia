import { generateOrganizerPlan, writePlan, getPlan } from "./organizerPlan.js";
import { applyOrganizerPlan, getOrganizerRuns, getOrganizerRun } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";

function requireOrganizerConfirm(req, reply) {
  if (req.headers["x-hestia-local-confirm"] === "organize") return true;
  reply.code(403).send({
    ok: false,
    error: "Confirmação ausente",
    code: "EMISSINGCONFIRM",
    detail: 'Rotas de escrita do Organizer exigem o header "X-Hestia-Local-Confirm: organize".',
    at: new Date().toISOString(),
  });
  return false;
}

function allowedExtensionsFromQuery(req) {
  const extParam = req.query?.extensions;
  return extParam ? extParam.split(",").map((e) => e.trim().toLowerCase()) : null;
}

export function registerOrganizerRoutes(app, config) {
  app.post("/api/local/organizer/plan", async (req, reply) => {
    if (!requireOrganizerConfirm(req, reply)) return;
    const plan = await generateOrganizerPlan(undefined, allowedExtensionsFromQuery(req));
    await writePlan(plan, config.dataDir);
    return plan;
  });

  app.post("/api/local/organizer/apply", async (req, reply) => {
    if (!requireOrganizerConfirm(req, reply)) return;
    const body = req.body || {};
    if (typeof body.planId !== "string" || !body.planId) {
      reply.code(400).send({
        ok: false,
        error: "planId obrigatório",
        code: "EBADREQUEST",
        detail: 'Body deve conter { planId, mode: "apply" }, com planId de um plano já gerado.',
        at: new Date().toISOString(),
      });
      return;
    }
    if (body.mode !== "apply") {
      reply.code(400).send({
        ok: false,
        error: 'mode deve ser "apply"',
        code: "EBADREQUEST",
        at: new Date().toISOString(),
      });
      return;
    }
    const plan = await getPlan(body.planId, config.dataDir);
    if (!plan) {
      reply.code(404).send({
        ok: false,
        error: "Plano não encontrado",
        code: "EPLANNOTFOUND",
        detail: "planId inválido, expirado ou nunca gerado.",
        at: new Date().toISOString(),
      });
      return;
    }
    return applyOrganizerPlan(plan, config.dataDir);
  });

  app.get("/api/local/organizer/runs", async () => ({
    items: await getOrganizerRuns(config.dataDir),
  }));

  app.get("/api/local/organizer/runs/:runId", async (req, reply) => {
    const run = await getOrganizerRun(req.params.runId, config.dataDir);
    if (!run) {
      reply.code(404).send({
        ok: false,
        error: "Execução não encontrada",
        code: "ERUNNOTFOUND",
        at: new Date().toISOString(),
      });
      return;
    }
    return run;
  });

  app.post("/api/local/organizer/runs/:runId/undo", async (req, reply) => {
    if (!requireOrganizerConfirm(req, reply)) return;
    return undoOrganizerRun(req.params.runId, config.dataDir);
  });

  app.post("/api/local/organizer/runs/:undoRunId/redo", async (req, reply) => {
    if (!requireOrganizerConfirm(req, reply)) return;
    return redoOrganizerRun(req.params.undoRunId, config.dataDir);
  });
}
