import {
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  getStationConnectionStatus,
  stationHealthHttpStatus,
  fetchStationOrganizerPlan,
  fetchStationOrganizerApply,
  fetchStationOrganizerRuns,
  fetchStationOrganizerRun,
  fetchStationOrganizerUndo,
  fetchStationOrganizerRedo,
} from "./stationClient.js";

function unavailable(reply, result, resource) {
  reply.code(stationHealthHttpStatus(result.code));
  return {
    ok: false,
    code: result.code,
    state: result.state,
    error: `Station ${resource} indisponível`,
    checkedAt: result.checkedAt,
  };
}

function organizerResponse(reply, result) {
  if (result.ok) return result.resource;
  if (result.state === "domain_error") return reply.code(result.status).send(result.error);
  return unavailable(reply, result, "organizer");
}

function requireOrganizerConfirm(request, reply) {
  if (request.headers["x-hestia-local-confirm"] === "organize") return true;
  reply.code(403).send({
    ok: false,
    code: "EMISSINGCONFIRM",
    error: "Confirmação do Organizer ausente",
    checkedAt: new Date().toISOString(),
  });
  return false;
}

function organizerBadRequest(reply) {
  return reply.code(400).send({
    ok: false,
    code: "EBADREQUEST",
    error: "Body inválido",
    checkedAt: new Date().toISOString(),
  });
}

function exactObject(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

export function registerStationRoutes(app, env = process.env) {
  app.get("/api/station/connection", async () => getStationConnectionStatus(env));
  app.get("/api/station/health", async (_request, reply) => {
    const result = await fetchStationHealth(env);
    return result.ok ? result.station : unavailable(reply, result, "health");
  });
  app.get("/api/station/storage/status", async (_request, reply) => {
    const result = await fetchStationStorageStatus(env);
    return result.ok ? result.storage : unavailable(reply, result, "storage");
  });
  app.get("/api/station/services/status", async (_request, reply) => {
    const result = await fetchStationServicesStatus(env);
    return result.ok ? result.services : unavailable(reply, result, "services");
  });
  app.post("/api/station/organizer/plan", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    if (!requireOrganizerConfirm(request, reply)) return;
    const body = request.body || {};
    if (!exactObject(body, [])) return organizerBadRequest(reply);
    return organizerResponse(
      reply,
      await fetchStationOrganizerPlan(request.query?.extensions, env),
    );
  });
  app.post("/api/station/organizer/apply", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    if (!requireOrganizerConfirm(request, reply)) return;
    const body = request.body || {};
    if (
      !exactObject(body, ["planId", "mode"]) ||
      typeof body.planId !== "string" ||
      body.mode !== "apply"
    ) {
      return organizerBadRequest(reply);
    }
    return organizerResponse(
      reply,
      await fetchStationOrganizerApply(
        body.planId,
        request.headers["x-hestia-large-plan-confirm"],
        env,
      ),
    );
  });
  app.get("/api/station/organizer/runs", async (_request, reply) =>
    organizerResponse(reply, await fetchStationOrganizerRuns(env)),
  );
  app.get("/api/station/organizer/runs/:runId", async (request, reply) =>
    organizerResponse(reply, await fetchStationOrganizerRun(request.params.runId, env)),
  );
  app.post(
    "/api/station/organizer/runs/:runId/undo",
    { bodyLimit: 16 * 1024 },
    async (request, reply) => {
      if (!requireOrganizerConfirm(request, reply)) return;
      if (!exactObject(request.body || {}, [])) return organizerBadRequest(reply);
      return organizerResponse(reply, await fetchStationOrganizerUndo(request.params.runId, env));
    },
  );
  app.post(
    "/api/station/organizer/runs/:undoRunId/redo",
    { bodyLimit: 16 * 1024 },
    async (request, reply) => {
      if (!requireOrganizerConfirm(request, reply)) return;
      if (!exactObject(request.body || {}, [])) return organizerBadRequest(reply);
      return organizerResponse(
        reply,
        await fetchStationOrganizerRedo(request.params.undoRunId, env),
      );
    },
  );
}
