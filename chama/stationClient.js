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
const MAX_HEALTH_BODY_BYTES = 64 * 1024;
const SERVICE = "hestia-station-agent";

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

async function readLimitedJson(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, code: STATION_CODES.INVALID_CONTENT_TYPE };
  }
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, code: STATION_CODES.CONTRACT_MISMATCH };
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HEALTH_BODY_BYTES) {
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
  const cfg = resolveStationConfig(env);
  if (!cfg.configured) return failure("not_configured", STATION_CODES.NOT_CONFIGURED);
  if (!cfg.valid) return failure("misconfigured", cfg.errorCode || STATION_CODES.MISCONFIGURED);

  const finalUrl = new URL(HEALTH_PATH, cfg.baseUrl);
  if (finalUrl.origin !== cfg.baseUrl.origin || finalUrl.pathname !== HEALTH_PATH) {
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
    const health = validateStationHealth(parsed.body);
    if (!health) return failure("incompatible", STATION_CODES.CONTRACT_MISMATCH);
    return {
      ok: true,
      state: "available",
      code: null,
      latencyMs,
      station: health,
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
