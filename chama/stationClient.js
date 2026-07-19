import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidOrganizerId } from "./organizerIds.js";

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

export const STATION_IDS = Object.freeze(["desktop", "tvbox", "pocket", "baby"]);
const STATION_ENV = Object.freeze({
  desktop: ["HESTIA_DESKTOP_BASE_URL", "HESTIA_DESKTOP_TOKEN"],
  tvbox: ["HESTIA_TVBOX_BASE_URL", "HESTIA_TVBOX_TOKEN"],
  pocket: ["HESTIA_POCKET_BASE_URL", "HESTIA_POCKET_TOKEN"],
  baby: ["HESTIA_BABY_BASE_URL", "HESTIA_BABY_TOKEN"],
});
const LEGACY_KEYS = Object.freeze(["HESTIA_STATION_BASE_URL", "HESTIA_STATION_TOKEN"]);

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_ORGANIZER_TIMEOUT_MS = 120000;
const MIN_ORGANIZER_TIMEOUT_MS = 5000;
const MAX_ORGANIZER_TIMEOUT_MS = 600000;
const HEALTH_PATH = "/api/station/health";
const STORAGE_PATH = "/api/station/storage/status";
const SERVICES_PATH = "/api/station/services/status";
const SYSTEM_PATH = "/api/station/system/status";
const CODICE_HEALTH_PATH = "/api/station/codice/health";
const ORGANIZER_PLAN_PATH = "/api/station/organizer/plan";
const ORGANIZER_RUNS_PATH = "/api/station/organizer/runs";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ORGANIZER_BODY_BYTES = 4 * 1024 * 1024;
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

export function resolveOrganizerTimeout(raw = process.env.HESTIA_ORGANIZER_TIMEOUT_MS) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_ORGANIZER_TIMEOUT_MS || n > MAX_ORGANIZER_TIMEOUT_MS)
    return DEFAULT_ORGANIZER_TIMEOUT_MS;
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
  const organizerTimeoutMs = resolveOrganizerTimeout(env.HESTIA_ORGANIZER_TIMEOUT_MS);
  if (!rawBaseUrl && !rawToken) {
    return {
      stationId,
      configured: false,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      organizerTimeoutMs,
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
      organizerTimeoutMs,
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
      organizerTimeoutMs,
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
      organizerTimeoutMs,
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
    organizerTimeoutMs,
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

const FORBIDDEN_ORGANIZER_KEYS = new Set([
  "token",
  "authorization",
  "secret",
  "stack",
  "sourcepath",
  "targetpath",
  "storagepath",
  "storageroot",
  "datadir",
  "from",
  "to",
  "path",
  "paths",
  "url",
]);

function containsForbiddenOrganizerData(value) {
  if (typeof value === "string") {
    return /[\0-\x1F\x7F]/.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenOrganizerData);
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_ORGANIZER_KEYS.has(key.toLowerCase()) || containsForbiddenOrganizerData(nested),
  );
}

const ORGANIZER_ACTIONS = new Set(["move", "copy"]);
const ORGANIZER_RISKS = new Set(["low", "medium", "high"]);
const ORGANIZER_ITEM_STATUSES = new Set(["planned", "conflict", "ignored", "quarantined"]);
const ORGANIZER_RUN_STATUSES = new Set(["applied", "partially_applied", "failed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isSafeRelativePath(value) {
  if (!isSafeString(value, { nonEmpty: true })) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value))
    return false;
  if (value.includes("\\")) return false;
  return !value.split("/").some((part) => part === "..");
}

function sanitizedCountMap(value) {
  if (!isPlainObject(value)) return null;
  const result = {};
  for (const [key, count] of Object.entries(value)) {
    if (!isSafeString(key, { nonEmpty: true }) || !Number.isInteger(count) || count < 0)
      return null;
    result[key] = count;
  }
  return result;
}

function sanitizedOrganizerItem(item) {
  if (
    !isPlainObject(item) ||
    !UUID_PATTERN.test(item.id) ||
    !isPlainObject(item.source) ||
    !isSafeString(item.source.kind, { nonEmpty: true }) ||
    !isSafeString(item.source.label, { nonEmpty: true }) ||
    !isSafeRelativePath(item.source.relativePath) ||
    !isPlainObject(item.target) ||
    !isSafeRelativePath(item.target.relativePath) ||
    !ORGANIZER_ACTIONS.has(item.action) ||
    !isSafeNullableString(item.reason) ||
    !ORGANIZER_RISKS.has(item.risk) ||
    !ORGANIZER_ITEM_STATUSES.has(item.status) ||
    !validNonNegativeNumber(item.size) ||
    (Object.hasOwn(item, "mtimeIso") && item.mtimeIso !== null && !isValidIsoDate(item.mtimeIso)) ||
    !isSafeNullableString(item.ignoredReason)
  )
    return null;
  return {
    id: item.id,
    source: {
      kind: item.source.kind,
      label: item.source.label,
      relativePath: item.source.relativePath,
    },
    target: { relativePath: item.target.relativePath },
    action: item.action,
    reason: item.reason,
    risk: item.risk,
    status: item.status,
    size: item.size,
    ...(Object.hasOwn(item, "mtimeIso") ? { mtimeIso: item.mtimeIso } : {}),
    ignoredReason: item.ignoredReason,
  };
}

function validateOrganizerPlan(body) {
  if (
    !isPlainObject(body) ||
    containsForbiddenOrganizerData(body) ||
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    !isValidIsoDate(body.checkedAt) ||
    !isPlainObject(body.plan)
  )
    return null;
  const plan = body.plan;
  if (
    !isValidOrganizerId(plan.planId) ||
    !plan.planId.startsWith("plan_") ||
    !isValidIsoDate(plan.generatedAt) ||
    plan.dryRun !== true ||
    typeof plan.requiresExtraConfirmation !== "boolean" ||
    !Number.isInteger(plan.planned) ||
    plan.planned < 0 ||
    !Array.isArray(plan.items) ||
    !isPlainObject(plan.summary)
  )
    return null;
  const items = plan.items.map(sanitizedOrganizerItem);
  if (items.some((item) => item === null)) return null;
  const summary = plan.summary;
  const counts = [
    summary.total,
    summary.planned,
    summary.conflicts,
    summary.ignored,
    summary.quarantined,
  ];
  const byExtension = sanitizedCountMap(summary.byExtension);
  const byTargetArea = sanitizedCountMap(summary.byTargetArea);
  if (
    counts.some((value) => !Number.isInteger(value) || value < 0) ||
    !byExtension ||
    !byTargetArea
  )
    return null;
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: body.checkedAt,
    plan: {
      planId: plan.planId,
      generatedAt: plan.generatedAt,
      dryRun: true,
      requiresExtraConfirmation: plan.requiresExtraConfirmation,
      planned: plan.planned,
      items,
      summary: {
        total: summary.total,
        planned: summary.planned,
        conflicts: summary.conflicts,
        ignored: summary.ignored,
        quarantined: summary.quarantined,
        byExtension,
        byTargetArea,
      },
    },
  };
}

function sanitizedOrganizerRun(item) {
  if (
    !isPlainObject(item) ||
    !isValidOrganizerId(item.runId) ||
    !ORGANIZER_RUN_STATUSES.has(item.status)
  )
    return null;
  const links = ["undoOf", "undoneBy", "redoOf", "redoneBy"];
  if (
    links.some(
      (key) => Object.hasOwn(item, key) && item[key] !== null && !isValidOrganizerId(item[key]),
    )
  )
    return null;
  return {
    runId: item.runId,
    status: item.status,
    undoOf: item.undoOf ?? null,
    undoneBy: item.undoneBy ?? null,
    redoOf: item.redoOf ?? null,
    redoneBy: item.redoneBy ?? null,
  };
}

function validateOrganizerRuns(body) {
  if (
    !isPlainObject(body) ||
    containsForbiddenOrganizerData(body) ||
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    !isValidIsoDate(body.checkedAt) ||
    !Array.isArray(body.items)
  )
    return null;
  const items = body.items.map(sanitizedOrganizerRun);
  if (items.some((item) => item === null)) return null;
  return { ok: true, schemaVersion: 1, checkedAt: body.checkedAt, items };
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

async function fetchJsonResource(path, validate, cfg, options = {}) {
  if (!cfg || typeof cfg !== "object") throw new TypeError("configuração da Station é obrigatória");
  if (!cfg.configured) return failure("not_configured", STATION_CODES.NOT_CONFIGURED);
  if (!cfg.valid) return failure("misconfigured", cfg.errorCode || STATION_CODES.MISCONFIGURED);
  const finalUrl = new URL(path, cfg.baseUrl);
  if (finalUrl.origin !== cfg.baseUrl.origin || finalUrl.pathname !== path) {
    return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? cfg.timeoutMs);
  try {
    const response = await fetch(finalUrl, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.auth
          ? {
              Authorization: `Bearer ${cfg.token}`,
              "X-Hestia-Console-Version": pkg.version || "0.1.0",
              "X-Hestia-Request-Id": randomUUID(),
            }
          : {}),
        ...(options.confirm ? { "X-Hestia-Local-Confirm": "organize" } : {}),
        ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.method === "POST" ? { body: "{}" } : {}),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      return failure("unauthorized", STATION_CODES.AUTH_FAILED);
    if (response.status >= 300 && response.status < 400)
      return failure("incompatible", STATION_CODES.REDIRECT_REJECTED);
    if (!response.ok) {
      return {
        ...failure("unavailable", STATION_CODES.UNAVAILABLE),
        remoteStatus: response.status,
      };
    }
    const parsed = await readLimitedJson(response, options.maxBytes || MAX_BODY_BYTES);
    if (!parsed.ok) return failure("incompatible", parsed.code);
    const resource = validate(parsed.body);
    if (!resource) return failure("incompatible", STATION_CODES.CONTRACT_MISMATCH);
    return {
      ok: true,
      state: "available",
      code: null,
      resource,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return failure(
      "unavailable",
      controller.signal.aborted ? STATION_CODES.TIMEOUT : STATION_CODES.UNAVAILABLE,
    );
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

export async function fetchDesktopOrganizerPlan(stationConfig) {
  if (stationConfig?.stationId !== "desktop")
    return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  const result = await fetchJsonResource(
    ORGANIZER_PLAN_PATH,
    validateOrganizerPlan,
    stationConfig,
    {
      method: "POST",
      auth: true,
      confirm: true,
      maxBytes: MAX_ORGANIZER_BODY_BYTES,
      timeoutMs: stationConfig.organizerTimeoutMs,
    },
  );
  if (!result.ok) return result;
  return result.resource;
}

export async function fetchDesktopOrganizerRuns(stationConfig) {
  if (stationConfig?.stationId !== "desktop")
    return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  const result = await fetchJsonResource(
    ORGANIZER_RUNS_PATH,
    validateOrganizerRuns,
    stationConfig,
    {
      auth: true,
      maxBytes: MAX_ORGANIZER_BODY_BYTES,
    },
  );
  if (!result.ok) return result;
  return result.resource;
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
  return {
    desktopConfigured: desktop.configured,
    desktopAuthConfigured: Boolean(env.HESTIA_DESKTOP_TOKEN?.trim()),
    tvboxConfigured: tvbox.configured,
    tvboxAuthConfigured: Boolean(env.HESTIA_TVBOX_TOKEN?.trim()),
    pocketConfigured: pocket.configured,
    pocketAuthConfigured: Boolean(env.HESTIA_POCKET_TOKEN?.trim()),
    babyConfigured: baby.configured,
    babyAuthConfigured: Boolean(env.HESTIA_BABY_TOKEN?.trim()),
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
