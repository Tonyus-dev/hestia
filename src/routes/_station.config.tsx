import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hestiaApi, type ApiState, type Config } from "@/lib/hestia/api";
import { HESTIA } from "@/content/kaline";
import { UnavailableNote, Row } from "@/components/hestia/UnavailableNote";

export const Route = createFileRoute("/_station/config")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Configuração" },
      { name: "description", content: "Configuração somente leitura da Chama Local." },
      { property: "og:title", content: "Héstia Console — Configuração" },
      { property: "og:description", content: "Host, porta, modo e paths observados pela Chama." },
    ],
  }),
  component: ConfigPage,
});

const expected = {
  host: HESTIA.defaultHost,
  port: HESTIA.defaultPort,
  mode: "local-readonly",
  readonly: true,
  agentName: HESTIA.agentName,
};

function ConfigPage() {
  const [state, setState] = useState<ApiState<Config>>({ status: "loading" });
  useEffect(() => {
    hestiaApi.config().then(setState);
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">/config</p>
        <h1 className="kaline-serif text-3xl md:text-4xl text-[color:var(--kaline-text)]">
          Configuração da Chama
        </h1>
      </header>

      {state.status === "loading" && <p className="text-[color:var(--kaline-muted)]">consultando…</p>}

      {state.status === "unavailable" && (
        <>
          <UnavailableNote message={state.message} />
          <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
            <p className="kaline-eyebrow">Configuração esperada (não confirmada)</p>
            <div className="mt-3 flex flex-col gap-2">
              <Row k="host" v={expected.host} />
              <Row k="port" v={expected.port} />
              <Row k="mode" v={expected.mode} />
              <Row k="readonly" v={String(expected.readonly)} />
              <Row k="agentName" v={expected.agentName} />
            </div>
          </div>
        </>
      )}

      {state.status === "ok" && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col gap-2">
            <p className="kaline-eyebrow">Núcleo</p>
            <Row k="appName" v={state.data.appName} />
            <Row k="serverName" v={state.data.serverName} />
            <Row k="agentName" v={state.data.agentName} />
            <Row k="version" v={state.data.version} />
            <Row k="host" v={state.data.host} />
            <Row k="port" v={state.data.port} />
            <Row k="mode" v={state.data.mode} />
            <Row k="readonly" v={String(state.data.readonly)} />
            <Row k="lanEnabled" v={String(state.data.lanEnabled)} />
          </div>
          <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col gap-3">
            <div>
              <p className="kaline-eyebrow">storagePaths</p>
              <ul className="mt-2 font-mono text-[13px] text-[color:var(--kaline-muted)]">
                {state.data.storagePaths.map((p) => (
                  <li key={p}>· {p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="kaline-eyebrow">services</p>
              <ul className="mt-2 font-mono text-[13px] text-[color:var(--kaline-muted)]">
                {state.data.services.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
