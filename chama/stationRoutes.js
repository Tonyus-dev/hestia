import {
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  getStationConnectionStatus,
  stationHealthHttpStatus,
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
}
