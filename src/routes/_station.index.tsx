import { Link, createFileRoute } from "@tanstack/react-router";
import { hestiaApi, formatBytes } from "@/lib/hestia/api";
import { usePollingApi } from "@/lib/hestia/usePollingApi";
import { useApi } from "@/lib/hestia/useApi";
import { MetricCard } from "@/components/hestia/MetricCard";
import { DataCard, Row, UnavailableNote } from "@/components/hestia/UnavailableNote";

export const Route = createFileRoute("/_station/")({ component: Painel });
function Painel() {
  const hw = usePollingApi(hestiaApi.hardwareStatus, 5000);
  const scan = useApi(hestiaApi.storageScan);
  const runs = useApi(hestiaApi.organizerRuns);
  const logs = useApi(() => hestiaApi.logs(20));
  const d = hw.state.status === "ok" ? hw.state.data : null;
  const kaline = d?.storage.items.find((i) => i.path === "/KALINE");
  const lastRun = runs.state.status === "ok" ? runs.state.data.items[0] : null;
  const pending =
    scan.state.status === "ok" ? scan.state.data.sources.items.reduce((a, s) => a + s.files, 0) : 0;
  const action = !kaline?.exists
    ? ["verificar montagem do /KALINE", "/sistema"]
    : d?.overall.status === "critical"
      ? ["abrir Sistema", "/sistema"]
      : pending > 0
        ? ["revisar organização", "/organizar"]
        : d && d.services.active < d.services.total
          ? ["abrir Serviços", "/servicos"]
          : lastRun?.status === "failed"
            ? ["abrir Histórico", "/historico"]
            : ["sistema estável", "/sistema"];
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="kaline-eyebrow">Painel operacional</p>
          <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Héstia</h1>
          <p className="text-[13px] text-[color:var(--kaline-muted)]">
            Modo protegido · escrita local apenas com aprovação · sem comandos destrutivos.
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
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="saúde"
          value={d?.overall.status ?? "não disponível"}
          status={d?.overall.status ?? "unavailable"}
          detail={hw.lastUpdated ? new Date(hw.lastUpdated).toLocaleTimeString() : "sem leitura"}
        />
        <MetricCard
          label="CPU/load"
          value={d?.cpu.loadRatio1m ?? "não disponível"}
          status={d?.cpu.status ?? "unavailable"}
          detail={d?.cpu.usagePercent == null ? "uso não disponível" : `${d.cpu.usagePercent}% uso`}
        />
        <MetricCard
          label="memória"
          value={d ? `${d.memory.usedPercent}%` : "não disponível"}
          status={d?.memory.status ?? "unavailable"}
        />
        <MetricCard
          label="/KALINE"
          value={kaline?.exists ? `${kaline.percentUsed ?? "—"}%` : "ausente"}
          status={kaline?.status ?? "unavailable"}
        />
        <MetricCard
          label="serviços"
          value={d ? `${d.services.active}/${d.services.total}` : "não disponível"}
          status={d?.services.status ?? "unavailable"}
        />
        <MetricCard label="último run" value={lastRun?.status ?? "não disponível"} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <DataCard
          title="Uso do /KALINE por categoria"
          eyebrow="storage"
          status={
            scan.state.status === "ok"
              ? "ok"
              : scan.state.status === "unavailable"
                ? "error"
                : "loading"
          }
          defaultOpen
        >
          {scan.state.status === "ok" ? (
            scan.state.data.kaline.folders.map((f) => (
              <Row key={f.id} k={f.label} v={`${f.files} arquivos · ${formatBytes(f.bytes)}`} />
            ))
          ) : scan.state.status === "unavailable" ? (
            <UnavailableNote
              message={scan.state.message}
              details={scan.state.details}
              onRetry={scan.retry}
              refreshing={scan.refreshing}
            />
          ) : (
            <p>consultando…</p>
          )}
        </DataCard>
        <div className="space-y-4">
          <DataCard
            title="Próxima ação"
            eyebrow="derivada de dados reais"
            status="idle"
            defaultOpen
          >
            <Link to={action[1]} className="text-[color:var(--kaline-copper)]">
              {action[0]} →
            </Link>
          </DataCard>
          <DataCard
            title="Diagnóstico rápido"
            eyebrow="motivos"
            status={d?.overall.status ?? "idle"}
          >
            {d?.overall.reasons.length ? (
              d.overall.reasons.map((r) => (
                <p key={r} className="text-sm text-[color:var(--kaline-muted)]">
                  · {r}
                </p>
              ))
            ) : (
              <p className="text-sm text-[color:var(--kaline-muted)]">sistema estável</p>
            )}
          </DataCard>
          <DataCard title="Último evento" eyebrow="logs" status="idle">
            {logs.state.status === "ok" && logs.state.data.items[0] ? (
              <Row
                k={new Date(logs.state.data.items[0].timestamp).toLocaleTimeString()}
                v={logs.state.data.items[0].message}
              />
            ) : (
              <p className="text-sm text-[color:var(--kaline-faint)]">não disponível</p>
            )}
          </DataCard>
        </div>
      </section>
    </div>
  );
}
