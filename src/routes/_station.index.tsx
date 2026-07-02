import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hestiaApi, formatBytes, formatUptime, type ApiState } from "@/lib/hestia/api";
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

function useApi<T>(fn: () => Promise<ApiState<T>>): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fn().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

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
          {health.status === "loading" && <p>consultando…</p>}
          {health.status === "unavailable" && <UnavailableNote message={health.message} details={health.details} />}
          {health.status === "ok" && (
            <>
              <Row k="status" v={health.data.ok ? "ok" : "degradado"} />
              <Row k="app" v={health.data.appName} />
              <Row k="versão" v={health.data.version} />
              <Row k="hostname" v={health.data.hostname} />
              <Row k="uptime" v={formatUptime(health.data.processUptime)} />
              <Row k="chama" v={health.data.agentName} />
              <Row k="readonly" v={String(health.data.readonly)} />
              <Row k="timestamp" v={new Date(health.data.timestamp).toLocaleString()} />
            </>
          )}
        </DataCard>

        <DataCard eyebrow="2 · Servidor" title="Sistema operacional">
          {server.status === "loading" && <p>consultando…</p>}
          {server.status === "unavailable" && <UnavailableNote message={server.message} details={server.details} />}
          {server.status === "ok" && (
            <>
              <Row k="hostname" v={server.data.hostname} />
              <Row k="platform" v={server.data.platform} />
              <Row k="release" v={server.data.release} />
              <Row k="arch" v={server.data.arch} />
              <Row k="uptime" v={formatUptime(server.data.uptime)} />
              <Row k="memória total" v={formatBytes(server.data.totalMemory)} />
              <Row k="memória livre" v={formatBytes(server.data.freeMemory)} />
              <Row k="load avg" v={server.data.loadAverage.map((n) => n.toFixed(2)).join(" · ")} />
            </>
          )}
        </DataCard>

        <DataCard eyebrow="3 · Armazenamento" title="Discos observados">
          {storage.status === "loading" && <p>consultando…</p>}
          {storage.status === "unavailable" && <UnavailableNote message={storage.message} details={storage.details} />}
          {storage.status === "ok" &&
            storage.data.items.map((it) => (
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
          {services.status === "loading" && <p>consultando…</p>}
          {services.status === "unavailable" && <UnavailableNote message={services.message} details={services.details} />}
          {services.status === "ok" &&
            services.data.items.map((s) => (
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
