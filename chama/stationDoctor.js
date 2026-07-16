import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { resolveStationAgentConfig } from "./stationAgent.js";
import {
  fetchStationHealth,
  fetchStationServicesStatus,
  fetchStationStorageStatus,
} from "./stationClient.js";

export const DEFAULT_STATION_ENV_FILE = "/etc/default/hestia-station-agent";
const DEFAULT_TIMEOUT_MS = 10_000;
const RECOGNIZED_KEYS = new Set([
  "HESTIA_STATION_HOST",
  "HESTIA_STATION_PORT",
  "HESTIA_STATION_TOKEN",
  "HESTIA_STATION_ORGANIZER_ENABLED",
  "HESTIA_STATION_ALLOWED_HOSTS",
  "HESTIA_STORAGE_PATH",
  "HESTIA_KALINE_ROOT",
  "HESTIA_STATION_SERVICES",
  "HESTIA_DATA_DIR",
]);
const execFile = promisify(execFileCallback);

export function parseStationEnv(text) {
  const values = {};
  const seen = new Set();
  for (const [index, original] of String(text).split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`linha ${index + 1} inválida`);
    const [, key, rawValue] = match;
    if (seen.has(key)) throw new Error(`chave duplicada na linha ${index + 1}`);
    seen.add(key);
    let value = rawValue.trim();
    if (value.startsWith("'") || value.startsWith('"')) {
      const quote = value[0];
      if (value.length < 2 || value.at(-1) !== quote || value.slice(1, -1).includes(quote)) {
        throw new Error(`aspas inválidas na linha ${index + 1}`);
      }
      value = value.slice(1, -1);
    } else if (value.includes("'") || value.includes('"')) {
      throw new Error(`aspas inválidas na linha ${index + 1}`);
    }
    if (RECOGNIZED_KEYS.has(key)) values[key] = value;
  }
  return values;
}

export function parseStationDoctorArgs(argv) {
  const options = {
    envFile: DEFAULT_STATION_ENV_FILE,
    requireSystemd: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--require-systemd") options.requireSystemd = true;
    else if (argument === "--env-file") {
      const value = argv[++index];
      if (!value) throw new Error("--env-file exige um caminho");
      options.envFile = value;
    } else if (argument === "--timeout-ms") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1000 || value > 30_000) {
        throw new Error("--timeout-ms deve estar entre 1000 e 30000");
      }
      options.timeoutMs = value;
    } else {
      throw new Error(`argumento desconhecido: ${argument}`);
    }
  }
  return options;
}

export function mergeStationEnv(processEnv, fileEnv) {
  const merged = { ...fileEnv };
  for (const key of RECOGNIZED_KEYS) {
    if (processEnv[key] !== undefined) merged[key] = processEnv[key];
  }
  return merged;
}

function localHost(host) {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  if (host === "::1") return "[::1]";
  return host;
}

async function inspectDefaultEnvFile(path) {
  try {
    const info = await stat(path);
    const mode = info.mode & 0o777;
    const issues = [];
    if (!info.isFile()) issues.push("não é arquivo regular");
    if (info.uid !== 0) issues.push("dono não é root");
    if (mode !== 0o600) issues.push(`modo ${mode.toString(8).padStart(4, "0")} em vez de 0600`);
    return issues;
  } catch (error) {
    if (error.code === "ENOENT") return ["arquivo ausente"];
    return ["não foi possível inspecionar o arquivo"];
  }
}

async function readEnvFile(path) {
  try {
    return parseStationEnv(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function systemdStatus(runExecFile) {
  const check = async (args) => {
    try {
      const result = await runExecFile("systemctl", args, { timeout: 5000 });
      return { ok: true, output: String(result.stdout || "").trim() };
    } catch (error) {
      return { ok: false, missing: error.code === "ENOENT" };
    }
  };
  const enabled = await check(["is-enabled", "hestia-station-agent.service"]);
  if (enabled.missing) return { available: false, enabled: false, active: false };
  const active = await check(["is-active", "hestia-station-agent.service"]);
  return { available: true, enabled: enabled.ok, active: active.ok };
}

export async function runStationDoctor(options = {}, dependencies = {}) {
  const envFile = options.envFile || DEFAULT_STATION_ENV_FILE;
  const requireSystemd = options.requireSystemd === true;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const processEnv = dependencies.processEnv || process.env;
  const runExecFile = dependencies.execFile || execFile;
  const lines = [];
  let failed = false;
  let warnings = false;
  const ok = (message) => lines.push(`ok: ${message}`);
  const warn = (message) => {
    warnings = true;
    lines.push(`warn: ${message}`);
  };
  const bad = (message) => {
    failed = true;
    lines.push(`erro: ${message}`);
  };

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok(`Node ${process.version}`);
  else bad(`Node >=20 necessário (detectado ${process.version})`);

  let fileEnv;
  try {
    fileEnv = await readEnvFile(envFile);
  } catch (error) {
    bad(`arquivo de configuração inválido: ${error.message}`);
    return finish();
  }

  if (envFile === DEFAULT_STATION_ENV_FILE) {
    const issues = await inspectDefaultEnvFile(envFile);
    if (issues.length === 0) ok("arquivo de configuração protegido");
    else if (requireSystemd) bad(`arquivo de configuração inseguro: ${issues.join(", ")}`);
    else warn(`arquivo de configuração inseguro: ${issues.join(", ")}`);
  }

  const agentEnv = mergeStationEnv(processEnv, fileEnv);
  let config;
  try {
    config = resolveStationAgentConfig(agentEnv);
    if (!isAbsolute(config.storagePath)) throw new Error("storage root não é absoluto");
    ok("configuração válida");
  } catch (error) {
    bad(String(error.message || "configuração inválida").replace(/^\[Station Agent\]\s*/, ""));
    return finish();
  }

  const service = await systemdStatus(runExecFile);
  if (!service.available) {
    if (requireSystemd) bad("systemctl indisponível");
    else warn("systemctl indisponível");
  } else {
    if (service.enabled) ok("serviço systemd habilitado");
    else if (requireSystemd) bad("serviço systemd não habilitado");
    else warn("serviço systemd não habilitado");
    if (service.active) ok("serviço systemd ativo");
    else if (requireSystemd) bad("serviço systemd inativo");
    else warn("serviço systemd inativo");
  }

  const clientEnv = {
    NODE_ENV: "production",
    HESTIA_STATION_BASE_URL: `http://${localHost(config.host)}:${config.port}`,
    HESTIA_STATION_TOKEN: config.token,
    HESTIA_STATION_TIMEOUT_MS: String(timeoutMs),
    HESTIA_STATION_ALLOW_HTTP_LOOPBACK: "1",
  };
  const health = await fetchStationHealth(clientEnv);
  if (!health.ok) {
    bad(`health falhou (${health.code})`);
    return finish();
  }
  ok("health respondeu");

  const storage = await fetchStationStorageStatus(clientEnv);
  if (!storage.ok) bad(`storage falhou (${storage.code})`);
  else if (storage.storage.storage.status === "ok") ok("storage disponível");
  else warn(`storage ${storage.storage.storage.status}`);

  const services = await fetchStationServicesStatus(clientEnv);
  if (!services.ok) bad(`serviços falharam (${services.code})`);
  else {
    for (const item of services.services.services) {
      if (item.status === "active") ok(`${item.id} ativo`);
      else warn(`${item.id} ${item.status}`);
    }
  }
  return finish();

  function finish() {
    const summary = failed
      ? "Station Doctor: FALHOU"
      : warnings
        ? "Station Doctor: OK COM AVISOS"
        : "Station Doctor: OK";
    return { exitCode: failed ? 1 : 0, lines: [...lines, summary] };
  }
}
