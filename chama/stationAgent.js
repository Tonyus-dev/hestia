import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";

import { ALLOWED_SERVICES } from "./config.js";
import { buildAllowedHosts, isAllowedHostHeader, isLoopbackHost } from "./security.js";
import { getServicesStatus } from "./services.js";
import { getStorageStatus } from "./storage.js";
import { ensureDataDir, resolveDataDir } from "./dataDir.js";
import { config as sharedConfig } from "./config.js";
import { registerStationOrganizerRoutes } from "./stationOrganizerRoutes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function configError(message) {
  throw new Error(`[Station Agent] ${message}`);
}

export function resolveStationAgentConfig(env = process.env) {
  const host = env.HESTIA_STATION_HOST?.trim() || "127.0.0.1";
  const portRaw = env.HESTIA_STATION_PORT?.trim() || "4518";
  const port = Number(portRaw);
  const token = env.HESTIA_STATION_TOKEN;
  const allowedHosts = env.HESTIA_STATION_ALLOWED_HOSTS?.trim() || "";
  const rawStoragePath =
    env.HESTIA_STORAGE_PATH?.trim() || env.HESTIA_KALINE_ROOT?.trim() || "/KALINE";
  if (!isAbsolute(rawStoragePath)) {
    configError("HESTIA_STORAGE_PATH deve ser absoluto.");
  }
  const storagePath = resolve(rawStoragePath);
  const dataDir = resolveDataDir(env);
  const requestedServices = new Set(
    (env.HESTIA_STATION_SERVICES || ALLOWED_SERVICES.join(","))
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const services = ALLOWED_SERVICES.filter((name) => requestedServices.has(name));

  if (!token?.trim()) configError("HESTIA_STATION_TOKEN é obrigatório.");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    configError("HESTIA_STATION_PORT deve ser uma porta válida.");
  }
  if (allowedHosts.split(",").some((entry) => entry.includes("*"))) {
    configError("HESTIA_STATION_ALLOWED_HOSTS não aceita wildcard.");
  }
  if (!isLoopbackHost(host) && !allowedHosts) {
    configError("bind não-loopback exige HESTIA_STATION_ALLOWED_HOSTS.");
  }
  return {
    host,
    port,
    token,
    allowedHosts,
    storagePath,
    dataDir,
    storageSources: sharedConfig.storageSources,
    services,
  };
}

function tokenMatches(actual, expected) {
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

function publicStorage(result) {
  const item = result?.items?.[0];
  const status = ["ok", "missing", "unavailable"].includes(item?.status)
    ? item.status
    : "unavailable";
  const numeric = status === "ok";
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: result?.checkedAt || new Date().toISOString(),
    storage: {
      id: "kaline",
      exists: status === "missing" ? false : Boolean(item?.exists),
      status,
      totalBytes: numeric && Number.isFinite(item?.total) ? item.total : null,
      usedBytes: numeric && Number.isFinite(item?.used) ? item.used : null,
      freeBytes: numeric && Number.isFinite(item?.free) ? item.free : null,
      percentUsed: numeric && Number.isFinite(item?.percentUsed) ? item.percentUsed : null,
    },
  };
}

function publicServices(result) {
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    services: (result?.items || []).map((item) => ({
      id: item.name,
      active: item.active === true,
      status: item.status,
    })),
  };
}

export function createStationAgent(config, providers = {}) {
  if (!config?.token?.trim()) configError("HESTIA_STATION_TOKEN é obrigatório.");
  if (config.dataDir) ensureDataDir(config.dataDir);
  const app = Fastify({ logger: false });
  const readStorage = providers.getStorageStatus || getStorageStatus;
  const readServices = providers.getServicesStatus || getServicesStatus;

  app.addHook("onRequest", async (request, reply) => {
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    const allowed = buildAllowedHosts(config.host, port, config.allowedHosts);
    if (!isAllowedHostHeader(request.headers.host, allowed)) {
      return reply.code(421).send({ ok: false, error: "host_not_allowed" });
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers.authorization;
    const match = typeof header === "string" ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match) return reply.code(401).send({ ok: false, error: "authentication_required" });
    if (!tokenMatches(match[1], config.token)) {
      return reply.code(403).send({ ok: false, error: "authentication_failed" });
    }
  });

  app.get("/api/station/health", async () => ({
    ok: true,
    schemaVersion: 1,
    service: "hestia-station-agent",
    version: pkg.version,
    checkedAt: new Date().toISOString(),
  }));

  app.get("/api/station/storage/status", async () =>
    publicStorage(await readStorage([config.storagePath || "/KALINE"])),
  );

  app.get("/api/station/services/status", async () =>
    publicServices(await readServices(config.services || ALLOWED_SERVICES)),
  );

  registerStationOrganizerRoutes(
    app,
    {
      dataDir: config.dataDir || resolveDataDir(),
      storagePath: config.storagePath || "/KALINE",
      storageSources: config.storageSources || [],
    },
    providers,
  );

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ ok: false, error: "not_found" });
  });
  app.setErrorHandler((_error, _request, reply) => {
    reply.code(500).send({ ok: false, error: "internal_error" });
  });
  return app;
}

export async function startStationAgent(config, providers) {
  const app = createStationAgent(config, providers);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
