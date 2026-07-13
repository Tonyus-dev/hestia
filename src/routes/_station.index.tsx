import { createFileRoute } from "@tanstack/react-router";
import { hestiaApi } from "@/lib/hestia/api";
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

        <DataCard title="Estação" eyebrow="futuro" status="idle" defaultOpen>
          <p className="text-sm text-[color:var(--kaline-muted)]">Não configurada.</p>
          <p className="mt-2 text-sm text-[color:var(--kaline-muted)]">
            A Estação será configurada em uma etapa posterior.
          </p>
        </DataCard>
      </section>
    </div>
  );
}
