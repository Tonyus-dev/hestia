// Camada centralizada de chamadas à Chama Local.
// Todas as leituras têm timeout, tratam erro e nunca inventam dados.

export type ApiErrorDetails = {
  route?: string;
  httpStatus?: number;
  code?: string;
  detail?: string;
  hint?: string;
  error?: string;
  at?: string;
  timeoutMs?: number;
  rawBody?: string;
  origin: "network" | "timeout" | "http" | "no-base";
};

export type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T; fetchedAt: string }
  | {
      status: "unavailable";
      message: string;
      fetchedAt: string;
      details: ApiErrorDetails;
    };

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
  frontendBuilt?: boolean;
  serviceUser?: string;
  dataDirWritable?: boolean;
  sambaActive?: boolean;
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

export type CodiceBook = {
  id: string;
  name: string;
  title: string;
  author: string | null;
  format: string;
  size: number;
  modifiedAt: string;
  url: string;
};

export type CodiceLibrary = {
  schemaVersion: number;
  generatedAt: string;
  truncated: boolean;
  limit: number;
  books: CodiceBook[];
};

export type CodiceImportResult = {
  success: boolean;
  filename: string;
  path: string;
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
export type HardwareSeverity = "ok" | "warn" | "critical" | "unavailable";
export type HardwareStatus = {
  generatedAt: string;
  overall: { status: HardwareSeverity; reasons: string[] };
  cpu: {
    status: HardwareSeverity;
    model?: string;
    cores: number;
    threads: number;
    loadAverage: number[];
    loadRatio1m: number | null;
    usagePercent: number | null;
  };
  memory: {
    status: HardwareSeverity;
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  swap: {
    status: HardwareSeverity;
    total: number;
    free: number;
    used: number;
    usedPercent: number | null;
  };
  temperature: {
    status: HardwareSeverity;
    available: boolean;
    maxC: number | null;
    sensors: { label: string; tempC: number; status: HardwareSeverity }[];
  };
  services: { status: HardwareSeverity; active: number; total: number; items: ServiceStatus[] };
};
export type HardwareConfig = {
  generatedAt: string;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
  cpu: { model: string; cores: number; threads: number };
  memory: { total: number };
  disks: {
    available: boolean;
    items: {
      name: string;
      type?: string;
      size?: string;
      model?: string;
      mountpoint?: string;
      fstype?: string;
      rota?: boolean | null;
      mountedPartition?: { name: string; mountpoint: string; fstype?: string } | null;
    }[];
    error?: string;
  };
  hestia: {
    host: string;
    port: number;
    mode: string;
    lanEnabled: boolean;
    desktopConfigured: boolean;
    desktopAuthConfigured: boolean;
    tvboxConfigured: boolean;
    tvboxAuthConfigured: boolean;
    stationTimeoutMs: number;
    legacyStationConfigDetected: boolean;
    services: string[];
  };
};
export type StorageSources = {
  items: { id: string; label: string; path: string; category: string; mode: string }[];
};
export type ServiceBinding = {
  id: string;
  serviceName: string;
  label: string;
  role: string;
};
export type ServiceBindings = ServiceBinding[];

export type LogItem = { timestamp: string; level: string; message: string };
export type Logs = { items: LogItem[]; tail?: number; capacity?: number };

export type LlmHealth = {
  ok: boolean;
  runtime: string;
  models: string[];
  allowedModels: string[];
  defaultModel: string;
  timeoutMs: number;
  error?: string;
  detail?: string;
  checkedAt: string;
};

export type LlmChatResult = {
  ok: boolean;
  text: string;
  model: string;
  runtime: string;
  checkedAt: string;
};

export type HermesStatus = {
  ok: boolean;
  root: string;
  folders?: Record<string, boolean>;
  pending?: number;
  processed?: number;
  failed?: number;
  code?: string;
  error?: string;
  checkedAt: string;
};

export type StationState =
  | "not_configured"
  | "misconfigured"
  | "available"
  | "unavailable"
  | "unauthorized"
  | "incompatible";

export type StationId = "desktop" | "tvbox";

export type StationHealth = {
  ok: true;
  schemaVersion: 1;
  service: "hestia-station-agent";
  version: string;
  checkedAt: string;
};

export type StationConnection = {
  ok: true;
  configured: boolean;
  state: StationState;
  checkedAt: string;
  latencyMs: number | null;
  station: null | { service: "hestia-station-agent"; schemaVersion: 1; version: string };
  code?: string;
};

export type StationStorage = {
  ok: true;
  schemaVersion: 1;
  checkedAt: string;
  storage: {
    id: "kaline";
    exists: boolean;
    status: "ok" | "missing" | "unavailable";
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    percentUsed: number | null;
  };
};

export type StationServices = {
  ok: true;
  schemaVersion: 1;
  checkedAt: string;
  services: Array<{
    id: "jellyfin" | "smbd" | "tailscaled";
    active: boolean;
    status: "active" | "inactive" | "failed" | "not-installed" | "unavailable" | "unknown";
  }>;
};

export type StationCodiceHealth = {
  ok: true;
  state: "available";
  libraryAvailable: true;
  formats: Array<"epub" | "pdf">;
  checkedAt: string;
};

export type Config = {
  appName: string;
  serverName: string;
  agentName: string;
  version: string;
  host: string;
  port: number;
  mode: string;
  readonly: boolean;
  controlledWrites: boolean;
  lanEnabled: boolean;
  desktopConfigured: boolean;
  desktopAuthConfigured: boolean;
  tvboxConfigured: boolean;
  tvboxAuthConfigured: boolean;
  stationTimeoutMs: number;
  legacyStationConfigDetected: boolean;
  services: string[];
};

export type StorageModelFolder = {
  id: string;
  label: string;
  relativePath: string;
  absolutePath: string;
  category: string;
  purpose: string;
  required: boolean;
  serviceHints: string[];
};
export type StorageModel = { root: string; folders: StorageModelFolder[] };

export type ScanSafeError = { path: string; code: string };
export type ScanResult = {
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
  extensions: Record<string, number>;
  truncated: boolean;
  reason?: string;
  safeErrors: ScanSafeError[];
  generatedAt: string;
};
export type StorageScan = {
  kaline: {
    root: string;
    folders: (ScanResult & { id: string; label: string; category: string })[];
    generatedAt: string;
  };
  sources: {
    items: (ScanResult & { id: string; label: string; category: string; mode: string })[];
    generatedAt: string;
  };
};

const DEFAULT_TIMEOUT_MS = 3500;
const CHAMA_PORT = 4517;

/**
 * Resolve base URL da Chama Local.
 * - Se servido pela própria Héstia: usa a origin atual.
 * - Em qualquer outro ambiente (preview Lovable, produção hospedada):
 *   retorna null → NÃO dispara fetch (evita 500 do SSR que não conhece /api/*).
 * - No servidor (SSR): também retorna null.
 */
function resolveBase(): string | null {
  if (typeof window === "undefined") return null;
  const { hostname, protocol, port, origin } = window.location;
  if (port === "5173") {
    return `${protocol}//${hostname}:${CHAMA_PORT}`;
  }
  return origin;
}

function unavailable<T>(message: string, details: ApiErrorDetails): ApiState<T> {
  return { status: "unavailable", message, details, fetchedAt: new Date().toISOString() };
}

function noBaseUnavailable<T>(method: string, path: string): ApiState<T> {
  return unavailable<T>("Aguardando Chama Local (rode `npm run hestia` em http://localhost:4517)", {
    origin: "no-base",
    route: `${method} ${path}`,
    detail: "Frontend não está em host local; nenhuma requisição foi disparada.",
    hint: "Abra o Héstia em http://localhost:4517 após rodar `npm run hestia`.",
  });
}

async function handleErrorResponse<T>(
  res: Response,
  method: string,
  path: string,
): Promise<ApiState<T>> {
  let parsed: {
    error?: string;
    code?: string;
    detail?: string;
    hint?: string;
    route?: string;
    at?: string;
  } = {};
  let rawBody = "";
  let parsedOk = false;
  try {
    rawBody = await res.text();
  } catch {
    /* corpo ilegível */
  }
  if (rawBody) {
    try {
      const maybe = JSON.parse(rawBody);
      if (maybe && typeof maybe === "object") {
        parsed = maybe;
        parsedOk = true;
      }
    } catch {
      /* corpo não-JSON, mantém rawBody */
    }
  }

  // ---- Fallback para respostas sem corpo estruturado ----
  // Ex.: 500 em texto puro, HTML de erro do proxy, corpo vazio.
  // Ainda assim garantimos HTTP status e rota claramente visíveis.
  const statusText = res.statusText || `HTTP ${res.status}`;
  const preview = rawBody.trim().slice(0, 180).replace(/\s+/g, " ");
  const fallbackDetail = !parsedOk
    ? rawBody
      ? `Corpo não-estruturado (${rawBody.length} bytes): ${preview}${rawBody.length > 180 ? "…" : ""}`
      : "Resposta vazia — backend não enviou corpo."
    : undefined;
  const fallbackHint = !parsedOk
    ? "Backend não retornou JSON no formato esperado. Veja 'corpo bruto' abaixo."
    : undefined;
  const fallbackError = !parsedOk ? statusText : undefined;

  const finalError = parsed.error ?? fallbackError;
  const finalDetail = parsed.detail ?? parsed.error ?? fallbackDetail;
  const finalHint = parsed.hint ?? fallbackHint;
  const finalCode = parsed.code ?? (!parsedOk ? `HTTP_${res.status}` : undefined);
  const finalAt = parsed.at ?? new Date().toISOString();

  const extra = [finalError, finalCode, parsed.detail ?? fallbackDetail, finalHint]
    .filter(Boolean)
    .join(" · ");

  return unavailable<T>(
    `${method} ${path} respondeu ${res.status} ${statusText}${extra ? ` — ${extra}` : ""}`,
    {
      origin: "http",
      route: parsed.route ?? `${method} ${path}`,
      httpStatus: res.status,
      code: finalCode,
      detail: finalDetail,
      error: finalError,
      hint: finalHint,
      at: finalAt,
      rawBody: rawBody.slice(0, 2000),
    },
  );
}

function handleFetchException<T>(
  err: unknown,
  method: string,
  path: string,
  timeoutMs: number,
): ApiState<T> {
  if (err instanceof DOMException && err.name === "AbortError") {
    return unavailable<T>(`Sem resposta de ${path} em ${timeoutMs}ms (timeout)`, {
      origin: "timeout",
      route: `${method} ${path}`,
      timeoutMs,
      detail: "A Chama Local não respondeu dentro do prazo configurado.",
      hint: "Verifique se o processo `hestia.js` está ativo e se o host não está sobrecarregado.",
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return unavailable<T>(
    `Falha de rede em ${path}: ${msg} (Chama Local caiu ou porta 4517 bloqueada?)`,
    {
      origin: "network",
      route: `${method} ${path}`,
      detail: msg,
      hint: "Confirme se `npm run hestia` está rodando e se a porta 4517 está acessível.",
    },
  );
}

async function safeFetch<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ApiState<T>> {
  const base = resolveBase();
  if (!base) return noBaseUnavailable<T>("GET", path);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return handleErrorResponse<T>(res, "GET", path);
    const data = (await res.json()) as T;
    return { status: "ok", data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return handleFetchException<T>(err, "GET", path, timeoutMs);
  } finally {
    clearTimeout(t);
  }
}

/** POST legado para telas excluídas do runtime ativo do Console. */
async function safePost<T>(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ApiState<T>> {
  const base = resolveBase();
  if (!base) return noBaseUnavailable<T>("POST", path);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { accept: "application/json", "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (!res.ok) return handleErrorResponse<T>(res, "POST", path);
    const data = (await res.json()) as T;
    return { status: "ok", data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return handleFetchException<T>(err, "POST", path, timeoutMs);
  } finally {
    clearTimeout(t);
  }
}

export const hestiaApi = {
  health: () => safeFetch<Health>("/api/health"),
  llmHealth: () => safeFetch<LlmHealth>("/api/llm/health"),
  hermesStatus: () => safeFetch<HermesStatus>("/api/hermes/status"),
  server: () => safeFetch<ServerStatus>("/api/server/status"),
  hardwareStatus: () => safeFetch<HardwareStatus>("/api/hardware/status"),
  hardwareConfig: () => safeFetch<HardwareConfig>("/api/hardware/config"),
  services: () => safeFetch<ServicesStatus>("/api/services/status"),
  serviceBindings: () => safeFetch<ServiceBindings>("/api/services/bindings"),
  logs: (tail?: number) =>
    safeFetch<Logs>(tail ? `/api/logs?tail=${Math.max(1, Math.min(200, tail | 0))}` : "/api/logs"),
  config: () => safeFetch<Config>("/api/config"),
  stationConnection: (id: StationId) =>
    safeFetch<StationConnection>(`/api/stations/${id}/connection`),
  stationHealth: (id: StationId) => safeFetch<StationHealth>(`/api/stations/${id}/health`),
  stationStorage: (id: StationId) =>
    safeFetch<StationStorage>(`/api/stations/${id}/storage/status`),
  stationServices: (id: StationId) =>
    safeFetch<StationServices>(`/api/stations/${id}/services/status`),
  tvboxCodiceHealth: () => safeFetch<StationCodiceHealth>("/api/stations/tvbox/codice/health"),
  /** Usa a mesma origem do Console quando disponível; em SSR usa fallback local. */
  absoluteUrl: (path: string) => {
    const base = resolveBase() ?? `http://localhost:${CHAMA_PORT}`;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  },
  /** Ping simples usado pela página /endpoints. Só bate quando estamos em host local. */
  ping: async (
    path: string,
  ): Promise<{ status: number | "erro"; ok: boolean; ms: number; error?: string }> => {
    const base = resolveBase();
    if (!base) return { status: "erro", ok: false, ms: 0, error: "sem base local" };
    const started = performance.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(t);
      return { status: res.status, ok: res.ok, ms: Math.round(performance.now() - started) };
    } catch (err) {
      return {
        status: "erro",
        ok: false,
        ms: Math.round(performance.now() - started),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const hestiaLegacyApi = {
  storage: () => safeFetch<StorageStatus>("/api/storage/status"),
  storageModel: () => safeFetch<StorageModel>("/api/storage/model"),
  storageSources: () => safeFetch<StorageSources>("/api/storage/sources"),
  storageScan: () => safeFetch<StorageScan>("/api/storage/scan"),
  llmChat: (message: string, model?: string, contextBlock?: string, facet?: string) =>
    safePost<LlmChatResult>(
      "/api/llm/chat",
      { message, model, contextBlock, facet: facet || "kaline" },
      {},
      90000,
    ),
  codiceLibrary: () => safeFetch<CodiceLibrary>("/api/codice/library"),
  codiceImport: async (file: File, name: string) => {
    const base = resolveBase() ?? `http://localhost:${CHAMA_PORT}`;
    const url = `${base}/api/codice/import?name=${encodeURIComponent(name)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3600000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        body: file,
        signal: controller.signal,
      });
      if (!res.ok)
        return handleErrorResponse<CodiceImportResult>(res, "POST", "/api/codice/import");
      const data = (await res.json()) as CodiceImportResult;
      return { status: "ok", data, fetchedAt: new Date().toISOString() };
    } catch (err) {
      return handleFetchException<CodiceImportResult>(err, "POST", "/api/codice/import", 3600000);
    } finally {
      clearTimeout(t);
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
