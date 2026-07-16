import { createFileRoute } from "@tanstack/react-router";
import {
  hestiaApi,
  type ApiState,
  type StationConnection,
  type StationId,
  type StationStorage,
} from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { DataCard } from "@/components/hestia/shared/DataCard";
import { Row } from "@/components/hestia/shared/Row";

export const Route = createFileRoute("/_station/")({ component: Painel });

function Painel() {
  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">Console do notebook</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Héstia</h1>
        <p className="text-[13px] text-[color:var(--kaline-muted)]">
          Monitoramento independente e somente leitura das duas máquinas da Héstia.
        </p>
      </header>
      <section className="grid gap-4 xl:grid-cols-2">
        <StationCard id="desktop" title="Servidor" />
        <StationCard id="tvbox" title="TV Box" codice />
      </section>
    </div>
  );
}

export function StationCard({
  id,
  title,
  codice = false,
}: {
  id: StationId;
  title: string;
  codice?: boolean;
}) {
  const connection = useApi(() => hestiaApi.stationConnection(id), [id]);
  const storage = useApi(() => hestiaApi.stationStorage(id), [id]);
  const services = useApi(() => hestiaApi.stationServices(id), [id]);
  const codiceHealth = useApi(
    codice ? hestiaApi.tvboxCodiceHealth : async () => ({ status: "idle" as const }),
    [codice],
  );
  const refreshing =
    connection.refreshing ||
    storage.refreshing ||
    services.refreshing ||
    (codice && codiceHealth.refreshing);
  const retry = () => {
    connection.retry();
    storage.retry();
    services.retry();
    if (codice) codiceHealth.retry();
  };
  const state = connection.state.status === "ok" ? connection.state.data.state : "loading";

  return (
    <DataCard title={title} eyebrow="Station monitor-only" status={state} defaultOpen>
      <ConnectionRows state={connection.state} />
      <Row k="Armazenamento" v={storageLabel(storage.state)} />
      {services.state.status === "ok" ? (
        services.state.data.services.map((service) => (
          <Row key={service.id} k={service.id} v={service.status} />
        ))
      ) : (
        <Row
          k="Serviços"
          v={services.state.status === "loading" ? "consultando…" : "indisponível"}
        />
      )}
      {codice && (
        <Row
          k="Biblioteca Códice"
          v={
            codiceHealth.state.status === "loading"
              ? "consultando…"
              : codiceHealth.state.status === "ok"
                ? codiceHealth.state.data.formats.join(", ")
                : "indisponível"
          }
        />
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

function ConnectionRows({ state }: { state: ApiState<StationConnection> }) {
  if (state.status === "loading") return <Row k="Conexão" v="consultando…" />;
  if (state.status !== "ok") return <Row k="Conexão" v="indisponível" />;
  const labels: Record<StationConnection["state"], string> = {
    available: "disponível",
    unavailable: state.data.code === "STATION_TIMEOUT" ? "timeout" : "indisponível",
    not_configured: "não configurado",
    misconfigured: "configuração inválida",
    unauthorized: "não autorizado",
    incompatible: "incompatível",
  };
  return (
    <>
      <Row k="Conexão" v={labels[state.data.state]} />
      {state.data.state === "available" && (
        <Row k="Latência" v={state.data.latencyMs == null ? "—" : `${state.data.latencyMs} ms`} />
      )}
    </>
  );
}

function storageLabel(state: ApiState<StationStorage>) {
  if (state.status === "loading") return "consultando…";
  if (state.status !== "ok") return "indisponível";
  if (state.data.storage.status !== "ok" || state.data.storage.percentUsed == null)
    return state.data.storage.status;
  return `${state.data.storage.percentUsed}% em uso`;
}
