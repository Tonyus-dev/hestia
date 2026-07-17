import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, FolderSearch, RefreshCw } from "lucide-react";

import { hestiaApi, type ApiState, type OrganizerPlan } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_station/organizador")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Organizador" },
      { name: "description", content: "Plano dry-run real do Organizer na Station desktop." },
    ],
  }),
  component: OrganizerPage,
});

function OrganizerPage() {
  const desktop = useApi(() => hestiaApi.stationConnection("desktop"));
  const runs = useApi(hestiaApi.desktopOrganizerRuns);
  const [planState, setPlanState] = useState<ApiState<OrganizerPlan>>({ status: "idle" });

  const disabled =
    (runs.state.status === "unavailable" && runs.state.details.code === "ORGANIZER_DISABLED") ||
    (planState.status === "unavailable" && planState.details.code === "ORGANIZER_DISABLED");

  async function generatePlan() {
    setPlanState({ status: "loading" });
    setPlanState(await hestiaApi.desktopOrganizerPlan());
  }

  const stationAvailable =
    desktop.state.status === "ok" && desktop.state.data.state === "available";

  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">/organizador</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)] md:text-4xl">
          Organizador do servidor
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--kaline-muted)]">
          O plano é calculado pela Station desktop sobre o armazenamento principal.
        </p>
      </header>

      <div className="rounded-xl border border-[color:var(--kaline-amber)]/50 bg-[color:var(--kaline-amber)]/5 p-4">
        <p className="font-medium text-[color:var(--kaline-amber)]">
          Nenhum arquivo será alterado neste modo.
        </p>
        <p className="mt-1 text-xs text-[color:var(--kaline-muted)]">
          A Console oferece apenas geração de plano dry-run e histórico. Apply, undo e redo não
          estão disponíveis nesta interface.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
          <p className="kaline-eyebrow">Station desktop</p>
          <p className="mt-3 text-sm text-[color:var(--kaline-text)]">
            {desktop.state.status === "loading"
              ? "Consultando…"
              : stationAvailable
                ? "Disponível"
                : desktop.state.status === "ok"
                  ? "Indisponível"
                  : "Não foi possível consultar"}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
          <p className="kaline-eyebrow">Organizer</p>
          <p className="mt-3 text-sm text-[color:var(--kaline-text)]">
            {disabled
              ? "Desativado no servidor"
              : runs.state.status === "ok"
                ? "Ativo em modo dry-run"
                : runs.state.status === "loading"
                  ? "Consultando…"
                  : "Indisponível"}
          </p>
          {disabled && (
            <p className="mt-2 text-xs text-[color:var(--kaline-muted)]">
              Após o merge, defina HESTIA_STATION_ORGANIZER_ENABLED=1 somente na Station desktop,
              reinicie hestia-station-agent e execute o Station Doctor.
            </p>
          )}
        </div>
      </section>

      {!disabled && (
        <section className="space-y-4">
          <button
            type="button"
            onClick={generatePlan}
            disabled={!stationAvailable || planState.status === "loading"}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--kaline-copper)] disabled:opacity-40"
          >
            <FolderSearch className="h-4 w-4" />
            Gerar plano
          </button>

          {planState.status === "loading" && (
            <p className="inline-flex items-center gap-2 text-sm text-[color:var(--kaline-muted)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Gerando plano real…
            </p>
          )}
          {planState.status === "unavailable" && (
            <UnavailableNote message={planState.message} details={planState.details} />
          )}
          {planState.status === "ok" && (
            <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
              <div className="flex flex-wrap gap-5 text-sm text-[color:var(--kaline-text)]">
                <span>Ações propostas: {planState.data.plan.summary.planned}</span>
                <span>Conflitos: {planState.data.plan.summary.conflicts}</span>
                <span>Ignorados: {planState.data.plan.summary.ignored}</span>
              </div>
              {(planState.data.plan.summary.conflicts > 0 ||
                planState.data.plan.requiresExtraConfirmation) && (
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-[color:var(--kaline-amber)]">
                  <AlertTriangle className="h-4 w-4" /> O plano contém avisos e continuará sem ser
                  aplicado.
                </p>
              )}
              {planState.data.plan.items.length === 0 ? (
                <p className="mt-4 text-sm text-[color:var(--kaline-muted)]">
                  Nenhuma ação proposta.
                </p>
              ) : (
                <ul className="mt-4 space-y-2 text-xs text-[color:var(--kaline-muted)]">
                  {planState.data.plan.items.slice(0, 20).map((item) => (
                    <li key={item.id} className="rounded border border-white/5 p-2 font-mono">
                      {item.source.relativePath} → {item.target.relativePath} · {item.status}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {runs.state.status === "unavailable" && !disabled && (
        <UnavailableNote
          message={runs.state.message}
          details={runs.state.details}
          onRetry={runs.retry}
          refreshing={runs.refreshing}
        />
      )}
      {runs.state.status === "ok" && (
        <section className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
          <p className="kaline-eyebrow">Histórico de runs ({runs.state.data.items.length})</p>
          {runs.state.data.items.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--kaline-muted)]">Nenhum run registrado.</p>
          ) : (
            <ul className="mt-3 space-y-2 font-mono text-xs text-[color:var(--kaline-muted)]">
              {runs.state.data.items.map((run) => (
                <li key={run.runId}>
                  {run.runId} · {run.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
