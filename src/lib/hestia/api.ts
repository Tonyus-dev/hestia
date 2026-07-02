// Camada centralizada de chamadas à Chama Local.
// Todas as leituras têm timeout, tratam erro e nunca inventam dados.

export type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T; fetchedAt: string }
  | { status: "unavailable"; message: string; fetchedAt: string };

export type Health = {
  ok: boolean;
  appName: string;
  serverName: string;
  agentName: string;
  version: string;
  hostname: string;
  timestamp: string;
  processUptime: number;
  readonly: boolean;
};

export type ServerStatus = {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
  totalMemory: number;
  freeMemory: number;
  loadAverage: number[];
  checkedAt: string;
};

export type StoragePath = {
  path: string;
  exists: boolean;
  status: "ok" | "missing" | "unavailable" | string;
  total: number | null;
  used: number | null;
  free: number | null;
  percentUsed: number | null;
  error?: string;
};

export type StorageStatus = { items: StoragePath[]; checkedAt: string };

export type ServiceStatus = {
  name: string;
  active: boolean;
  status: "active" | "inactive" | "failed" | "not-installed" | "unknown" | "unavailable";
  checkedAt: string;
};

export type ServicesStatus = { items: ServiceStatus[] };

export type LogItem = { timestamp: string; level: string; message: string };
export type Logs = { items: LogItem[]; tail?: number; capacity?: number };


export type Config = {
  appName: string;
  serverName: string;
  agentName: string;
  version: string;
  host: string;
  port: number;
  mode: string;
  readonly: boolean;
  lanEnabled: boolean;
  storagePaths: string[];
  services: string[];
};

const DEFAULT_TIMEOUT_MS = 3500;
const CHAMA_PORT = 4517;

/**
 * Resolve base URL da Chama Local.
 * - No browser em localhost/LAN: usa host atual na porta 4517.
 * - Em qualquer outro ambiente (preview Lovable, produção hospedada):
 *   retorna null → NÃO dispara fetch (evita 500 do SSR que não conhece /api/*).
 * - No servidor (SSR): também retorna null.
 */
function resolveBase(): string | null {
  if (typeof window === "undefined") return null;
  const { hostname, protocol } = window.location;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (!isLocal) return null;
  return `${protocol}//${hostname}:${CHAMA_PORT}`;
}

function unavailable<T>(message: string): ApiState<T> {
  return { status: "unavailable", message, fetchedAt: new Date().toISOString() };
}

async function safeFetch<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ApiState<T>> {
  const base = resolveBase();
  if (!base) {
    return unavailable<T>("Aguardando Chama Local (rode `npm run hestia` em http://localhost:4517)");
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return unavailable<T>(`Chama Local respondeu ${res.status}`);
    const data = (await res.json()) as T;
    return { status: "ok", data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return unavailable<T>(
      err instanceof DOMException && err.name === "AbortError"
        ? "Sem resposta da Chama Local (timeout)"
        : "API local indisponível",
    );
  } finally {
    clearTimeout(t);
  }
}

export const hestiaApi = {
  health: () => safeFetch<Health>("/api/health"),
  server: () => safeFetch<ServerStatus>("/api/server/status"),
  storage: () => safeFetch<StorageStatus>("/api/storage/status"),
  services: () => safeFetch<ServicesStatus>("/api/services/status"),
  logs: (tail?: number) =>
    safeFetch<Logs>(tail ? `/api/logs?tail=${Math.max(1, Math.min(200, tail | 0))}` : "/api/logs"),
  config: () => safeFetch<Config>("/api/config"),
  /** URL absoluta para exibir/copiar (ex.: comando curl). Sempre localhost:4517. */
  absoluteUrl: (path: string) => `http://localhost:${CHAMA_PORT}${path}`,
  /** Ping simples usado pela página /endpoints. Só bate quando estamos em host local. */
  ping: async (path: string): Promise<{ status: number | "erro"; ok: boolean }> => {
    const base = resolveBase();
    if (!base) return { status: "erro", ok: false };
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(t);
      return { status: res.status, ok: res.ok };
    } catch {
      return { status: "erro", ok: false };
    }
  },
};



export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "—";
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
