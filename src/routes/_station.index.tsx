import { createFileRoute } from "@tanstack/react-router";
import { hestiaApi, type StationConnection, type StationStorage } from "@/lib/hestia/api";
import { usePollingApi } from "@/lib/hestia/usePollingApi";
import { useApi } from "@/lib/hestia/useApi";
import { MetricCard } from "@/components/hestia/shared/MetricCard";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { DataCard } from "@/components/hestia/shared/DataCard";
import { Row } from "@/components/hestia/shared/Row";

export const Route = createFileRoute("/_station/")({ component: Painel });

function Painel() {
  const hw = usePollingApi(hestiaApi.hardwareStatus, 5000);
  const logs = useApi(() => hestiaApi.logs(20));
  const config = useApi(hestiaApi.config);
  const station = useApi(hestiaApi.stationConnection);
  const stationStorage = useApi(hestiaApi.stationStorage);
  const stationServices = useApi(hestiaApi.stationServices);
  const stationRefreshing =
    station.refreshing || stationStorage.refreshing || stationServices.refreshing;
  const retryStation = () => {
    station.retry();
    stationStorage.retry();
    stationServices.retry();
  };
  const d = hw.state.status === "ok" ? hw.state.data : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="kaline-eyebrow">Console do notebook</p>
          <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Héstia</h1>
          <p className="text-[13px] text-[color:var(--kaline-muted)]">
            A Héstia observa este notebook: hardware, serviços, logs, configuração e diagnóstico
            local.
          </p>
        </div>
        <button
          onClick={hw.retry}
          className="rounded border border-[color:var(--kaline-border-copper)] px-3 py-2 text-xs text-[color:var(--kaline-copper)]"
        >
          Atualizar
        </button>
      </header>

      {hw.state.status === "unavailable" && (
        <UnavailableNote
          message={hw.state.message}
          details={hw.state.details}
          onRetry={hw.retry}
          refreshing={hw.refreshing}
        />
      )}

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="saúde"
          value={d?.overall.status ?? "não disponível"}
          status={d?.overall.status ?? "unavailable"}
        />
        <MetricCard
          label="CPU/load"
          value={d?.cpu.loadRatio1m ?? "não disponível"}
          status={d?.cpu.status ?? "unavailable"}
        />
        <MetricCard
          label="memória"
          value={d ? `${d.memory.usedPercent}%` : "não disponível"}
          status={d?.memory.status ?? "unavailable"}
        />
        <MetricCard
          label="temperatura"
          value={
            d?.temperature.maxC == null ? "não disponível" : `${d.temperature.maxC.toFixed(1)}°C`
          }
          status={d?.temperature.status ?? "unavailable"}
        />
        <MetricCard
          label="serviços"
          value={d ? `${d.services.active}/${d.services.total}` : "não disponível"}
          status={d?.services.status ?? "unavailable"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataCard
          title="Este Notebook"
          eyebrow="console local"
          status={d?.overall.status ?? "idle"}
          defaultOpen
        >
          <Row
            k="CPU"
            v={d ? `${d.cpu.threads} threads · load ${d.cpu.loadRatio1m}` : "consultando…"}
          />
          <Row k="RAM" v={d ? `${d.memory.usedPercent}% em uso` : "consultando…"} />
          <Row k="Disco" v="diagnóstico de hardware local em /sistema" />
          <Row k="Bateria" v="diagnóstico de hardware local em /sistema" />
          <Row
            k="Serviços"
            v={d ? `${d.services.active}/${d.services.total} ativos` : "consultando…"}
          />
          <Row
            k="Temperatura"
            v={d?.temperature.available ? `${d.temperature.maxC?.toFixed(1)}°C` : "não disponível"}
          />
          <Row
            k="Logs"
            v={
              logs.state.status === "ok" && logs.state.data.items[0]
                ? logs.state.data.items[0].message
                : "não disponível"
            }
          />
          <Row
            k="Configuração"
            v={
              config.state.status === "ok"
                ? `${config.state.data.host}:${config.state.data.port}`
                : "consultando…"
            }
          />
        </DataCard>

        <DataCard
          title="Estação"
          eyebrow="cliente server-side"
          status={station.state.status === "ok" ? station.state.data.state : "idle"}
          defaultOpen
        >
          {station.state.status === "loading" && (
            <p className="text-sm text-[color:var(--kaline-muted)]">Verificando Estação…</p>
          )}
          {station.state.status === "unavailable" && (
            <UnavailableNote
              message={station.state.message}
              details={station.state.details}
              onRetry={station.retry}
              refreshing={station.refreshing}
            />
          )}
          {station.state.status === "ok" && <StationConnectionBody data={station.state.data} />}
          {station.state.status === "ok" && station.state.data.state === "available" && (
            <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--kaline-border)] pt-4">
              <div>
                <p className="kaline-eyebrow">Armazenamento da Estação</p>
                <Row
                  k="Kaline"
                  v={
                    stationStorage.state.status === "loading"
                      ? "consultando…"
                      : stationStorage.state.status === "ok"
                        ? formatStationStorage(stationStorage.state.data)
                        : "indisponível"
                  }
                />
              </div>
              <div>
                <p className="kaline-eyebrow">Serviços da Estação</p>
                {stationServices.state.status === "loading" ? (
                  <Row k="Estado" v="consultando…" />
                ) : stationServices.state.status === "ok" ? (
                  stationServices.state.data.services.map((service) => (
                    <Row key={service.id} k={service.id} v={service.status} />
                  ))
                ) : (
                  <Row k="Estado" v="indisponível" />
                )}
              </div>
            </div>
          )}
          <button
            onClick={retryStation}
            disabled={stationRefreshing}
            className="mt-4 rounded border border-[color:var(--kaline-border-copper)] px-3 py-2 text-xs text-[color:var(--kaline-copper)] disabled:opacity-60"
          >
            {stationRefreshing ? "Verificando…" : "Verificar novamente"}
          </button>
        </DataCard>
      </section>
    </div>
  );
}

function formatStationStorage(data: StationStorage) {
  if (!data || data.storage.status !== "ok" || data.storage.percentUsed == null)
    return data?.storage.status ?? "indisponível";
  return `${data.storage.percentUsed}% em uso`;
}

function StationConnectionBody({ data }: { data: StationConnection }) {
  if (data.state === "not_configured") {
    return (
      <>
        <p className="text-sm text-[color:var(--kaline-muted)]">Estação não configurada.</p>
        <p className="mt-2 text-sm text-[color:var(--kaline-muted)]">
          Defina a conexão no ambiente do serviço.
        </p>
      </>
    );
  }
  if (data.state === "misconfigured") {
    return (
      <p className="text-sm text-[color:var(--kaline-muted)]">Configuração da Estação inválida.</p>
    );
  }
  if (data.state === "available") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[color:var(--kaline-muted)]">Estação disponível.</p>
        <Row k="Agent" v={data.station?.service ?? "—"} />
        <Row k="Versão" v={data.station?.version ?? "—"} />
        <Row k="Latência" v={data.latencyMs == null ? "—" : `${data.latencyMs} ms`} />
      </div>
    );
  }
  if (data.state === "unauthorized") {
    return (
      <p className="text-sm text-[color:var(--kaline-muted)]">
        A Estação recusou a credencial configurada.
      </p>
    );
  }
  if (data.state === "incompatible") {
    return (
      <p className="text-sm text-[color:var(--kaline-muted)]">
        A Estação respondeu com um contrato incompatível.
      </p>
    );
  }
  return (
    <>
      <p className="text-sm text-[color:var(--kaline-muted)]">Estação indisponível.</p>
      <p className="mt-2 text-sm text-[color:var(--kaline-muted)]">
        O Console local continua funcionando normalmente.
      </p>
    </>
  );
}
