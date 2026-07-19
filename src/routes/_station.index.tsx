import { createFileRoute } from "@tanstack/react-router";
import {
  hestiaApi,
  type ApiState,
  type StationConnection,
  type StationId,
  type StationStorage,
  type StationSystem,
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
}> = [
  {
    id: "desktop",
    title: "Servidor",
    role: "Armazenamento e Organizer",
    canonicalStorage: true,
    codice: false,
  },
  { id: "tvbox", title: "TV Box", role: "Códice read-only", canonicalStorage: true, codice: true },
  {
    id: "pocket",
    title: "Pocket",
    role: "Hermes experimental e vigilância",
    canonicalStorage: false,
    codice: false,
  },
  {
    id: "baby",
    title: "Baby",
    role: "Telegram, monitoramento e Wake-on-LAN",
    canonicalStorage: false,
    codice: false,
  },
];

function Painel() {
  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">Console do notebook</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Héstia</h1>
        <p className="text-[13px] text-[color:var(--kaline-muted)]">
          Monitoramento independente e somente leitura das quatro Stations da Héstia.
        </p>
      </header>
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
}: {
  id: StationId;
  title: string;
  role: string;
  canonicalStorage: boolean;
  codice: boolean;
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
  const refreshing =
    connection.refreshing ||
    system.refreshing ||
    (canonicalStorage && storage.refreshing) ||
    services.refreshing ||
    (codice && codiceHealth.refreshing);
  const retry = () => {
    connection.retry();
    system.retry();
    if (canonicalStorage) storage.retry();
    services.retry();
    if (codice) codiceHealth.retry();
  };
  const state = connection.state.status === "ok" ? connection.state.data.state : "loading";
  const agent = connection.state.status === "ok" && connection.state.data.station;

  return (
    <DataCard title={title} eyebrow={role} status={state} defaultOpen>
      <ConnectionRows state={connection.state} />
      <Row
        k="Station Agent"
        v={agent ? "disponível" : state === "loading" ? "consultando…" : "indisponível"}
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
      {id === "desktop" && <Row k="Organizer" v="exclusivo do servidor" />}
      {codice && <Row k="Biblioteca Códice" v={codiceLabel(codiceHealth.state)} />}
      <Row k="Última atualização" v={latestCheckedAt(connection.state, system.state)} />
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

function ConnectionRows({ state }: { state: ApiState<StationConnection> }) {
  if (state.status === "loading") return <Row k="Conexão" v="consultando…" />;
  if (state.status !== "ok") return <Row k="Conexão" v="indisponível" />;
  const labels: Record<StationConnection["state"], string> = {
    available: "disponível",
    unavailable: state.data.code === "STATION_TIMEOUT" ? "timeout" : "indisponível",
    not_configured: "não configurada",
    misconfigured: "configuração inválida",
    unauthorized: "não autorizada",
    incompatible: "contrato incompatível",
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
