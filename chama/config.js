// Chama Local — configuração central, somente leitura.
// Ordem de precedência: CLI (hestia.js) > env > ~/.chama/config.json > defaults.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { isLoopbackHost } from "./security.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

// Whitelist opcional em ~/.chama/config.json (JSON puro).
// Só campos declarados são lidos; qualquer outro é ignorado.
function loadUserConfig() {
  const path = join(homedir(), ".chama", "config.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const out = {};
    if (typeof raw.host === "string") out.host = raw.host;
    if (Number.isFinite(raw.port)) out.port = Number(raw.port);
    if (Array.isArray(raw.storagePaths))
      out.storagePaths = raw.storagePaths.filter((s) => typeof s === "string");
    if (Array.isArray(raw.services))
      out.services = raw.services.filter((s) => ALLOWED_SERVICES.includes(s));
    return out;
  } catch {
    return {};
  }
}

const ALLOWED_SERVICES = ["jellyfin", "syncthing", "smbd", "tailscaled"];
const userCfg = loadUserConfig();

const host = process.env.HESTIA_HOST || userCfg.host || "127.0.0.1";
const port = Number(process.env.HESTIA_PORT) || userCfg.port || 4517;

export const config = {
  appName: "Héstia Console",
  serverName: "Héstia",
  agentName: "Chama Local",
  version: pkg.version || "0.1.0",
  host,
  port,
  mode: "local-readonly",
  readonly: true,
  lanEnabled: !isLoopbackHost(host),
  storagePaths:
    userCfg.storagePaths && userCfg.storagePaths.length > 0
      ? userCfg.storagePaths
      : ["/", process.env.HESTIA_STORAGE_PATH || "/KALINE"],
  services:
    userCfg.services && userCfg.services.length > 0
      ? userCfg.services
      : ALLOWED_SERVICES,
};
