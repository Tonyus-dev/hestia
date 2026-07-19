import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";

import { ALLOWED_SERVICES } from "./config.js";
import {
  applyCodiceCors,
  buildAllowedHosts,
  isAllowedHostHeader,
  isLoopbackHost,
} from "./security.js";
import { getServicesStatus } from "./services.js";
import { getStationSystemStatus } from "./systemStatus.js";
import { getStorageStatus } from "./storage.js";
import { ensureDataDir, resolveDataDir } from "./dataDir.js";
import { config as sharedConfig } from "./config.js";
import { registerStationOrganizerRoutes } from "./stationOrganizerRoutes.js";
import { createCodiceHealthHandler, registerCodiceReadOnlyRoutes } from "./codiceReadOnlyRoutes.js";
import { authenticateCodiceRequest, isValidCodiceUserId } from "./codiceAuth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function configError(message) {
  throw new Error(`[Station Agent] ${message}`);
}

function parseOrganizerEnabled(value) {
  if (value === undefined) return false;
  if (value === "0") return false;
  if (value === "1") return true;
  configError("HESTIA_STATION_ORGANIZER_ENABLED deve ser 0 ou 1.");
}

function parseCodiceEnabled(value) {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  configError("HESTIA_STATION_CODICE_ENABLED deve ser 0 ou 1.");
}

function resolveCodiceCorsOrigin(value, nodeEnv) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    configError("HESTIA_CODICE_CORS_ORIGIN é obrigatória quando o Códice está habilitado.");
  }
  if (value === "*" || value.includes(",")) {
    configError("HESTIA_CODICE_CORS_ORIGIN deve conter uma única origem exata, sem wildcard.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    configError("HESTIA_CODICE_CORS_ORIGIN deve ser uma origem HTTP(S) válida.");
  }
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    configError("HESTIA_CODICE_CORS_ORIGIN deve ser uma origem exata, sem credenciais ou caminho.");
  }
  if (url.protocol === "https:") return value;
  const allowsHttpLoopback =
    (nodeEnv === "test" || nodeEnv === "development") && isLoopbackHost(url.hostname);
  if (url.protocol !== "http:" || !allowsHttpLoopback) {
    configError("HESTIA_CODICE_CORS_ORIGIN exige HTTPS fora de loopback em test/development.");
  }
  return value;
}

function resolveCodiceSupabaseUrl(value, nodeEnv) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    configError("HESTIA_CODICE_SUPABASE_URL é obrigatória quando o Códice está habilitado.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    configError("HESTIA_CODICE_SUPABASE_URL deve ser uma origem HTTP(S) válida.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    configError(
      "HESTIA_CODICE_SUPABASE_URL deve ser uma origem exata, sem credenciais ou caminho.",
    );
  }
  const allowsHttpLoopback =
    (nodeEnv === "test" || nodeEnv === "development") && isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && (url.protocol !== "http:" || !allowsHttpLoopback)) {
    configError("HESTIA_CODICE_SUPABASE_URL exige HTTPS fora de loopback em test/development.");
  }
  return url.origin;
}

function resolveCodicePublishableKey(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    configError(
      "HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY é obrigatória quando o Códice está habilitado.",
    );
  }
  if (!/^sb_publishable_\S+$/.test(value)) {
    configError("HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY deve usar o prefixo sb_publishable_.");
  }
  return value;
}

function resolveCodiceAllowedUserIds(value) {
  if (typeof value !== "string" || value.length === 0) {
    configError("HESTIA_CODICE_ALLOWED_USER_IDS é obrigatória quando o Códice está habilitado.");
  }
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => !entry || entry === "*")) {
    configError("HESTIA_CODICE_ALLOWED_USER_IDS deve conter UUIDs explícitos sem entradas vazias.");
  }
  if (entries.some((entry) => !isValidCodiceUserId(entry))) {
    configError("HESTIA_CODICE_ALLOWED_USER_IDS contém UUID inválido.");
  }
  return new Set(entries);
}

export function resolveStationAgentConfig(env = process.env) {
  const host = env.HESTIA_STATION_HOST?.trim() || "127.0.0.1";
  const portRaw = env.HESTIA_STATION_PORT?.trim() || "4518";
  const port = Number(portRaw);
  const token = env.HESTIA_STATION_TOKEN;
  const allowedHosts = env.HESTIA_STATION_ALLOWED_HOSTS?.trim() || "";
  const organizerEnabled = parseOrganizerEnabled(env.HESTIA_STATION_ORGANIZER_ENABLED);
  const codiceEnabled = parseCodiceEnabled(env.HESTIA_STATION_CODICE_ENABLED);
  const codiceCorsOrigin = codiceEnabled
    ? resolveCodiceCorsOrigin(env.HESTIA_CODICE_CORS_ORIGIN, env.NODE_ENV)
    : "";
  const codiceSupabaseUrl = codiceEnabled
    ? resolveCodiceSupabaseUrl(env.HESTIA_CODICE_SUPABASE_URL, env.NODE_ENV)
    : "";
  const codiceSupabasePublishableKey = codiceEnabled
    ? resolveCodicePublishableKey(env.HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY)
    : "";
  const codiceAllowedUserIds = codiceEnabled
    ? resolveCodiceAllowedUserIds(env.HESTIA_CODICE_ALLOWED_USER_IDS)
    : new Set();
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
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    configError("HESTIA_STATION_PORT deve ser uma porta válida.");
  }
  if (allowedHosts.split(",").some((entry) => entry.includes("*"))) {
    configError("HESTIA_STATION_ALLOWED_HOSTS não aceita wildcard.");
  }
  if (!isLoopbackHost(host) && !allowedHosts) {
    configError("bind não-loopback exige HESTIA_STATION_ALLOWED_HOSTS.");
  }
  if (codiceEnabled && !isLoopbackHost(host)) {
    configError("Códice read-only exige HESTIA_STATION_HOST em loopback.");
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
    organizerEnabled,
    codiceEnabled,
    codiceCorsOrigin,
    codiceSupabaseUrl,
    codiceSupabasePublishableKey,
    codiceAllowedUserIds,
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
  const readSystem = providers.getStationSystemStatus || getStationSystemStatus;
  const authFetch = providers.fetch || globalThis.fetch;

  app.addHook("onRequest", async (request, reply) => {
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    const allowed = buildAllowedHosts(config.host, port, config.allowedHosts);
    if (!isAllowedHostHeader(request.headers.host, allowed)) {
      return reply.code(421).send({ ok: false, error: "host_not_allowed" });
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.split("?", 1)[0].startsWith("/api/codice/")) return;
    if (!config.codiceEnabled) return;
    reply.header("Cache-Control", request.method === "OPTIONS" ? "no-store" : "private, no-store");
    const vary = String(reply.getHeader("Vary") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!vary.some((value) => value.toLowerCase() === "origin")) vary.push("Origin");
    reply.header("Vary", vary.join(", "));
    const origin = request.headers.origin;
    if (origin !== config.codiceCorsOrigin) {
      return reply.code(403).send({ ok: false, error: "origin_not_allowed" });
    }
    applyCodiceCors(request, reply, config.codiceCorsOrigin, { allowCredentials: false });
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
    const auth = await authenticateCodiceRequest({
      authorization: request.headers.authorization,
      supabaseUrl: config.codiceSupabaseUrl,
      publishableKey: config.codiceSupabasePublishableKey,
      allowedUserIds: config.codiceAllowedUserIds,
      fetchImpl: authFetch,
    });
    if (!auth.ok) {
      if (auth.status === 401) reply.header("WWW-Authenticate", "Bearer");
      return reply.code(auth.status).send({ ok: false, error: auth.error });
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.split("?", 1)[0].startsWith("/api/codice/")) return;
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

  app.get("/api/station/system/status", async () => readSystem());

  app.get("/api/station/storage/status", async () =>
    publicStorage(await readStorage([config.storagePath || "/KALINE"])),
  );

  app.get("/api/station/services/status", async () =>
    publicServices(await readServices(config.services || ALLOWED_SERVICES)),
  );

  if (config.organizerEnabled === true) {
    registerStationOrganizerRoutes(
      app,
      {
        dataDir: config.dataDir || resolveDataDir(),
        storagePath: config.storagePath || "/KALINE",
        storageSources: config.storageSources || [],
      },
      providers,
    );
  }

  if (config.codiceEnabled === true) {
    const storageRoot = config.storagePath || "/KALINE";
    const healthHandler = createCodiceHealthHandler(storageRoot);
    app.get("/api/station/codice/health", healthHandler);
    registerCodiceReadOnlyRoutes(app, { storageRoot, healthHandler });
  }

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
