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

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;
const HEALTH_PATH = "/api/station/health";
const STORAGE_PATH = "/api/station/storage/status";
const SERVICES_PATH = "/api/station/services/status";
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
const ALLOWED_SERVICES = ["jellyfin", "smbd", "tailscaled"];

function resolveTimeout(raw = process.env.HESTIA_STATION_TIMEOUT_MS) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_TIMEOUT_MS || n > MAX_TIMEOUT_MS) return DEFAULT_TIMEOUT_MS;
  return n;
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isDevelopmentLike(env = process.env.NODE_ENV) {
  return env === "development" || env === "test";
}

export function resolveStationConfig(env = process.env) {
  const rawBaseUrl = env.HESTIA_STATION_BASE_URL?.trim() || "";
  const timeoutMs = resolveTimeout(env.HESTIA_STATION_TIMEOUT_MS);
  if (!rawBaseUrl) {
    return {
      configured: false,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.NOT_CONFIGURED,
    };
  }

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    return {
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
      isDevelopmentLike(env.NODE_ENV));
  const token = env.HESTIA_STATION_TOKEN?.trim() || null;
  if (!hasOnlyOrigin || baseUrl.username || baseUrl.password || !protocolAllowed || !token) {
    return {
      configured: true,
      valid: false,
      baseUrl: null,
      token: null,
      timeoutMs,
      errorCode: STATION_CODES.MISCONFIGURED,
    };
  }

  const normalized = new URL(baseUrl.origin);
  return { configured: true, valid: true, baseUrl: normalized, token, timeoutMs, errorCode: null };
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

export async function fetchStationHealth(env = process.env) {
  const result = await fetchStationResource(HEALTH_PATH, validateStationHealth, env);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, station: resource };
}

async function fetchStationResource(path, validate, env = process.env) {
  const cfg = resolveStationConfig(env);
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

export async function fetchStationStorageStatus(env = process.env) {
  const result = await fetchStationResource(STORAGE_PATH, validateStationStorage, env);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, storage: resource };
}

export async function fetchStationServicesStatus(env = process.env) {
  const result = await fetchStationResource(SERVICES_PATH, validateStationServices, env);
  if (!result.ok) return result;
  const { resource, ...metadata } = result;
  return { ...metadata, services: resource };
}

export async function getStationConnectionStatus(env = process.env) {
  const result = await fetchStationHealth(env);
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
  const cfg = resolveStationConfig(env);
  return {
    stationConfigured: cfg.configured,
    stationAuthConfigured: Boolean(env.HESTIA_STATION_TOKEN?.trim()),
    stationTimeoutMs: cfg.timeoutMs,
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

const ORGANIZER_WRITE_TIMEOUT_MS = 60 * 60 * 1000;
const ORGANIZER_RUNS_TIMEOUT_MS = 15 * 1000;
const ORGANIZER_RUN_TIMEOUT_MS = 30 * 1000;
const ORGANIZER_DETAIL_BYTES = 16 * 1024 * 1024;
const ORGANIZER_RUNS_BYTES = 1024 * 1024;
const DOMAIN_STATUSES = new Set([400, 403, 404, 409, 410, 412]);

function validId(value, prefix) {
  return typeof value === "string" && new RegExp(`^${prefix}_\\d+_[0-9a-f]{8}$`).test(value);
}

function validItemId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function validRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function validateFileRef(value, source = false) {
  const keys = source ? ["kind", "label", "relativePath"] : ["relativePath"];
  if (!isPlainObject(value) || !hasExactKeys(value, keys)) return null;
  if (!validRelativePath(value.relativePath)) return null;
  if (source) {
    if (!["entrada", "external"].includes(value.kind)) return null;
    if (typeof value.label !== "string" || !value.label || value.label.length > 200) return null;
    return { kind: value.kind, label: value.label, relativePath: value.relativePath };
  }
  return { relativePath: value.relativePath };
}

function validateOrganizerOperation(value) {
  const keys = ["source", "target", "action", "status", "reason", "error", "undoPossible"];
  if (!isPlainObject(value) || !hasExactKeys(value, keys)) return null;
  const source = validateFileRef(value.source, true);
  const target = validateFileRef(value.target);
  if (!source || !target) return null;
  if (!["move", "copy", "delete"].includes(value.action)) return null;
  if (!["ok", "failed", "skipped"].includes(value.status)) return null;
  if (value.reason !== null && (typeof value.reason !== "string" || value.reason.length > 4096))
    return null;
  if (value.error !== null && (typeof value.error !== "string" || value.error.length > 200))
    return null;
  if (typeof value.undoPossible !== "boolean") return null;
  return { ...value, source, target };
}

function validateOrganizerRunEnvelope(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "run"]))
    return null;
  if (body.ok !== true || body.schemaVersion !== 1 || !isValidIsoDate(body.checkedAt)) return null;
  const run = body.run;
  const keys = [
    "runId",
    "planId",
    "kind",
    "status",
    "createdAt",
    "appliedAt",
    "undoOf",
    "undoneBy",
    "redoOf",
    "redoneBy",
    "operations",
    "summary",
  ];
  if (!isPlainObject(run) || !hasExactKeys(run, keys)) return null;
  if (!validId(run.runId, "(?:org|undo|redo)") || !validId(run.planId, "plan")) return null;
  if (!["apply", "undo", "redo"].includes(run.kind)) return null;
  if (!["applied", "partially_applied", "failed"].includes(run.status)) return null;
  if (!isValidIsoDate(run.createdAt) || !isValidIsoDate(run.appliedAt)) return null;
  for (const value of [run.undoOf, run.undoneBy, run.redoOf, run.redoneBy]) {
    if (value !== null && !validId(value, "(?:org|undo|redo)")) return null;
  }
  if ((run.kind === "undo") !== Boolean(run.undoOf)) return null;
  if ((run.kind === "redo") !== Boolean(run.redoOf)) return null;
  if (!Array.isArray(run.operations) || run.operations.length > 100000) return null;
  const operations = run.operations.map(validateOrganizerOperation);
  if (operations.some((item) => !item)) return null;
  if (
    !isPlainObject(run.summary) ||
    !hasExactKeys(run.summary, ["total", "ok", "failed", "skipped"]) ||
    !Object.values(run.summary).every((value) => Number.isInteger(value) && value >= 0) ||
    run.summary.total !== run.summary.ok + run.summary.failed + run.summary.skipped
  )
    return null;
  const counts = {
    ok: operations.filter((item) => item.status === "ok").length,
    failed: operations.filter((item) => item.status === "failed").length,
    skipped: operations.filter((item) => item.status === "skipped").length,
  };
  if (
    run.summary.total !== operations.length ||
    run.summary.ok !== counts.ok ||
    run.summary.failed !== counts.failed ||
    run.summary.skipped !== counts.skipped
  )
    return null;
  return { ok: true, schemaVersion: 1, checkedAt: body.checkedAt, run: { ...run, operations } };
}

function validateOrganizerRunsEnvelope(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "items"]))
    return null;
  if (
    body.ok !== true ||
    body.schemaVersion !== 1 ||
    !isValidIsoDate(body.checkedAt) ||
    !Array.isArray(body.items) ||
    body.items.length > 200
  )
    return null;
  const keys = ["runId", "status", "undoOf", "undoneBy", "redoOf", "redoneBy"];
  const items = [];
  for (const item of body.items) {
    if (!isPlainObject(item) || !hasExactKeys(item, keys)) return null;
    if (!validId(item.runId, "(?:org|undo|redo)")) return null;
    if (!["applied", "partially_applied", "failed"].includes(item.status)) return null;
    if (
      [item.undoOf, item.undoneBy, item.redoOf, item.redoneBy].some(
        (value) => value !== null && !validId(value, "(?:org|undo|redo)"),
      )
    )
      return null;
    items.push({ ...item });
  }
  return { ok: true, schemaVersion: 1, checkedAt: body.checkedAt, items };
}

function validateOrganizerPlanEnvelope(body) {
  if (!isPlainObject(body) || !hasExactKeys(body, ["ok", "schemaVersion", "checkedAt", "plan"]))
    return null;
  if (body.ok !== true || body.schemaVersion !== 1 || !isValidIsoDate(body.checkedAt)) return null;
  const plan = body.plan;
  const keys = [
    "planId",
    "generatedAt",
    "dryRun",
    "requiresExtraConfirmation",
    "largePlanThreshold",
    "planned",
    "items",
    "summary",
  ];
  if (!isPlainObject(plan) || !hasExactKeys(plan, keys)) return null;
  if (!validId(plan.planId, "plan") || !isValidIsoDate(plan.generatedAt) || plan.dryRun !== true)
    return null;
  if (typeof plan.requiresExtraConfirmation !== "boolean") return null;
  if (!Number.isInteger(plan.largePlanThreshold) || plan.largePlanThreshold < 1) return null;
  if (!Number.isInteger(plan.planned) || plan.planned < 0) return null;
  if (!Array.isArray(plan.items) || plan.items.length > 100000) return null;
  const itemKeys = [
    "id",
    "source",
    "target",
    "action",
    "reason",
    "risk",
    "status",
    "size",
    "mtimeIso",
    "ignoredReason",
  ];
  const items = [];
  for (const item of plan.items) {
    if (!isPlainObject(item) || !hasExactKeys(item, itemKeys) || !validItemId(item.id)) return null;
    const source = validateFileRef(item.source, true);
    const target = validateFileRef(item.target);
    if (!source || !target || !["move", "copy"].includes(item.action)) return null;
    if (!["planned", "conflict", "ignored"].includes(item.status)) return null;
    if (!["low", "medium", "high"].includes(item.risk)) return null;
    if (!validNonNegativeNumber(item.size)) return null;
    if (item.mtimeIso !== null && !isValidIsoDate(item.mtimeIso)) return null;
    if (item.reason !== null && (typeof item.reason !== "string" || item.reason.length > 4096))
      return null;
    if (
      item.ignoredReason !== null &&
      (typeof item.ignoredReason !== "string" || item.ignoredReason.length > 200)
    )
      return null;
    items.push({ ...item, source, target });
  }
  const summary = plan.summary;
  const summaryKeys = [
    "total",
    "planned",
    "conflicts",
    "ignored",
    "quarantined",
    "byExtension",
    "byTargetArea",
    "rules",
  ];
  if (!isPlainObject(summary) || !hasExactKeys(summary, summaryKeys)) return null;
  if (
    ![
      summary.total,
      summary.planned,
      summary.conflicts,
      summary.ignored,
      summary.quarantined,
    ].every((value) => Number.isInteger(value) && value >= 0)
  )
    return null;
  if (!isPlainObject(summary.byExtension) || !isPlainObject(summary.byTargetArea)) return null;
  if (
    Object.entries(summary.byExtension).some(
      ([key, value]) =>
        (!/^\.[a-z0-9]{1,10}$/.test(key) && key !== "(sem extensão)") ||
        !Number.isInteger(value) ||
        value < 0,
    ) ||
    Object.entries(summary.byTargetArea).some(
      ([key, value]) => !validRelativePath(key) || !Number.isInteger(value) || value < 0,
    )
  )
    return null;
  if (!isPlainObject(summary.rules) || !hasExactKeys(summary.rules, ["extensionRules", "fallback"]))
    return null;
  if (!Array.isArray(summary.rules.extensionRules) || summary.rules.extensionRules.length > 100)
    return null;
  const extensionRules = [];
  for (const rule of summary.rules.extensionRules) {
    if (!isPlainObject(rule) || !hasExactKeys(rule, ["extensions", "relativePath"])) return null;
    if (
      !Array.isArray(rule.extensions) ||
      rule.extensions.some((extension) => !/^\.[a-z0-9]{1,10}$/.test(extension)) ||
      !validRelativePath(rule.relativePath)
    )
      return null;
    extensionRules.push({ extensions: [...rule.extensions], relativePath: rule.relativePath });
  }
  if (!validRelativePath(summary.rules.fallback)) return null;
  if (
    plan.planned !== summary.planned ||
    plan.requiresExtraConfirmation !== plan.planned > plan.largePlanThreshold ||
    summary.total < items.length ||
    summary.planned !== items.filter((item) => item.status === "planned").length ||
    summary.conflicts !== items.filter((item) => item.status === "conflict").length ||
    summary.ignored < items.filter((item) => item.status === "ignored").length
  )
    return null;
  const cleanSummary = {
    total: summary.total,
    planned: summary.planned,
    conflicts: summary.conflicts,
    ignored: summary.ignored,
    quarantined: summary.quarantined,
    byExtension: { ...summary.byExtension },
    byTargetArea: { ...summary.byTargetArea },
    rules: { extensionRules, fallback: summary.rules.fallback },
  };
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: body.checkedAt,
    plan: { ...plan, items, summary: cleanSummary },
  };
}

function safeDomainError(body, status) {
  if (!isPlainObject(body) || body.ok !== false || typeof body.code !== "string") return null;
  if (typeof body.error !== "string" || !isValidIsoDate(body.checkedAt)) return null;
  const allowed = {
    400: ["EBADREQUEST"],
    403: ["EMISSINGCONFIRM"],
    404: ["EPLANNOTFOUND", "ERUNNOTFOUND", "EORIGINALNOTFOUND"],
    409: [
      "PLAN_ALREADY_APPLIED",
      "PLAN_ALREADY_CLAIMED",
      "ERUNBUSY",
      "EALREADYUNDONE",
      "EALREADYREDONE",
      "ENOTUNDORUN",
    ],
    410: ["EPLANEXPIRED"],
    412: ["ELARGEPLANCONFIRM"],
  };
  if (!allowed[status]?.includes(body.code)) return null;
  return { ok: false, code: body.code, error: body.error, checkedAt: body.checkedAt };
}

async function fetchStationOrganizer(path, init, validate, options, env = process.env) {
  const cfg = resolveStationConfig(env);
  if (!cfg.configured) return failure("not_configured", STATION_CODES.NOT_CONFIGURED);
  if (!cfg.valid) return failure("misconfigured", cfg.errorCode || STATION_CODES.MISCONFIGURED);
  const finalUrl = new URL(path, cfg.baseUrl);
  if (finalUrl.origin !== cfg.baseUrl.origin) {
    return failure("misconfigured", STATION_CODES.MISCONFIGURED);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(finalUrl, {
      method: init.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cfg.token}`,
        "X-Hestia-Console-Version": pkg.version || "0.1.0",
        "X-Hestia-Request-Id": randomUUID(),
        ...(init.method === "POST"
          ? {
              "Content-Type": "application/json",
              "X-Hestia-Local-Confirm": "organize",
              ...(init.largePlanConfirmed
                ? { "X-Hestia-Large-Plan-Confirm": init.largePlanConfirmed }
                : {}),
            }
          : {}),
      },
      body: init.method === "POST" ? JSON.stringify(init.body || {}) : undefined,
      credentials: "omit",
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      if (response.status === 403 && DOMAIN_STATUSES.has(response.status)) {
        const parsed = await readLimitedJson(response, 16 * 1024);
        const error = parsed.ok ? safeDomainError(parsed.body, 403) : null;
        if (error) {
          return { ok: false, state: "domain_error", status: 403, error };
        }
      }
      return failure("unauthorized", STATION_CODES.AUTH_FAILED);
    }
    if (response.status >= 300 && response.status < 400)
      return failure("incompatible", STATION_CODES.REDIRECT_REJECTED);
    if (!response.ok) {
      if (DOMAIN_STATUSES.has(response.status)) {
        const parsed = await readLimitedJson(response, 16 * 1024);
        const error = parsed.ok ? safeDomainError(parsed.body, response.status) : null;
        if (error) {
          return { ok: false, state: "domain_error", status: response.status, error };
        }
      }
      return failure("unavailable", STATION_CODES.UNAVAILABLE);
    }
    const parsed = await readLimitedJson(response, options.maxBytes);
    if (!parsed.ok) return failure("incompatible", parsed.code);
    const resource = validate(parsed.body);
    if (!resource) return failure("incompatible", STATION_CODES.CONTRACT_MISMATCH);
    return { ok: true, state: "available", resource, checkedAt: new Date().toISOString() };
  } catch (error) {
    return failure(
      "unavailable",
      controller.signal.aborted ? STATION_CODES.TIMEOUT : STATION_CODES.UNAVAILABLE,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function fetchStationOrganizerPlan(extensions, env = process.env) {
  const query = extensions ? `?extensions=${encodeURIComponent(extensions)}` : "";
  return fetchStationOrganizer(
    `/api/station/organizer/plan${query}`,
    { method: "POST", body: {} },
    validateOrganizerPlanEnvelope,
    { timeoutMs: ORGANIZER_WRITE_TIMEOUT_MS, maxBytes: ORGANIZER_DETAIL_BYTES },
    env,
  );
}

export function fetchStationOrganizerApply(planId, largePlanConfirmed, env = process.env) {
  return fetchStationOrganizer(
    "/api/station/organizer/apply",
    { method: "POST", body: { planId, mode: "apply" }, largePlanConfirmed },
    validateOrganizerRunEnvelope,
    { timeoutMs: ORGANIZER_WRITE_TIMEOUT_MS, maxBytes: ORGANIZER_DETAIL_BYTES },
    env,
  );
}

export function fetchStationOrganizerRuns(env = process.env) {
  return fetchStationOrganizer(
    "/api/station/organizer/runs",
    { method: "GET" },
    validateOrganizerRunsEnvelope,
    { timeoutMs: ORGANIZER_RUNS_TIMEOUT_MS, maxBytes: ORGANIZER_RUNS_BYTES },
    env,
  );
}

export function fetchStationOrganizerRun(runId, env = process.env) {
  return fetchStationOrganizer(
    `/api/station/organizer/runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
    validateOrganizerRunEnvelope,
    { timeoutMs: ORGANIZER_RUN_TIMEOUT_MS, maxBytes: ORGANIZER_DETAIL_BYTES },
    env,
  );
}

export function fetchStationOrganizerUndo(runId, env = process.env) {
  return fetchStationOrganizer(
    `/api/station/organizer/runs/${encodeURIComponent(runId)}/undo`,
    { method: "POST", body: {} },
    validateOrganizerRunEnvelope,
    { timeoutMs: ORGANIZER_WRITE_TIMEOUT_MS, maxBytes: ORGANIZER_DETAIL_BYTES },
    env,
  );
}

export function fetchStationOrganizerRedo(runId, env = process.env) {
  return fetchStationOrganizer(
    `/api/station/organizer/runs/${encodeURIComponent(runId)}/redo`,
    { method: "POST", body: {} },
    validateOrganizerRunEnvelope,
    { timeoutMs: ORGANIZER_WRITE_TIMEOUT_MS, maxBytes: ORGANIZER_DETAIL_BYTES },
    env,
  );
}
