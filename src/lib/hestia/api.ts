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
export type Logs = { items: LogItem[] };

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

async function safeFetch<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ApiState<T>> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) {
      return {
        status: "unavailable",
        message: `Chama Local respondeu ${res.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }
    const data = (await res.json()) as T;
    return { status: "ok", data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return {
      status: "unavailable",
      message: err instanceof DOMException && err.name === "AbortError"
        ? "Sem resposta da Chama Local (timeout)"
        : "API local indisponível",
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(t);
  }
}

export const hestiaApi = {
  health: () => safeFetch<Health>("/api/health"),
  server: () => safeFetch<ServerStatus>("/api/server/status"),
  storage: () => safeFetch<StorageStatus>("/api/storage/status"),
  services: () => safeFetch<ServicesStatus>("/api/services/status"),
  logs: () => safeFetch<Logs>("/api/logs"),
  config: () => safeFetch<Config>("/api/config"),
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
