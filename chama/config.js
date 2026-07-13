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

let resolvedStorageRoot =
  process.env.HESTIA_STORAGE_PATH || process.env.HESTIA_KALINE_ROOT || "/KALINE";

export function setStorageRootForTest(newRoot) {
  resolvedStorageRoot = newRoot;
}

const isSystemd = !!process.env.INVOCATION_ID;
if (isSystemd && resolvedStorageRoot !== "/KALINE") {
  console.error(
    `[Erro] Héstia rodando via systemd com raiz de armazenamento inválida: ${resolvedStorageRoot}. O serviço systemd suporta apenas /KALINE como raiz de produção.`,
  );
  process.exit(1);
}

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
    if (Array.isArray(raw.storageSources))
      out.storageSources = raw.storageSources
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          id: s.id,
          label: s.label,
          path: s.path,
          category: s.category,
          mode: s.mode,
        }))
        .filter(
          (s) =>
            typeof s.id === "string" &&
            typeof s.label === "string" &&
            typeof s.path === "string" &&
            typeof s.category === "string" &&
            ALLOWED_SOURCE_MODES.includes(s.mode),
        );
    return out;
  } catch {
    return {};
  }
}

const ALLOWED_SERVICES = ["jellyfin", "smbd", "tailscaled"];
// "external-readonly" é o único modo aceito: a Héstia nunca apaga o arquivo original de uma
// fonte externa, só copia (ver chama/organizerPlan.js). Qualquer outro valor é descartado.
const ALLOWED_SOURCE_MODES = ["external-readonly"];
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
    if (process.env.NODE_ENV === "test") {
      return process.env.HESTIA_STORAGE_PATH || process.env.HESTIA_KALINE_ROOT || "/KALINE";
    }
    return resolvedStorageRoot;
  },
  get storagePaths() {
    return userCfg.storagePaths && userCfg.storagePaths.length > 0
      ? userCfg.storagePaths
      : ["/", this.storageRoot];
  },
  services: userCfg.services && userCfg.services.length > 0 ? userCfg.services : ALLOWED_SERVICES,
  // Fontes externas do HD (ex.: pastas em /mnt/hd), só do whitelist — nunca de fora.
  storageSources: userCfg.storageSources || [],
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
    return process.env.HESTIA_HERMES_ROOT || join(this.storageRoot, "HESTIA");
  },
  get storagePathBase() {
    return this.storageRoot;
  },
  // Origem permitida para o Códice acessar via CORS (Tailscale/Cloudflare)
  codiceCorsOrigin: process.env.HESTIA_CODICE_CORS_ORIGIN || "",
  // Hosts extras permitidos (útil para o Tailscale Serve passar o Hostname)
  allowedHosts: process.env.HESTIA_ALLOWED_HOSTS || "",
};
