import { generateOrganizerPlan, writePlan } from "./organizerPlan.js";
import { claimAndApplyOrganizerPlan, getOrganizerRun, getOrganizerRuns } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";
import { publicOrganizerPlan, publicOrganizerRun, publicOrganizerRuns } from "./organizerPublic.js";

const BODY_LIMIT = 16 * 1024;
const FORBIDDEN_FIELDS = new Set([
  "sourcePath",
  "targetPath",
  "from",
  "to",
  "path",
  "file",
  "files",
  "items",
  "operations",
  "storagePath",
  "source",
  "target",
]);

function sendError(reply, status, code, error) {
  return reply.code(status).send({
    ok: false,
    code,
    error,
    checkedAt: new Date().toISOString(),
  });
}

function exactObject(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function hasForbiddenField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenField);
  return Object.entries(value).some(
    ([key, nested]) => FORBIDDEN_FIELDS.has(key) || hasForbiddenField(nested),
  );
}

function requireConfirm(request, reply) {
  if (request.headers["x-hestia-local-confirm"] === "organize") return true;
  sendError(reply, 403, "EMISSINGCONFIRM", "Confirmação do Organizer ausente");
  return false;
}

function parseExtensions(request, reply) {
  const raw = request.query?.extensions;
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") {
    sendError(reply, 400, "EBADREQUEST", "Filtro de extensões inválido");
    return false;
  }
  const values = [...new Set(raw.split(",").map((value) => value.trim().toLowerCase()))];
  if (values.length > 100 || values.some((value) => !/^\.[a-z0-9]{1,10}$/.test(value))) {
    sendError(reply, 400, "EBADREQUEST", "Filtro de extensões inválido");
    return false;
  }
  return values;
}

function domainError(error, reply) {
  const mapping = {
    PLAN_ALREADY_APPLIED: [409, "Plano já aplicado"],
    PLAN_ALREADY_CLAIMED: [409, "Plano em execução"],
    EPLANNOTFOUND: [404, "Plano não encontrado"],
    EPLANEXPIRED: [410, "Plano expirado"],
    ELARGEPLANCONFIRM: [412, "Confirmação de plano grande ausente"],
    ERUNBUSY: [409, "Execução ocupada"],
    EALREADYUNDONE: [409, "Execução já desfeita"],
    EALREADYREDONE: [409, "Execução já refeita"],
    ENOTUNDORUN: [409, "Execução não pode ser refeita"],
    EORIGINALNOTFOUND: [404, "Execução original não encontrada"],
  };
  const match = mapping[error?.code];
  if (!match) throw error;
  return sendError(reply, match[0], error.code, match[1]);
}

export function registerStationOrganizerRoutes(app, options, providers = {}) {
  const engineOptions = {
    storagePath: options.storagePath,
    storageSources: options.storageSources || [],
  };
  const deps = {
    generatePlan: providers.generateOrganizerPlan || generateOrganizerPlan,
    writePlan: providers.writePlan || writePlan,
    claimAndApply: providers.claimAndApplyOrganizerPlan || claimAndApplyOrganizerPlan,
    getRuns: providers.getOrganizerRuns || getOrganizerRuns,
    getRun: providers.getOrganizerRun || getOrganizerRun,
    undo: providers.undoOrganizerRun || undoOrganizerRun,
    redo: providers.redoOrganizerRun || redoOrganizerRun,
  };

  app.post("/api/station/organizer/plan", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    if (!requireConfirm(request, reply)) return;
    if (!exactObject(request.body || {}, []) || hasForbiddenField(request.body)) {
      return sendError(reply, 400, "EBADREQUEST", "Body deve ser um objeto vazio");
    }
    const extensions = parseExtensions(request, reply);
    if (extensions === false) return;
    const plan = await deps.generatePlan(undefined, extensions, engineOptions);
    await deps.writePlan(plan, options.dataDir);
    return publicOrganizerPlan(plan, engineOptions);
  });

  app.post("/api/station/organizer/apply", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    if (!requireConfirm(request, reply)) return;
    const body = request.body || {};
    if (
      hasForbiddenField(body) ||
      !exactObject(body, ["planId", "mode"]) ||
      typeof body.planId !== "string" ||
      body.mode !== "apply"
    ) {
      return sendError(reply, 400, "EBADREQUEST", "Body de apply inválido");
    }
    try {
      const run = await deps.claimAndApply(body.planId, options.dataDir, {
        ...engineOptions,
        largePlanConfirmed: request.headers["x-hestia-large-plan-confirm"],
      });
      return publicOrganizerRun(run, engineOptions);
    } catch (error) {
      return domainError(error, reply);
    }
  });

  app.get("/api/station/organizer/runs", async () =>
    publicOrganizerRuns(await deps.getRuns(options.dataDir)),
  );

  app.get("/api/station/organizer/runs/:runId", async (request, reply) => {
    const run = await deps.getRun(request.params.runId, options.dataDir);
    if (!run) return sendError(reply, 404, "ERUNNOTFOUND", "Execução não encontrada");
    return publicOrganizerRun(run, engineOptions);
  });

  app.post(
    "/api/station/organizer/runs/:runId/undo",
    { bodyLimit: BODY_LIMIT },
    async (request, reply) => {
      if (!requireConfirm(request, reply)) return;
      if (!exactObject(request.body || {}, []) || hasForbiddenField(request.body)) {
        return sendError(reply, 400, "EBADREQUEST", "Body deve ser um objeto vazio");
      }
      try {
        const run = await deps.undo(request.params.runId, options.dataDir, engineOptions);
        if (!run) return sendError(reply, 404, "ERUNNOTFOUND", "Execução não encontrada");
        return publicOrganizerRun(run, engineOptions);
      } catch (error) {
        return domainError(error, reply);
      }
    },
  );

  app.post(
    "/api/station/organizer/runs/:undoRunId/redo",
    { bodyLimit: BODY_LIMIT },
    async (request, reply) => {
      if (!requireConfirm(request, reply)) return;
      if (!exactObject(request.body || {}, []) || hasForbiddenField(request.body)) {
        return sendError(reply, 400, "EBADREQUEST", "Body deve ser um objeto vazio");
      }
      try {
        const run = await deps.redo(request.params.undoRunId, options.dataDir, engineOptions);
        if (!run) return sendError(reply, 404, "ERUNNOTFOUND", "Execução não encontrada");
        return publicOrganizerRun(run, engineOptions);
      } catch (error) {
        return domainError(error, reply);
      }
    },
  );
}
