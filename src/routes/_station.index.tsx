import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  hestiaApi,
  type ApiState,
  type StationConnection,
  type StationId,
  type StationStorage,
  type StationSystem,
  type PresenceEvent,
  type PresenceEventsResult,
  type Config,
} from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { DataCard } from "@/components/hestia/shared/DataCard";
import { Row } from "@/components/hestia/shared/Row";

export const Route = createFileRoute("/_station/")({ component: Painel });

export const STATION_UI: Array<{
  id: StationId;
  title: string;
  role: string;
  canonicalStorage: boolean;
  codice: boolean;
  tunnelMonitored: boolean;
  onDemand: boolean;
}> = [
  {
    id: "desktop",
    title: "Servidor",
    role: "/KALINE · backup · processamento · serviços pesados sob demanda · Ash Gate",
    canonicalStorage: true,
    codice: false,
    tunnelMonitored: false,
    onDemand: true,
  },
  {
    id: "tvbox",
    title: "TV Box",
    role: "Héstia Console · Ash runtime · executor LAN/WoL · infraestrutura doméstica",
    canonicalStorage: true,
    codice: false,
    tunnelMonitored: true,
    onDemand: false,
  },
  {
    id: "pocket",
    title: "Pocket",
    role: "ZeroClaw · Khora",
    canonicalStorage: false,
    codice: false,
    tunnelMonitored: false,
    onDemand: false,
  },
  {
    id: "baby",
    title: "Baby",
    role: "Reserva cloud",
    canonicalStorage: false,
    codice: false,
    tunnelMonitored: false,
    onDemand: false,
  },
  {
    id: "mini",
    title: "Mini",
    role: "Kódice",
    canonicalStorage: false,
    codice: false,
    tunnelMonitored: false,
    onDemand: false,
  },
  {
    id: "max",
    title: "Max",
    role: "Cauldron / Kallistis VTT",
    canonicalStorage: false,
    codice: false,
    tunnelMonitored: true,
    onDemand: true,
  },
  {
    id: "note",
    title: "Notebook",
    role: "Workstation principal de desenvolvimento",
    canonicalStorage: false,
    codice: false,
    tunnelMonitored: false,
    onDemand: false,
  },
];

function formatDuration(ms?: number) {
  if (ms == null) return "";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

const ON_DEMAND_IDS = new Set(STATION_UI.filter((s) => s.onDemand).map((s) => s.id as string));

function computeGuardianSummary(events: PresenceEvent[]) {
  const activeIncidents: Array<{ type: string; name: string; timestamp: string; code?: string }> =
    [];
  const recentRecoveries: Array<{
    type: string;
    name: string;
    timestamp: string;
    durationMs?: number;
  }> = [];
  let wakeRequestedEvent: PresenceEvent | null = null;

  const seen = new Set<string>();

  for (const event of events) {
    if (event.type === "wake.requested" && !wakeRequestedEvent) {
      wakeRequestedEvent = event;
    }
    const isDown = event.type.endsWith(".down");
    const isUp = event.type.endsWith(".up");
    const isStation = event.type.startsWith("station");
    const name = isStation ? event.data?.station : event.data?.service;

    if (!name) continue;

    const key = `${event.type.split(".")[0]}:${name}`;

    if (isUp) {
      if (!seen.has(key)) {
        seen.add(key);
        recentRecoveries.push({
          type: event.type,
          name,
          timestamp: event.timestamp,
          durationMs: event.data?.durationMs,
        });
      }
    } else if (isDown) {
      const isResolved = seen.has(event.type.replace(".down", ".up"));
      const isExplicitWakeFailed = event.data?.code === "WAKE_FAILED";
      const isOnDemandResting = isStation && ON_DEMAND_IDS.has(name) && !isExplicitWakeFailed;

      if (!isResolved && !seen.has(key) && !isOnDemandResting) {
        seen.add(key);
        activeIncidents.push({
          type: event.type,
          name,
          timestamp: event.timestamp,
          code: event.data?.code,
        });
      }
    }
  }

  return { activeIncidents, recentRecoveries, wakeRequestedEvent };
}

function GuardianSummaryCard({
  configState,
  eventsState,
}: {
  configState: ApiState<Config>;
  eventsState: ApiState<PresenceEventsResult>;
}) {
  if (configState.status === "loading" || eventsState.status === "loading") {
    return (
      <div className="p-4 rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-obsidian)]/40 text-[color:var(--kaline-muted)] text-xs">
        Carregando resumo do guardião…
      </div>
    );
  }
  if (configState.status !== "ok" || eventsState.status !== "ok") {
    return null;
  }

  const config = configState.data;
  const events = eventsState.data.events;

  const { activeIncidents, recentRecoveries, wakeRequestedEvent } = computeGuardianSummary(events);

  const stationsKeys = ["desktop", "tvbox", "pocket", "baby", "mini", "max", "note"] as const;
  const configuredCount = stationsKeys.filter((k) => config[`${k}Configured`]).length;
  const activeStationIncidents = activeIncidents.filter((i) => i.type.startsWith("station"));
  const onlineCount = Math.max(0, configuredCount - activeStationIncidents.length);

  const hasCritical = activeIncidents.length > 0;

  return (
    <div
      className={`p-5 rounded-xl border ${
        hasCritical
          ? "border-red-900/60 bg-red-950/10"
          : "border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-obsidian)]/40"
      } space-y-4`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--kaline-text)]">
          Resumo do Guardião
        </h2>
        <span
          className={`text-xs px-2.5 py-0.5 rounded font-mono ${
            hasCritical
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}
        >
          {hasCritical ? "Falha crítica ativa" : "Infraestrutura estável"}
        </span>
      </div>

      <div className="space-y-2.5 text-xs text-[color:var(--kaline-muted)]">
        {/* 1. Wake Event Status */}
        {wakeRequestedEvent && (
          <div className="flex items-start gap-2 text-amber-400">
            <span className="font-bold">•</span>
            <span>
              <strong>Despertar solicitado:</strong> Servidor iniciando (pacote WoL transmitido às{" "}
              {new Date(wakeRequestedEvent.timestamp).toLocaleTimeString()})
            </span>
          </div>
        )}

        {/* 2. Active Incidents */}
        {activeIncidents.map((incident, idx) => {
          const isStation = incident.type.startsWith("station");
          const target = isStation ? incident.name.toUpperCase() : incident.name;
          const displayCode = incident.code === "AUTH_FAILED" ? " (Erro de Autenticação)" : "";
          return (
            <div key={idx} className="flex items-start gap-2 text-red-400">
              <span className="font-bold">•</span>
              <span>
                <strong>Incidente ativo:</strong>{" "}
                {isStation ? `Estação ${target}` : `Serviço ${target}`} offline desde{" "}
                {new Date(incident.timestamp).toLocaleTimeString()}
                {displayCode}
              </span>
            </div>
          );
        })}

        {/* 3. Nodes Offline Unexpectedly */}
        {activeStationIncidents.length > 0 && (
          <div className="text-[11px] text-red-500/80 italic pl-3">
            Atenção: {activeStationIncidents.length} de {configuredCount} nós configurados
            encontram-se offline de forma inesperada.
          </div>
        )}

        {/* 4. Recent Recoveries */}
        {recentRecoveries.slice(0, 3).map((recovery, idx) => {
          const isStation = recovery.type.startsWith("station");
          const target = isStation ? recovery.name.toUpperCase() : recovery.name;
          const durationStr = formatDuration(recovery.durationMs);
          return (
            <div key={idx} className="flex items-start gap-2 text-emerald-400/95">
              <span className="font-bold">•</span>
              <span>
                {isStation ? `Estação ${target}` : `Serviço ${target}`} recuperado(a)
                {durationStr ? ` após ${durationStr}` : ""}
              </span>
            </div>
          );
        })}

        {/* 5. Nodes Offline by Choice */}
        {(!config.maxConfigured || !config.maxAuthConfigured) && (
          <div className="flex items-start gap-2 text-[color:var(--kaline-faint)]">
            <span>•</span>
            <span>
              MAX suspensa / offline por escolha (computação cloud sob demanda disponível para
              despertar).
            </span>
          </div>
        )}

        {/* 6. General State */}
        <div className="pt-2 border-t border-[color:var(--kaline-border-copper)]/10 text-[11px] text-[color:var(--kaline-faint)] flex justify-between">
          <span>
            {onlineCount} de 7 nós ativos ({configuredCount} configurados)
          </span>
          <span>Héstia observa e solicita · O Guardião autoriza</span>
        </div>
      </div>
    </div>
  );
}

function Painel() {
  const { state: configState } = useApi(() => hestiaApi.config(), []);
  const { state: eventsState } = useApi(() => hestiaApi.recentEvents(50), []);

  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">Console da TV Box (Héstia Host)</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Héstia</h1>
        <p className="text-[13px] text-[color:var(--kaline-muted)]">
          Monitoramento independente e somente leitura das sete Stations da Héstia.
        </p>
      </header>

      <GuardianSummaryCard configState={configState} eventsState={eventsState} />

      <section className="grid gap-4 xl:grid-cols-2">
        {STATION_UI.map((station) => (
          <StationCard key={station.id} {...station} />
        ))}
      </section>
    </div>
  );
}

export function StationCard({
  id,
  title,
  role,
  canonicalStorage,
  codice,
  tunnelMonitored,
  onDemand,
}: {
  id: StationId;
  title: string;
  role: string;
  canonicalStorage: boolean;
  codice: boolean;
  tunnelMonitored: boolean;
  onDemand: boolean;
}) {
  const connection = useApi(() => hestiaApi.stationConnection(id), [id]);
  const system = useApi(() => hestiaApi.stationSystem(id), [id]);
  const storage = useApi(
    canonicalStorage
      ? () => hestiaApi.stationStorage(id)
      : async () => ({ status: "idle" as const }),
    [id, canonicalStorage],
  );
  const services = useApi(() => hestiaApi.stationServices(id), [id]);
  const codiceHealth = useApi(
    codice ? hestiaApi.tvboxCodiceHealth : async () => ({ status: "idle" as const }),
    [codice],
  );
  const tunnel = useApi(
    tunnelMonitored
      ? () => hestiaApi.stationTunnelStatus(id)
      : async () => ({ status: "idle" as const }),
    [id, tunnelMonitored],
  );
  const refreshing =
    connection.refreshing ||
    system.refreshing ||
    (canonicalStorage && storage.refreshing) ||
    services.refreshing ||
    (codice && codiceHealth.refreshing) ||
    (tunnelMonitored && tunnel.refreshing);
  const retry = () => {
    connection.retry();
    system.retry();
    if (canonicalStorage) storage.retry();
    services.retry();
    if (codice) codiceHealth.retry();
    if (tunnelMonitored) tunnel.retry();
  };
  const connectionState =
    connection.state.status === "ok" ? connection.state.data.state : "loading";
  const agent = connection.state.status === "ok" ? connection.state.data.station : null;
  const cardState = stationCardState(connection.state, onDemand);

  const [wakeState, setWakeState] = useState<{
    loading: boolean;
    waking?: boolean;
    sleeping?: boolean;
    attempt?: number;
    message?: string;
    error?: string;
  }>({ loading: false });

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPollTimer();
  }, []);

  useEffect(() => {
    if (wakeState.waking && connection.state.status === "ok" && connection.state.data.state === "available") {
      clearPollTimer();
      setWakeState({ loading: false, waking: false, message: "Servidor online e pronto!" });
    } else if (wakeState.sleeping && connection.state.status !== "ok") {
      clearPollTimer();
      setWakeState({ loading: false, sleeping: false, message: "Servidor em repouso." });
    }
  }, [connection.state, wakeState.waking, wakeState.sleeping]);

  const handleWakeServer = async () => {
    clearPollTimer();
    setWakeState({ loading: true, message: "Transmitindo Magic Packet WoL…" });
    const res = await hestiaApi.wakeServer();
    if (res.status === "ok" && res.data.ok) {
      let attempt = 1;
      const maxAttempts = 12;
      setWakeState({
        loading: true,
        waking: true,
        attempt: 1,
        message: `Magic Packet WoL transmitido! Aguardando servidor inicializar (${attempt}/${maxAttempts})…`,
      });
      retry();

      pollTimerRef.current = setInterval(async () => {
        attempt += 1;
        if (attempt > maxAttempts) {
          clearPollTimer();
          setWakeState({
            loading: false,
            waking: false,
            error: "Servidor não respondeu após 60s. Verifique cabos de rede/energia.",
          });
        } else {
          setWakeState((prev) => ({
            ...prev,
            attempt,
            message: `Magic Packet WoL transmitido! Aguardando servidor inicializar (${attempt}/${maxAttempts})…`,
          }));
          retry();
        }
      }, 5000);
    } else {
      const err =
        res.status === "unavailable"
          ? res.message
          : res.status === "ok"
            ? res.data.error || "Falha ao solicitar despertar"
            : "Erro de conexão";
      setWakeState({ loading: false, error: err });
    }
  };

  const handleSleepServer = async () => {
    clearPollTimer();
    setWakeState({ loading: true, message: "Solicitando repouso do Servidor…" });
    const res = await hestiaApi.sleepServer();
    if (res.status === "ok" && res.data.ok) {
      let attempt = 1;
      const maxAttempts = 8;
      setWakeState({
        loading: true,
        sleeping: true,
        attempt: 1,
        message: "Comando de repouso transmitido! Aguardando servidor desligar…",
      });
      retry();

      pollTimerRef.current = setInterval(async () => {
        attempt += 1;
        if (attempt > maxAttempts) {
          clearPollTimer();
          setWakeState({
            loading: false,
            sleeping: false,
            message: "Comando de repouso enviado ao Servidor.",
          });
        } else {
          retry();
        }
      }, 3000);
    } else {
      const err =
        res.status === "unavailable"
          ? res.message
          : res.status === "ok"
            ? res.data.error || "Falha ao solicitar repouso"
            : "Erro de conexão";
      setWakeState({ loading: false, error: err });
    }
  };

  return (
    <DataCard title={title} eyebrow={role} status={cardState.status} summary={cardState.summary}>
      <ConnectionRows state={connection.state} />
      <Row
        k="Station Agent"
        v={agent ? "disponível" : connectionState === "loading" ? "consultando…" : "indisponível"}
      />
      <Row k="Versão do Agent" v={agent?.version || "—"} />
      <SystemRows state={system.state} />
      <Row
        k={canonicalStorage ? "Armazenamento /KALINE" : "Disco raiz agregado"}
        v={
          canonicalStorage
            ? storageLabel(storage.state as ApiState<StationStorage>)
            : rootDiskLabel(system.state)
        }
      />
      {services.state.status === "ok" ? (
        services.state.data.services.length > 0 ? (
          services.state.data.services.map((service) => (
            <Row key={service.id} k={service.id} v={service.status} />
          ))
        ) : (
          <Row k="Serviços configurados" v="—" />
        )
      ) : (
        <Row
          k="Serviços configurados"
          v={services.state.status === "loading" ? "consultando…" : "indisponível"}
        />
      )}
      {codice && <Row k="Biblioteca Códice" v={codiceLabel(codiceHealth.state)} />}
      {tunnel.state.status === "ok" && tunnel.state.data.tunnel.connected && (
        <>
          <Row
            k="Cloudflare Tunnel"
            v={`${tunnel.state.data.tunnel.name} · ${tunnel.state.data.tunnel.haConnections}/4 HA (${tunnel.state.data.tunnel.protocol})`}
          />
          <Row
            k="Rota Pública"
            v={
              tunnel.state.data.publicRoute.status === "ok"
                ? `${tunnel.state.data.publicRoute.hostname} · PASS (${tunnel.state.data.publicRoute.latencyMs}ms)`
                : tunnel.state.data.publicRoute.status === "not_configured"
                  ? "não configurada"
                  : `${tunnel.state.data.publicRoute.hostname || "pública"} · DEGRADADA`
            }
          />
        </>
      )}
      <Row k="Última atualização" v={latestCheckedAt(connection.state, system.state)} />
      {id === "desktop" && (
        <div className="mt-3">
          {cardState.status !== "ok" ? (
            <button
              type="button"
              onClick={handleWakeServer}
              disabled={wakeState.loading}
              className="w-full rounded bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-60 transition-colors"
            >
              {wakeState.waking
                ? `Despertando servidor… (${wakeState.attempt || 1}/12)`
                : wakeState.loading
                  ? "Enviando Magic Packet WoL…"
                  : "Acordar servidor"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSleepServer}
              disabled={wakeState.loading}
              className="w-full rounded bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-600/40 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-60 transition-colors"
            >
              {wakeState.sleeping
                ? "Colocando em repouso…"
                : wakeState.loading
                  ? "Enviando comando de repouso…"
                  : "Dormir servidor"}
            </button>
          )}
          {wakeState.message && (
            <p className="mt-1.5 text-[11px] text-emerald-400 font-mono">{wakeState.message}</p>
          )}
          {wakeState.error && (
            <p className="mt-1.5 text-[11px] text-red-400 font-mono">{wakeState.error}</p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={retry}
        disabled={refreshing}
        className="mt-3 rounded border border-[color:var(--kaline-border-copper)] px-3 py-2 text-xs text-[color:var(--kaline-copper)] disabled:opacity-60"
      >
        {refreshing ? "Verificando…" : `Atualizar ${title}`}
      </button>
    </DataCard>
  );
}

export function stationCardState(
  state: ApiState<StationConnection>,
  onDemand = false,
): {
  summary: string;
  status: "ok" | "loading" | "unavailable" | "warn" | "error";
} {
  if (state.status === "loading") return { summary: "consultando…", status: "loading" };
  if (state.status !== "ok") {
    return onDemand
      ? { summary: "repouso (sob demanda)", status: "warn" }
      : { summary: "offline", status: "unavailable" };
  }
  const meta: Record<
    StationConnection["state"],
    { summary: string; status: "ok" | "unavailable" | "warn" | "error" }
  > = {
    available: { summary: "online", status: "ok" },
    unavailable: onDemand
      ? { summary: "repouso (sob demanda)", status: "warn" }
      : { summary: "offline", status: "unavailable" },
    not_configured: { summary: "não configurada", status: "warn" },
    expected_offline: { summary: "repouso (sob demanda)", status: "warn" },
    misconfigured: { summary: "configuração inválida", status: "error" },
    unauthorized: { summary: "não autorizada", status: "error" },
    incompatible: { summary: "incompatible", status: "error" },
  };
  return meta[state.data.state];
}

function ConnectionRows({ state }: { state: ApiState<StationConnection> }) {
  if (state.status === "loading") return <Row k="Conexão" v="consultando…" />;
  if (state.status !== "ok") return <Row k="Conexão" v="indisponível" />;
  const labels: Record<StationConnection["state"], string> = {
    available: "online",
    unavailable: state.data.code === "STATION_TIMEOUT" ? "timeout" : "offline",
    not_configured: "não configurada",
    expected_offline: "offline por escolha",
    misconfigured: "configuração inválida",
    unauthorized: "não autorizada",
    incompatible: "incompatible",
  };
  return (
    <>
      <Row k="Conexão" v={labels[state.data.state]} />
      <Row k="Latência" v={state.data.latencyMs == null ? "—" : `${state.data.latencyMs} ms`} />
    </>
  );
}

function SystemRows({ state }: { state: ApiState<StationSystem> }) {
  if (state.status === "loading") return <Row k="Sistema" v="consultando…" />;
  if (state.status !== "ok") return <Row k="Sistema" v="indisponível" />;
  const { system } = state.data;
  return (
    <>
      <Row k="Hostname" v={system.hostname} />
      <Row k="Sistema" v={`${system.platform} ${system.release}`} />
      <Row k="Arquitetura" v={system.arch} />
      <Row k="Uptime" v={formatUptime(system.uptimeSeconds)} />
      <Row
        k="CPU"
        v={`${system.cpu.model} · ${system.cpu.threads} threads · ${formatPercent(system.cpu.usagePercent)}`}
      />
      <Row
        k="RAM"
        v={`${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)} (${formatPercent(system.memory.usedPercent)})`}
      />
      <Row
        k="Swap"
        v={`${formatBytes(system.swap.usedBytes)} / ${formatBytes(system.swap.totalBytes)} (${formatPercent(system.swap.usedPercent)})`}
      />
    </>
  );
}

function storageLabel(state: ApiState<StationStorage>) {
  if (state.status === "loading") return "consultando…";
  if (state.status !== "ok") return "indisponível";
  if (state.data.storage.status !== "ok" || state.data.storage.percentUsed == null)
    return state.data.storage.status;
  return `${formatBytes(state.data.storage.usedBytes)} / ${formatBytes(state.data.storage.totalBytes)} (${formatPercent(state.data.storage.percentUsed)})`;
}

function rootDiskLabel(state: ApiState<StationSystem>) {
  if (state.status === "loading") return "consultando…";
  if (state.status !== "ok") return "indisponível";
  const disk = state.data.system.rootDisk;
  return `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} (${formatPercent(disk.usedPercent)})`;
}

function codiceLabel(state: ApiState<{ formats: string[] }>) {
  if (state.status === "loading") return "consultando…";
  return state.status === "ok" ? state.data.formats.join(", ") : "indisponível";
}

function latestCheckedAt(...states: ApiState<{ checkedAt: string }>[]) {
  const dates = states
    .filter(
      (state): state is ApiState<{ checkedAt: string }> & { status: "ok" } => state.status === "ok",
    )
    .map((state) => state.data.checkedAt)
    .sort();
  return dates.at(-1) || "—";
}

function formatBytes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatPercent(value: number | null) {
  return value == null || !Number.isNaN(value) === false ? "—" : `${value}%`;
}

function formatUptime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}
