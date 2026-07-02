import { createFileRoute } from "@tanstack/react-router";
import { hestiaApi, formatBytes, formatUptime } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { HESTIA } from "@/content/kaline";
import { DataCard, Row, UnavailableNote } from "@/components/hestia/UnavailableNote";

export const Route = createFileRoute("/_station/")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Painel" },
      {
        name: "description",
        content:
          "Painel principal da Héstia. Leituras reais da Chama Local: saúde, servidor, armazenamento, serviços.",
      },
      { property: "og:title", content: "Héstia Console — Painel" },
      {
        property: "og:description",
        content: "Console local somente leitura da Héstia com a Chama Local embutida.",
      },
    ],
  }),
  component: Painel,
});

function Painel() {
  const health = useApi(hestiaApi.health);
  const server = useApi(hestiaApi.server);
  const storage = useApi(hestiaApi.storage);
  const services = useApi(hestiaApi.services);


  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="kaline-eyebrow text-[color:var(--kaline-copper)]">{HESTIA.subtitle}</p>
        <h1 className="kaline-serif text-4xl md:text-5xl text-[color:var(--kaline-text)] leading-tight">
          {HESTIA.appName}
        </h1>
        <p className="max-w-2xl text-[color:var(--kaline-muted)] text-[15px] leading-relaxed">
          {HESTIA.motto}
        </p>
        <div className="rounded-lg border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-glass)] p-3 text-[12px] text-[color:var(--kaline-muted)] max-w-2xl">
          {HESTIA.readonly}
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <DataCard eyebrow="1 · Saúde" title="Saúde da Héstia">
          {health.state.status === "loading" && <p>consultando…</p>}
          {health.state.status === "unavailable" && <UnavailableNote message={health.state.message} details={health.state.details} onRetry={health.retry} refreshing={health.refreshing} />}
          {health.state.status === "ok" && (
            <>
              <Row k="status" v={health.state.data.ok ? "ok" : "degradado"} />
              <Row k="app" v={health.state.data.appName} />
              <Row k="versão" v={health.state.data.version} />
              <Row k="hostname" v={health.state.data.hostname} />
              <Row k="uptime" v={formatUptime(health.state.data.processUptime)} />
              <Row k="chama" v={health.state.data.agentName} />
              <Row k="readonly" v={String(health.state.data.readonly)} />
              <Row k="timestamp" v={new Date(health.state.data.timestamp).toLocaleString()} />
            </>
          )}
        </DataCard>

        <DataCard eyebrow="2 · Servidor" title="Sistema operacional">
          {server.state.status === "loading" && <p>consultando…</p>}
          {server.state.status === "unavailable" && <UnavailableNote message={server.state.message} details={server.state.details} onRetry={server.retry} refreshing={server.refreshing} />}
          {server.state.status === "ok" && (
            <>
              <Row k="hostname" v={server.state.data.hostname} />
              <Row k="platform" v={server.state.data.platform} />
              <Row k="release" v={server.state.data.release} />
              <Row k="arch" v={server.state.data.arch} />
              <Row k="uptime" v={formatUptime(server.state.data.uptime)} />
              <Row k="memória total" v={formatBytes(server.state.data.totalMemory)} />
              <Row k="memória livre" v={formatBytes(server.state.data.freeMemory)} />
              <Row k="load avg" v={server.state.data.loadAverage.map((n) => n.toFixed(2)).join(" · ")} />
            </>
          )}
        </DataCard>

        <DataCard eyebrow="3 · Armazenamento" title="Discos observados">
          {storage.state.status === "loading" && <p>consultando…</p>}
          {storage.state.status === "unavailable" && <UnavailableNote message={storage.state.message} details={storage.state.details} onRetry={storage.retry} refreshing={storage.refreshing} />}
          {storage.state.status === "ok" &&
            storage.state.data.items.map((it) => (
              <div key={it.path} className="border-b border-[color:var(--kaline-border-copper)]/40 pb-2 last:border-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-mono text-[13px] text-[color:var(--kaline-text)]">{it.path}</span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)]">
                    {it.status}
                  </span>
                </div>
                {it.exists ? (
                  <div className="mt-1 text-[12px] font-mono text-[color:var(--kaline-muted)]">
                    {formatBytes(it.used)} / {formatBytes(it.total)}
                    {it.percentUsed != null && <> · {it.percentUsed}%</>}
                  </div>
                ) : (
                  <div className="mt-1 text-[12px] text-[color:var(--kaline-faint)]">
                    {it.error ?? `${it.path} ainda não encontrada`}
                  </div>
                )}
              </div>
            ))}
        </DataCard>

        <DataCard eyebrow="4 · Serviços" title="Systemd">
          {services.state.status === "loading" && <p>consultando…</p>}
          {services.state.status === "unavailable" && <UnavailableNote message={services.state.message} details={services.state.details} onRetry={services.retry} refreshing={services.refreshing} />}
          {services.state.status === "ok" &&
            services.state.data.items.map((s) => (
              <Row
                key={s.name}
                k={s.name}
                v={
                  <span
                    className={
                      s.status === "active"
                        ? "text-[color:var(--kaline-amber)]"
                        : "text-[color:var(--kaline-faint)]"
                    }
                  >
                    {s.status}
                  </span>
                }
              />
            ))}
        </DataCard>

        <DataCard eyebrow="5 · Rede local" title="Acesso">
          <Row k="host padrão" v={HESTIA.defaultHost} />
          <Row k="porta padrão" v={HESTIA.defaultPort} />
          <Row k="modo" v="local-readonly" />
          <p className="text-[11.5px] text-[color:var(--kaline-faint)] mt-2">
            Acesso local apenas. LAN desabilitada por padrão.
          </p>
        </DataCard>

        <DataCard eyebrow="6 · Segurança" title="Garantias da v0">
          <ul className="text-[12.5px] font-mono text-[color:var(--kaline-muted)] space-y-1">
            <li>· somente leitura</li>
            <li>· sem upload</li>
            <li>· sem delete</li>
            <li>· sem shell</li>
            <li>· sem reiniciar serviço</li>
            <li>· sem comandos arbitrários</li>
          </ul>
        </DataCard>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-glass)] p-5">
          <p className="kaline-eyebrow">Hardware previsto</p>
          <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-[12.5px] text-[color:var(--kaline-muted)]">
            {HESTIA.hardware.map((h) => (
              <li key={h}>· {h}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-glass)] p-5">
          <p className="kaline-eyebrow">Funções futuras</p>
          <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-[12.5px] text-[color:var(--kaline-muted)]">
            {HESTIA.futureFunctions.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
