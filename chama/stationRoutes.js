import {
  STATION_IDS,
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  fetchStationSystemStatus,
  fetchTvboxCodiceHealth,
  fetchDesktopOrganizerPlan,
  fetchDesktopOrganizerApply,
  fetchDesktopOrganizerRuns,
  getStationConnectionStatus,
  resolveNamedStationConfig,
  stationHealthHttpStatus,
} from "./stationClient.js";

function unavailable(reply, result, resource) {
  const organizerDisabled =
    resource.includes("Organizer") && result.remoteStatus === 404 && !result.remoteCode;
  reply.code(
    organizerDisabled
      ? stationHealthHttpStatus(result.code)
      : result.remoteStatus || stationHealthHttpStatus(result.code),
  );
  return {
    ok: false,
    code: organizerDisabled ? "ORGANIZER_DISABLED" : result.remoteCode || result.code,
    state: organizerDisabled ? "disabled" : result.state,
    error: organizerDisabled ? "Organizer desativado no servidor" : `${resource} indisponível`,
    checkedAt: result.checkedAt,
  };
}

const EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/;
const FORBIDDEN_ORGANIZER_BODY_KEYS = new Set([
  "mode",
  "item",
  "items",
  "path",
  "paths",
  "source",
  "target",
  "action",
  "operations",
]);

function hasForbiddenOrganizerBodyKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenOrganizerBodyKey);
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_ORGANIZER_BODY_KEYS.has(key) || hasForbiddenOrganizerBodyKey(nested),
  );
}

function normalizeExtensionsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.extensions)) return null;
  if (body.extensions.length > 100) return null;
  const result = [];
  for (const raw of body.extensions) {
    if (typeof raw !== "string") return null;
    const value = raw.toLowerCase();
    if (!EXTENSION_PATTERN.test(value)) return null;
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function applyBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    hasForbiddenOrganizerBodyKey(body)
  )
    return null;
  const keys = Object.keys(body);
  if (
    keys.length !== 3 ||
    !keys.includes("planId") ||
    !keys.includes("confirmation") ||
    !keys.includes("largePlanConfirmation")
  )
    return null;
  if (typeof body.planId !== "string" || !/^plan_\d+_[0-9a-f]{8}$/.test(body.planId)) return null;
  if (body.confirmation !== "EFETIVAR") return null;
  if (!(body.largePlanConfirmation === null || body.largePlanConfirmation === body.planId))
    return null;
  return { planId: body.planId, largePlanConfirmation: body.largePlanConfirmation };
}

function registerNamedStationRoutes(app, stationId, env) {
  const config = () => resolveNamedStationConfig(stationId, env);
  const prefix = `/api/stations/${stationId}`;

  app.get(`${prefix}/connection`, async () => getStationConnectionStatus(config()));
  app.get(`${prefix}/health`, async (_request, reply) => {
    const result = await fetchStationHealth(config());
    return result.ok ? result.station : unavailable(reply, result, `${stationId} health`);
  });
  app.get(`${prefix}/system/status`, async (_request, reply) => {
    const result = await fetchStationSystemStatus(config());
    return result.ok ? result.system : unavailable(reply, result, `${stationId} system`);
  });
  app.get(`${prefix}/storage/status`, async (_request, reply) => {
    const result = await fetchStationStorageStatus(config());
    return result.ok ? result.storage : unavailable(reply, result, `${stationId} storage`);
  });
  app.get(`${prefix}/services/status`, async (_request, reply) => {
    const result = await fetchStationServicesStatus(config());
    return result.ok ? result.services : unavailable(reply, result, `${stationId} services`);
  });
}

export function registerStationRoutes(app, env = process.env) {
  for (const stationId of STATION_IDS) registerNamedStationRoutes(app, stationId, env);

  app.get("/api/stations/tvbox/codice/health", async (_request, reply) => {
    const result = await fetchTvboxCodiceHealth(resolveNamedStationConfig("tvbox", env));
    return result.ok ? result : unavailable(reply, result, "tvbox Códice");
  });

  app.post("/api/stations/desktop/organizer/plan", async (request, reply) => {
    const extensions = normalizeExtensionsBody(request.body);
    if (extensions === null) {
      return reply.code(400).send({
        ok: false,
        code: "ORGANIZER_BODY_INVALID",
        error: "Body deve conter somente extensions",
      });
    }
    const result = await fetchDesktopOrganizerPlan(
      resolveNamedStationConfig("desktop", env),
      extensions,
    );
    return result.ok === false ? unavailable(reply, result, "desktop Organizer") : result;
  });

  app.post("/api/stations/desktop/organizer/apply", async (request, reply) => {
    const body = applyBody(request.body);
    if (!body) {
      return reply
        .code(400)
        .send({ ok: false, code: "ORGANIZER_APPLY_BODY_INVALID", error: "Body de apply inválido" });
    }
    const result = await fetchDesktopOrganizerApply(
      resolveNamedStationConfig("desktop", env),
      body,
    );
    return result.ok === false ? unavailable(reply, result, "desktop Organizer apply") : result;
  });

  app.get("/api/stations/desktop/organizer/runs", async (_request, reply) => {
    const result = await fetchDesktopOrganizerRuns(resolveNamedStationConfig("desktop", env));
    return result.ok === false ? unavailable(reply, result, "desktop Organizer") : result;
  });
}
