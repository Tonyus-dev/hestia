import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

export const STATION_CODES = Object.freeze({
  NOT_CONFIGURED: "STATION_NOT_CONFIGURED",
  MISCONFIGURED: "STATION_MISCONFIGURED",
  TIMEOUT: "STATION_TIMEOUT",
  UNAVAILABLE: "STATION_UNAVAILABLE",
  AUTH_FAILED: "STATION_AUTH_FAILED",
  REDIRECT_REJECTED: "STATION_REDIRECT_REJECTED",
  INVALID_CONTENT_TYPE: "STATION_INVALID_CONTENT_TYPE",
  RESPONSE_TOO_LARGE: "STATION_RESPONSE_TOO_LARGE",
  CONTRACT_MISMATCH: "STATION_CONTRACT_MISMATCH",
});

export const STATION_IDS = Object.freeze([
  "desktop",
  "tvbox",
  "pocket",
  "baby",
  "mini",
  "max",
  "note",
]);
const STATION_ENV = Object.freeze({
  desktop: ["HESTIA_DESKTOP_BASE_URL", "HESTIA_DESKTOP_TOKEN"],
  tvbox: ["HESTIA_TVBOX_BASE_URL", "HESTIA_TVBOX_TOKEN"],
  pocket: ["HESTIA_POCKET_BASE_URL", "HESTIA_POCKET_TOKEN"],
  baby: ["HESTIA_BABY_BASE_URL", "HESTIA_BABY_TOKEN"],
  mini: ["HESTIA_MINI_BASE_URL", "HESTIA_MINI_TOKEN"],
  max: ["HESTIA_MAX_BASE_URL", "HESTIA_MAX_TOKEN"],
  note: ["HESTIA_NOTE_BASE_URL", "HESTIA_NOTE_TOKEN"],
});
const LEGACY_KEYS = Object.freeze(["HESTIA_STATION_BASE_URL", "HESTIA_STATION_TOKEN"]);

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;
const HEALTH_PATH = "/api/station/health";
const STORAGE_PATH = "/api/station/storage/status";
const SERVICES_PATH = "/api/station/services/status";
const SYSTEM_PATH = "/api/station/system/status";
const UPDATES_PATH = "/api/station/updates";
const TUNNEL_PATH = "/api/station/tunnel/status";
const CODICE_HEALTH_PATH = "/api/station/codice/health";
const MAX_BODY_BYTES = 64 * 1024;
const SERVICE = "hestia-station-agent";
const STORAGE_STATUSES = new Set(["ok", "missing", "unavailable"]);
const SERVICE_STATUSES = new Set([
  "active",
  "inactive",
  "failed",
  "not-installed",
  "unavailable",
  "unknown",
]);
const ALLOWED_SERVICES = ["jellyfin", "smbd", "tailscaled", "hermes", "telegram-guard"];

function resolveTimeout(raw = process.env.HESTIA_STATION_TIMEOUT_MS) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_TIMEOUT_MS || n > MAX_TIMEOUT_MS) return DEFAULT_TIMEOUT_MS;
  return n;
}

function isLoopback(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isDevelopmentLike(env = process.env.NODE_ENV) {
  return env === "development" || env === "test";
}

function allowsExplicitLoopbackHttp(env) {
  return env.HESTIA_STATION_ALLOW_HTTP_LOOPBACK === "1";
}

export function hasLegacyStationConfig(env = process.env) {
  return LEGACY_KEYS.some((key) => typeof env[key] === "string" && env[key].trim() !== "");
}

export function resolveNamedStationConfig(stationId, env = process.env) {
  const names = STATION_ENV[stationId];
  if (!names) throw new TypeError(`Station desconhecida: ${stationId}`);
  const [baseUrlKey, tokenKey] = names;
  const rawBaseUrl = env[baseUrlKey]?.trim() || "";
  const rawToken = env[tokenKey]?.trim() || "";
  const timeoutMs = resolveTimeout(env.HESTIA_STATION_TIMEOUT_MS);
  if (!rawBaseUrl && !rawToken) {
    return {
      stationId,
      configured: false,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.NOT_CONFIGURED,
    };
  }

  if (!rawBaseUrl || !rawToken) {
    return {
      stationId,
      configured: true,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.MISCONFIGURED,
    };
  }

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    return {
      stationId,
      configured: true,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.MISCONFIGURED,
    };
  }

  const hasOnlyOrigin = baseUrl.pathname === "/" && baseUrl.search === "" && baseUrl.hash === "";
  const protocolAllowed =
    baseUrl.protocol === "https:" ||
    (baseUrl.protocol === "http:" &&
      isLoopback(baseUrl.hostname) &&
      (isDevelopmentLike(env.NODE_ENV) || allowsExplicitLoopbackHttp(env)));
  if (!hasOnlyOrigin || baseUrl.username || baseUrl.password || !protocolAllowed) {
    return {
      stationId,
      configured: true,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.MISCONFIGURED,
    };
  }

  const normalized = new URL(baseUrl.origin);
  return {
    stationId,
    configured: true,
    valid: true,
    baseUrl: normalized,
    token: rawToken,
    timeoutMs,
    errorCode: null,
  };
}

function isPlainObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function validateStationHealth(body) {
  if (!isPlainObject(body)) return null;
  if (body.ok !== true) return null;
  if (body.schemaVersion !== 1) return null;
  if (body.service !== SERVICE) return null;
  if (typeof body.version !== "string" || body.version.trim() === "") return null;
  if (!isValidIsoDate(body.checkedAt)) return null;
  return {
    ok: true,
    schemaVersion: 1,
    service: SERVICE,
    version: body.version,
    checkedAt: body.checkedAt,
  };
}

function hasExactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateStationStorage(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "storage"]))
    return null;
  const item = body.storage;
  if (body.ok !== true || body.schemaVersion !== 1 || !isValidIsoDate(body.checkedAt)) return null;
  if (
    !isPlainObject(item) ||
    !hasExactKeys(item, [
      "id",
      "exists",
      "status",
      "totalBytes",
      "usedBytes",
      "freeBytes",
      "percentUsed",
    ]) ||
    item.id !== "kaline" ||
    typeof item.exists !== "boolean" ||
    !STORAGE_STATUSES.has(item.status)
  )
    return null;
  const values = [item.totalBytes, item.usedBytes, item.freeBytes];
  if (item.status === "ok") {
    if (!item.exists || !values.every(validNonNegativeNumber)) return null;
    if (!validNonNegativeNumber(item.percentUsed) || item.percentUsed > 100) return null;
  } else if (values.some((value) => value !== null) || item.percentUsed !== null) return null;
  if (item.status === "missing" && item.exists) return null;
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: body.checkedAt,
    storage: {
      id: "kaline",
      exists: item.exists,
      status: item.status,
      totalBytes: item.totalBytes,
      usedBytes: item.usedBytes,
      freeBytes: item.freeBytes,
      percentUsed: item.percentUsed,
    },
  };
}

function validateStationServices(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "services"]))
    return null;
  if (
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    !isValidIsoDate(body.checkedAt) ||
    !Array.isArray(body.services)
  )
    return null;
  const seen = new Set();
  const services = [];
  for (const item of body.services) {
    if (
      !isPlainObject(item) ||
      !hasExactKeys(item, ["id", "active", "status"]) ||
      !ALLOWED_SERVICES.includes(item.id) ||
      seen.has(item.id) ||
      typeof item.active !== "boolean" ||
      !SERVICE_STATUSES.has(item.status) ||
      item.active !== (item.status === "active")
    )
      return null;
    seen.add(item.id);
    services.push({ id: item.id, active: item.active, status: item.status });
  }
  if (
    services.some(
      (item, index) =>
        ALLOWED_SERVICES.indexOf(item.id) <= ALLOWED_SERVICES.indexOf(services[index - 1]?.id),
    )
  )
    return null;
  return { ok: true, schemaVersion: 1, checkedAt: body.checkedAt, services };
}

function validPercent(value) {
  return validNonNegativeNumber(value) && value <= 100;
}

function validateByteGroup(item) {
  if (
    !isPlainObject(item) ||
    !hasExactKeys(item, ["totalBytes", "usedBytes", "freeBytes", "usedPercent"]) ||
    ![item.totalBytes, item.usedBytes, item.freeBytes].every(validNonNegativeNumber) ||
    !validPercent(item.usedPercent)
  )
    return null;
  if (item.usedBytes + item.freeBytes > item.totalBytes) return null;
  return {
    totalBytes: item.totalBytes,
    usedBytes: item.usedBytes,
    freeBytes: item.freeBytes,
    usedPercent: item.usedPercent,
  };
}

function validateStationSystem(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "system"]))
    return null;
  if (body.ok !== true || body.schemaVersion !== 1 || !isValidIsoDate(body.checkedAt)) return null;
  const system = body.system;
  if (
    !isPlainObject(system) ||
    !hasExactKeys(system, [
      "hostname",
      "platform",
      "release",
      "arch",
      "uptimeSeconds",
      "cpu",
      "memory",
      "swap",
      "rootDisk",
    ]) ||
    typeof system.hostname !== "string" ||
    system.hostname.trim() === "" ||
    typeof system.platform !== "string" ||
    typeof system.release !== "string" ||
    typeof system.arch !== "string" ||
    !validNonNegativeNumber(system.uptimeSeconds)
  )
    return null;
  const cpu = system.cpu;
  if (
    !isPlainObject(cpu) ||
    !hasExactKeys(cpu, ["model", "cores", "threads", "loadAverage", "usagePercent"]) ||
    typeof cpu.model !== "string" ||
    !Number.isInteger(cpu.cores) ||
    cpu.cores < 1 ||
    !Number.isInteger(cpu.threads) ||
    cpu.threads < 1 ||
    !Array.isArray(cpu.loadAverage) ||
    cpu.loadAverage.length !== 3 ||
    !cpu.loadAverage.every(validNonNegativeNumber) ||
    !(validPercent(cpu.usagePercent) || cpu.usagePercent === null)
  )
    return null;
  const memory = validateByteGroup(system.memory);
  const swap = validateByteGroup(system.swap);
  const rootDisk = validateByteGroup(system.rootDisk);
  if (!memory || !swap || !rootDisk) return null;
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: body.checkedAt,
    system: {
      hostname: system.hostname,
      platform: system.platform,
      release: system.release,
      arch: system.arch,
      uptimeSeconds: system.uptimeSeconds,
      cpu: {
        model: cpu.model,
        cores: cpu.cores,
        threads: cpu.threads,
        loadAverage: cpu.loadAverage,
        usagePercent: cpu.usagePercent,
      },
      memory,
      swap,
      rootDisk,
    },
  };
}

function validateStationUpdates(body) {
  if (!isPlainObject(body)) return null;
  if (body.ok === false && body.status === "unsupported") {
    return {
      ok: false,
      status: "unsupported",
      reason: typeof body.reason === "string" ? body.reason : "APT_NOT_AVAILABLE",
      checkedAt: isValidIsoDate(body.checkedAt) ? body.checkedAt : new Date().toISOString(),
    };
  }
  if (
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    body.status !== "ok" ||
    !isValidIsoDate(body.checkedAt) ||
    !Array.isArray(body.updates) ||
    !Number.isInteger(body.totalUpdates) ||
    typeof body.rebootRequired !== "boolean"
  ) {
    return null;
  }
  const updates = [];
  for (const item of body.updates) {
    if (
      !isPlainObject(item) ||
      typeof item.package !== "string" ||
      !item.package.trim() ||
      typeof item.installedVersion !== "string" ||
      typeof item.candidateVersion !== "string" ||
      !(item.security === true || item.security === null)
    ) {
      return null;
    }
    updates.push({
      package: item.package,
      installedVersion: item.installedVersion,
      candidateVersion: item.candidateVersion,
      security: item.security,
    });
  }
  return {
    ok: true,
    schemaVersion: 1,
    status: "ok",
    checkedAt: body.checkedAt,
    updates,
    totalUpdates: body.totalUpdates,
    securityUpdates:
      typeof body.securityUpdates === "number"
        ? body.securityUpdates
        : updates.filter((item) => item.security === true).length,
    rebootRequired: body.rebootRequired,
  };
}

function validateStationTunnel(body) {
  if (!isPlainObject(body)) return null;
  if (body.ok !== true || body.schemaVersion !== 1 || !isValidIsoDate(body.checkedAt)) {
    return null;
  }
  if (!isPlainObject(body.tunnel) || !isPlainObject(body.publicRoute)) {
    return null;
  }
  return {
    ok: true,
    schemaVersion: 1,
    status: typeof body.status === "string" ? body.status : "ok",
    checkedAt: body.checkedAt,
    tunnel: {
      name: typeof body.tunnel.name === "string" ? body.tunnel.name : "cloudflared",
      connected: Boolean(body.tunnel.connected),
      haConnections: Number.isInteger(body.tunnel.haConnections) ? body.tunnel.haConnections : 0,
      protocol: typeof body.tunnel.protocol === "string" ? body.tunnel.protocol : "unknown",
      edgeColo: typeof body.tunnel.edgeColo === "string" ? body.tunnel.edgeColo : null,
    },
    publicRoute: {
      hostname: typeof body.publicRoute.hostname === "string" ? body.publicRoute.hostname : null,
      status:
        typeof body.publicRoute.status === "string" ? body.publicRoute.status : "not_configured",
      httpStatus: Number.isInteger(body.publicRoute.httpStatus)
        ? body.publicRoute.httpStatus
        : null,
      latencyMs: Number.isInteger(body.publicRoute.latencyMs) ? body.publicRoute.latencyMs : null,
      checkedAt: isValidIsoDate(body.publicRoute.checkedAt)
        ? body.publicRoute.checkedAt
        : body.checkedAt,
    },
  };
}

function validateCodiceHealth(body) {
  if (
    !isPlainObject(body) ||
    !hasExactKeys(body, ["ok", "schemaVersion", "generatedAt", "libraryAvailable", "formats"]) ||
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    body.libraryAvailable !== true ||
    !isValidIsoDate(body.generatedAt) ||
    !Array.isArray(body.formats)
  )
    return null;
  const formats = [...new Set(body.formats)];
  if (
    formats.length !== body.formats.length ||
    formats.some((format) => !["epub", "pdf", "txt"].includes(format)) ||
    !formats.includes("epub") ||
    !formats.includes("pdf")
  )
    return null;
  return {
    ok: true,
    state: "available",
    libraryAvailable: true,
    formats,
    checkedAt: body.generatedAt,
  };
}

function isSafeString(value, { nonEmpty = false } = {}) {
  return (
    typeof value === "string" &&
    !/[\0-\x1F\x7F]/.test(value) &&
    (!nonEmpty || value.trim().length > 0)
  );
}

function isSafeNullableString(value) {
  return value === null || isSafeString(value);
}

function isJsonContentType(header) {
  const mediaType = String(header || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function declaredBodyTooLarge(header, maxBytes = MAX_BODY_BYTES) {
  if (!header) return false;
  const value = Number(header);
  return Number.isFinite(value) && value > maxBytes;
}

async function readLimitedJson(res, maxBytes = MAX_BODY_BYTES) {
  if (!isJsonContentType(res.headers.get("content-type"))) {
    return { ok: false, code: STATION_CODES.INVALID_CONTENT_TYPE };
  }
  if (declaredBodyTooLarge(res.headers.get("content-length"), maxBytes)) {
    return { ok: false, code: STATION_CODES.RESPONSE_TOO_LARGE };
  }
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, code: STATION_CODES.CONTRACT_MISMATCH };
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, code: STATION_CODES.RESPONSE_TOO_LARGE };
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, code: STATION_CODES.CONTRACT_MISMATCH };
  }
}

function failure(state, code, latencyMs = null) {
  return { ok: false, state, code, latencyMs, station: null, checkedAt: new Date().toISOString() };
}

export async function fetchStationHealth(stationConfig) {
  const result = await fetchStationResource(HEALTH_PATH, validateStationHealth, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, station: resource };
}

async function fetchStationResource(path, validate, cfg) {
  if (!cfg || typeof cfg !== "object") throw new TypeError("configuração da Station é obrigatória");
  if (!cfg.configured) return failure("not_configured", STATION_CODES.NOT_CONFIGURED);
  if (!cfg.valid) return failure("misconfigured", cfg.errorCode || STATION_CODES.MISCONFIGURED);

  const finalUrl = new URL(path, cfg.baseUrl);
  if (finalUrl.origin !== cfg.baseUrl.origin || finalUrl.pathname !== path) {
    return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  }

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cfg.token}`,
        "X-Hestia-Console-Version": pkg.version || "0.1.0",
        "X-Hestia-Request-Id": randomUUID(),
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    if (res.status === 401 || res.status === 403)
      return failure("unauthorized", STATION_CODES.AUTH_FAILED);
    if (res.status >= 300 && res.status < 400)
      return failure("incompatible", STATION_CODES.REDIRECT_REJECTED);
    if (!res.ok) return failure("unavailable", STATION_CODES.UNAVAILABLE);
    const parsed = await readLimitedJson(res);
    if (!parsed.ok) return failure("incompatible", parsed.code);
    const resource = validate(parsed.body);
    if (!resource) return failure("incompatible", STATION_CODES.CONTRACT_MISMATCH);
    return {
      ok: true,
      state: "available",
      code: null,
      latencyMs,
      resource,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const isAbort =
      controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
    return failure("unavailable", isAbort ? STATION_CODES.TIMEOUT : STATION_CODES.UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTvboxCodiceHealth(stationConfig) {
  const cfg = stationConfig;
  if (!cfg || typeof cfg !== "object") throw new TypeError("configuração da TV Box é obrigatória");
  if (cfg.stationId !== "tvbox") return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  if (!cfg.configured) return failure("not_configured", STATION_CODES.NOT_CONFIGURED);
  if (!cfg.valid) return failure("misconfigured", cfg.errorCode || STATION_CODES.MISCONFIGURED);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(new URL(CODICE_HEALTH_PATH, cfg.baseUrl), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${cfg.token}` },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400)
      return failure("incompatible", STATION_CODES.REDIRECT_REJECTED);
    if (!response.ok) return failure("unavailable", STATION_CODES.UNAVAILABLE);
    const parsed = await readLimitedJson(response);
    if (!parsed.ok) return failure("incompatible", parsed.code);
    const codice = validateCodiceHealth(parsed.body);
    if (!codice) return failure("incompatible", STATION_CODES.CONTRACT_MISMATCH);
    return codice;
  } catch (error) {
    return failure(
      "unavailable",
      controller.signal.aborted ? STATION_CODES.TIMEOUT : STATION_CODES.UNAVAILABLE,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStationStorageStatus(stationConfig) {
  const result = await fetchStationResource(STORAGE_PATH, validateStationStorage, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, storage: resource };
}

export async function fetchStationServicesStatus(stationConfig) {
  const result = await fetchStationResource(SERVICES_PATH, validateStationServices, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, services: resource };
}

export async function fetchStationSystemStatus(stationConfig) {
  const result = await fetchStationResource(SYSTEM_PATH, validateStationSystem, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, system: resource };
}

export async function fetchStationUpdates(stationConfig) {
  const result = await fetchStationResource(UPDATES_PATH, validateStationUpdates, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  if (resource?.status === "unsupported") {
    return { ...metadata, ok: false, updates: resource };
  }
  return { ...metadata, updates: resource };
}

export async function fetchStationTunnelStatus(stationConfig) {
  const result = await fetchStationResource(TUNNEL_PATH, validateStationTunnel, stationConfig);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, tunnelStatus: resource };
}

export async function getStationConnectionStatus(stationConfig) {
  const result = await fetchStationHealth(stationConfig);
  return {
    ok: true,
    configured: result.state !== "not_configured",
    state: result.state,
    checkedAt: result.checkedAt,
    latencyMs: result.ok ? result.latencyMs : null,
    station: result.ok
      ? {
          service: result.station.service,
          schemaVersion: result.station.schemaVersion,
          version: result.station.version,
        }
      : null,
    ...(result.code ? { code: result.code } : {}),
  };
}

export function publicStationConfig(env = process.env) {
  const desktop = resolveNamedStationConfig("desktop", env);
  const tvbox = resolveNamedStationConfig("tvbox", env);
  const pocket = resolveNamedStationConfig("pocket", env);
  const baby = resolveNamedStationConfig("baby", env);
  const mini = resolveNamedStationConfig("mini", env);
  const max = resolveNamedStationConfig("max", env);
  const note = resolveNamedStationConfig("note", env);
  return {
    desktopConfigured: desktop.configured,
    desktopAuthConfigured: Boolean(env.HESTIA_DESKTOP_TOKEN?.trim()),
    tvboxConfigured: tvbox.configured,
    tvboxAuthConfigured: Boolean(env.HESTIA_TVBOX_TOKEN?.trim()),
    pocketConfigured: pocket.configured,
    pocketAuthConfigured: Boolean(env.HESTIA_POCKET_TOKEN?.trim()),
    babyConfigured: baby.configured,
    babyAuthConfigured: Boolean(env.HESTIA_BABY_TOKEN?.trim()),
    miniConfigured: mini.configured,
    miniAuthConfigured: Boolean(env.HESTIA_MINI_TOKEN?.trim()),
    maxConfigured: max.configured,
    maxAuthConfigured: Boolean(env.HESTIA_MAX_TOKEN?.trim()),
    noteConfigured: note.configured,
    noteAuthConfigured: Boolean(env.HESTIA_NOTE_TOKEN?.trim()),
    stationTimeoutMs: desktop.timeoutMs,
    legacyStationConfigDetected: hasLegacyStationConfig(env),
  };
}

export function stationHealthHttpStatus(code) {
  if (
    code === STATION_CODES.NOT_CONFIGURED ||
    code === STATION_CODES.MISCONFIGURED ||
    code === STATION_CODES.TIMEOUT ||
    code === STATION_CODES.UNAVAILABLE
  )
    return 503;
  return 502;
}
