// Chama Local — configuração central, somente leitura.
// Ordem de precedência: CLI (hestia.js) > env > ~/.chama/config.json > defaults.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { isLoopbackHost, resolvePresenceCorsOrigins } from "./security.js";
import { resolveDataDir } from "./dataDir.js";
import { resolveRetention } from "./retention.js";

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
    if (Array.isArray(raw.services))
      out.services = raw.services.filter((s) => ALLOWED_SERVICES.includes(s));
    return out;
  } catch {
    return {};
  }
}

const ALLOWED_SERVICES = ["jellyfin", "smbd", "tailscaled"];
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
  // Sobre exposição de rede (bind local vs LAN), não sobre capacidade de escrita — essa
  // vive em chama/capabilities.js (fonte única de verdade: writing.modifyStorage).
  mode: "Modo protegido: leitura por padrão; escrita local somente por ações explícitas, allowlisted e auditáveis.",
  readonly: true,
  readonlyByDefault: true,
  controlledWrites: true,
  lanEnabled: !isLoopbackHost(host),
  // Diretório de dados persistentes (identidade, eventos, snapshots). Só
  // vem de env/systemd — nunca do whitelist de ~/.chama/config.json.
  dataDir: resolveDataDir(),
  get storageRoot() {
    return process.env.HESTIA_STORAGE_PATH || process.env.HESTIA_KALINE_ROOT || "/KALINE";
  },
  get storagePaths() {
    return ["/", this.storageRoot];
  },
  storageSources: [],
  services: userCfg.services && userCfg.services.length > 0 ? userCfg.services : ALLOWED_SERVICES,
  stationBaseUrl: process.env.HESTIA_STATION_BASE_URL || "https://station.example.ts.net",
  // Retenção de planos/execuções/eventos — só via env (HESTIA_RETENTION_*_DAYS), nunca do
  // whitelist de ~/.chama/config.json.
  retention: resolveRetention(),
  // CORS pra /api/presence/* — opt-in explícito via HESTIA_PRESENCE_CORS_ORIGIN, nunca ligado
  // por padrão. Vazio preserva o comportamento restritivo de sempre (same-origin/local only).
  presenceCorsOrigins: resolvePresenceCorsOrigins(),
  // CORS da ponte Kaline V27b -> /api/llm/*: opt-in, origem única, sem wildcard.
  kalineCorsOrigin: process.env.HESTIA_KALINE_CORS_ORIGIN || "",
  // URL interna do Ollama local. Nunca vem do cliente.
  ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
  // Timeouts explícitos para a ponte local não travar consumidores como Klio/Kaline.
  // HESTIA_LLM_TIMEOUT_MS fica como fallback retrocompatível.
  llmHealthTimeoutMs:
    Number(process.env.HESTIA_LLM_HEALTH_TIMEOUT_MS) ||
    Number(process.env.HESTIA_LLM_TIMEOUT_MS) ||
    5_000,
  llmChatTimeoutMs:
    Number(process.env.HESTIA_LLM_CHAT_TIMEOUT_MS) ||
    Number(process.env.HESTIA_LLM_TIMEOUT_MS) ||
    90_000,
  get hermesRoot() {
    return process.env.HESTIA_HERMES_ROOT || join(this.dataDir, "hermes");
  },
  // Hosts extras permitidos (útil para o Tailscale Serve passar o Hostname)
  allowedHosts: process.env.HESTIA_ALLOWED_HOSTS || "",
};
