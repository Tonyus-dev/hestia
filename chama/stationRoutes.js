import {
  STATION_IDS,
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
  fetchTvboxCodiceHealth,
  fetchTvboxCodiceLibrary,
  fetchTvboxCodiceBook,
  fetchDesktopOrganizerPlan,
  fetchDesktopOrganizerRuns,
  isValidCodiceBookId,
  getStationConnectionStatus,
  resolveNamedStationConfig,
  stationHealthHttpStatus,
} from "./stationClient.js";
import { Readable } from "node:stream";

const FORWARDED_BOOK_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "cache-control",
  "etag",
];

function safeBookHeader(name, value) {
  if (!value || value.length > 1024 || /[\0-\x08\x0A-\x1F\x7F]/.test(value)) return null;
  if (name === "content-length" && !/^\d+$/.test(value)) return null;
  if (name === "etag" && !/^(?:W\/)?"[\x21\x23-\x7E]*"$/.test(value)) return null;
  return value;
}

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

  app.get("/api/stations/tvbox/codice/library", async (_request, reply) => {
    const result = await fetchTvboxCodiceLibrary(resolveNamedStationConfig("tvbox", env));
    return result.ok === false ? unavailable(reply, result, "tvbox Códice") : result;
  });

  async function proxyCodiceBook(request, reply) {
    const { bookId } = request.params;
    if (!isValidCodiceBookId(bookId)) {
      return reply
        .code(400)
        .send({ ok: false, code: "CODICE_BOOK_ID_INVALID", error: "bookId inválido" });
    }
    const result = await fetchTvboxCodiceBook(
      bookId,
      request.method,
      resolveNamedStationConfig("tvbox", env),
    );
    if (!result.ok) return unavailable(reply, result, "tvbox Códice livro");
    const response = result.response;
    reply.code(response.status);
    for (const name of FORWARDED_BOOK_HEADERS) {
      const value = safeBookHeader(name, response.headers.get(name));
      if (value) reply.header(name, value);
    }
    reply.header("Cache-Control", "no-store");
    if (request.method === "HEAD" || !response.body) {
      result.cleanup();
      return reply.send();
    }
    const stream = Readable.fromWeb(response.body);
    let finished = false;
    stream.once("end", () => {
      finished = true;
      result.cleanup();
    });
    stream.once("error", () => result.abort());
    reply.raw.once("close", () => {
      if (!finished) result.abort();
    });
    return reply.send(stream);
  }

  app.head("/api/stations/tvbox/codice/books/:bookId", proxyCodiceBook);
  app.get("/api/stations/tvbox/codice/books/:bookId", proxyCodiceBook);

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
