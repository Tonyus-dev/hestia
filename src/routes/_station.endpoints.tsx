import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HESTIA } from "@/content/kaline";
import { hestiaApi } from "@/lib/hestia/api";

type Ping = { status: number | "erro"; ok: boolean };

export const Route = createFileRoute("/_station/endpoints")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Endpoints" },
      { name: "description", content: "Contratos /api expostos pela Chama Local." },
      { property: "og:title", content: "Héstia Console — Endpoints" },
      { property: "og:description", content: "Endpoints somente leitura da Chama Local." },
    ],
  }),
  component: EndpointsPage,
});

function EndpointsPage() {
  const [pings, setPings] = useState<Record<string, Ping | undefined>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    HESTIA.endpoints.forEach(async (e) => {
      const p = await hestiaApi.ping(e.path);
      if (!alive) return;
      setPings((prev) => ({ ...prev, [e.path]: p }));
    });
    return () => {
      alive = false;
    };
  }, []);

  const copyCurl = async (path: string) => {
    const cmd = `curl -s ${hestiaApi.absoluteUrl(path)} | jq`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(path);
      setTimeout(() => setCopied((c) => (c === path ? null : c)), 1500);
    } catch {
      /* clipboard bloqueado — ignora */
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">/endpoints</p>
        <h1 className="kaline-serif text-3xl md:text-4xl text-[color:var(--kaline-text)]">
          Contratos da Chama
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--kaline-muted)] max-w-2xl">
          Todos os endpoints são <code>GET</code> e somente leitura. Nenhum aceita comando
          arbitrário.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {HESTIA.endpoints.map((e) => {
          const p = pings[e.path];
          return (
            <div
              key={e.path}
              className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={hestiaApi.absoluteUrl(e.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[13.5px] text-[color:var(--kaline-text)] hover:text-[color:var(--kaline-copper)] break-all"
                >
                  GET {e.path}
                </a>
                <span
                  className={
                    "text-[10px] uppercase tracking-[0.22em] " +
                    (p == null
                      ? "text-[color:var(--kaline-faint)]"
                      : p.ok
                        ? "text-[color:var(--kaline-amber)]"
                        : "text-[color:var(--kaline-ember)]")
                  }
                >
                  {p == null ? "consultando" : p.ok ? `ok ${p.status}` : "offline"}
                </span>
              </div>
              <p className="text-[12.5px] text-[color:var(--kaline-muted)]">{e.purpose}</p>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--kaline-faint)] mb-1">
                  campos esperados
                </p>
                <div className="flex flex-wrap gap-1">
                  {e.fields.map((f) => (
                    <span
                      key={f}
                      className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-[color:var(--kaline-border-copper)]/60 text-[color:var(--kaline-muted)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <code className="text-[11px] text-[color:var(--kaline-faint)] truncate">
                  curl {hestiaApi.absoluteUrl(e.path)}
                </code>
                <button
                  type="button"
                  onClick={() => copyCurl(e.path)}
                  className="text-[10px] uppercase tracking-[0.22em] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 transition"
                >
                  {copied === e.path ? "copiado" : "copiar curl"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
