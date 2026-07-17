import {
  STATION_IDS,
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  fetchTvboxCodiceHealth,
  fetchDesktopOrganizerPlan,
  fetchDesktopOrganizerRuns,
  getStationConnectionStatus,
  resolveNamedStationConfig,
  stationHealthHttpStatus,
} from "./stationClient.js";

function unavailable(reply, result, resource) {
  reply.code(stationHealthHttpStatus(result.code));
  const organizerDisabled = resource.includes("Organizer") && result.remoteStatus === 404;
  return {
    ok: false,
    code: organizerDisabled ? "ORGANIZER_DISABLED" : result.code,
    state: organizerDisabled ? "disabled" : result.state,
    error: organizerDisabled ? "Organizer desativado no servidor" : `${resource} indisponível`,
    checkedAt: result.checkedAt,
  };
}

function registerNamedStationRoutes(app, stationId, env) {
  const config = () => resolveNamedStationConfig(stationId, env);
  const prefix = `/api/stations/${stationId}`;

  app.get(`${prefix}/connection`, async () => getStationConnectionStatus(config()));
  app.get(`${prefix}/health`, async (_request, reply) => {
    const result = await fetchStationHealth(config());
    return result.ok ? result.station : unavailable(reply, result, `${stationId} health`);
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
    if (
      !request.body ||
      typeof request.body !== "object" ||
      Array.isArray(request.body) ||
      Object.keys(request.body).length !== 0
    ) {
      return reply
        .code(400)
        .send({ ok: false, code: "ORGANIZER_BODY_INVALID", error: "Body deve ser vazio" });
    }
    const result = await fetchDesktopOrganizerPlan(resolveNamedStationConfig("desktop", env));
    return result.ok === false ? unavailable(reply, result, "desktop Organizer") : result;
  });

  app.get("/api/stations/desktop/organizer/runs", async (_request, reply) => {
    const result = await fetchDesktopOrganizerRuns(resolveNamedStationConfig("desktop", env));
    return result.ok === false ? unavailable(reply, result, "desktop Organizer") : result;
  });
}
