import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { hestiaApi, formatBytes } from "@/lib/hestia/api";
import type { OrganizerPlan, OrganizerRunManifest } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import {
  DataCard,
  Row,
  UnavailableNote,
  type CardStatus,
} from "@/components/hestia/UnavailableNote";

function statusOf(s: { status: string }): CardStatus {
  if (s.status === "loading") return "loading";
  if (s.status === "unavailable") return "error";
  return "ok";
}

export const Route = createFileRoute("/_station/storage")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Storage" },
      {
        name: "description",
        content:
          "Modelo /KALINE, fontes externas, e o organizer (plano + aplicação local aprovada).",
      },
      { property: "og:title", content: "Héstia Console — Storage" },
      {
        property: "og:description",
        content:
          "Nada é apagado. Nada é sobrescrito. O plano só é aplicado com aprovação explícita.",
      },
    ],
  }),
  component: StoragePage,
});

export function StoragePage() {
  const model = useApi(hestiaApi.storageModel);
  const scan = useApi(hestiaApi.storageScan);
  const services = useApi(hestiaApi.services);
  const runs = useApi(hestiaApi.organizerRuns);

  const [plan, setPlan] = useState<OrganizerPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [applyResult, setApplyResult] = useState<OrganizerRunManifest | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [undoingRunId, setUndoingRunId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const [redoingRunId, setRedoingRunId] = useState<string | null>(null);
  const [redoError, setRedoError] = useState<string | null>(null);

  async function handleGeneratePlan() {
    setPlanLoading(true);
    setPlanError(null);
    setApplyResult(null);
    setApplyError(null);
    const result = await hestiaApi.organizerPlan();
    setPlanLoading(false);
    if (result.status === "ok") {
      setPlan(result.data);
    } else if (result.status === "unavailable") {
      setPlanError(result.message);
    }
  }

  async function handleApplyPlan() {
    if (!plan) return;
    setApplying(true);
    setApplyError(null);
    const result = await hestiaApi.organizerApply(plan.planId);
    setApplying(false);
    if (result.status === "ok") {
      setApplyResult(result.data);
      setPlan(null);
      runs.retry();
    } else if (result.status === "unavailable") {
      setApplyError(result.message);
    }
  }

  async function handleUndo(runId: string) {
    setUndoingRunId(runId);
    setUndoError(null);
    const result = await hestiaApi.organizerUndo(runId);
    setUndoingRunId(null);
    if (result.status === "ok") {
      runs.retry();
    } else if (result.status === "unavailable") {
      setUndoError(result.message);
    }
  }

  async function handleRedo(undoRunId: string) {
    setRedoingRunId(undoRunId);
    setRedoError(null);
    const result = await hestiaApi.organizerRedo(undoRunId);
    setRedoingRunId(null);
    if (result.status === "ok") {
      runs.retry();
    } else if (result.status === "unavailable") {
      setRedoError(result.message);
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="kaline-eyebrow">/storage</p>
        <h1 className="kaline-serif text-3xl md:text-4xl text-[color:var(--kaline-text)]">
          Storage e Organizer
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--kaline-muted)] max-w-2xl">
          Nada é apagado. Nada é sobrescrito. O plano é aplicado somente localmente, e só com
          aprovação explícita nesta tela. Samba, Jellyfin, Syncthing e Tailscale já existem e não
          são configurados pela Héstia.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <DataCard
          eyebrow="Modelo"
          title="Árvore canônica /KALINE"
          status={statusOf(model.state)}
          summary={model.state.status === "ok" ? model.state.data.root : undefined}
        >
          {model.state.status === "loading" && <p>consultando…</p>}
          {model.state.status === "unavailable" && (
            <UnavailableNote
              message={model.state.message}
              details={model.state.details}
              onRetry={model.retry}
              refreshing={model.refreshing}
            />
          )}
          {model.state.status === "ok" &&
            model.state.data.folders.map((f) => (
              <div
                key={f.id}
                className="border-b border-[color:var(--kaline-border-copper)]/40 pb-2 last:border-0"
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-mono text-[13px] text-[color:var(--kaline-text)]">
                    {f.relativePath}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)]">
                    {f.category}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--kaline-faint)]">{f.purpose}</div>
              </div>
            ))}
        </DataCard>

        <DataCard
          eyebrow="Serviços"
          title="Vínculos já existentes"
          status={statusOf(services.state)}
        >
          {services.state.status === "loading" && <p>consultando…</p>}
          {services.state.status === "unavailable" && (
            <UnavailableNote
              message={services.state.message}
              details={services.state.details}
              onRetry={services.retry}
              refreshing={services.refreshing}
            />
          )}
          {services.state.status === "ok" &&
            services.state.data.items.map((s) => <Row key={s.name} k={s.name} v={s.status} />)}
        </DataCard>

        <DataCard
          eyebrow="Scan"
          title="Resumo de /KALINE e fontes externas"
          status={statusOf(scan.state)}
        >
          {scan.state.status === "loading" && <p>consultando…</p>}
          {scan.state.status === "unavailable" && (
            <UnavailableNote
              message={scan.state.message}
              details={scan.state.details}
              onRetry={scan.retry}
              refreshing={scan.refreshing}
            />
          )}
          {scan.state.status === "ok" && (
            <>
              {scan.state.data.kaline.folders
                .filter((f) => f.exists && f.files > 0)
                .map((f) => (
                  <Row
                    key={f.id}
                    k={f.relativePath ?? f.id}
                    v={`${f.files} arquivos · ${formatBytes(f.bytes)}`}
                  />
                ))}
              {scan.state.data.sources.items.map((s) => (
                <Row key={s.id} k={s.label} v={`${s.files} arquivos · ${formatBytes(s.bytes)}`} />
              ))}
            </>
          )}
        </DataCard>

        <DataCard eyebrow="Organizer" title="Plano de organização" status="idle" defaultOpen>
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={planLoading}
            className="text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 transition disabled:opacity-50"
          >
            {planLoading ? "gerando…" : "Gerar plano"}
          </button>

          {planError && (
            <p className="mt-2 text-[12px] text-[color:var(--kaline-ember)]">{planError}</p>
          )}

          {plan && (
            <div className="mt-3 space-y-2">
              <p className="text-[12px] text-[color:var(--kaline-faint)]">
                {plan.summary.total} itens · {plan.summary.planned} planejados ·{" "}
                {plan.summary.conflicts} conflitos
              </p>
              {plan.items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-[color:var(--kaline-border-copper)]/40 pb-2 last:border-0"
                >
                  <div className="font-mono text-[12px] text-[color:var(--kaline-text)] break-all">
                    {item.sourcePath} → {item.targetPath}
                  </div>
                  <div className="text-[11px] text-[color:var(--kaline-faint)]">
                    {item.action} · {item.reason} · {item.status}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={applying || plan.items.length === 0}
                className="mt-2 text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-copper)] text-[color:var(--kaline-copper)] bg-[color:var(--kaline-copper)]/10 hover:bg-[color:var(--kaline-copper)]/20 transition disabled:opacity-50"
              >
                {applying ? "aplicando…" : "Aplicar plano localmente"}
              </button>
            </div>
          )}

          {applyError && (
            <p className="mt-2 text-[12px] text-[color:var(--kaline-ember)]">{applyError}</p>
          )}

          {applyResult && (
            <div className="mt-3 text-[12px]">
              <p className="text-[color:var(--kaline-faint)]">
                {applyResult.status} · {applyResult.summary.ok} ok · {applyResult.summary.failed}{" "}
                falhas · {applyResult.summary.skipped} pulados
              </p>
            </div>
          )}
        </DataCard>

        <DataCard
          eyebrow="Organizer"
          title="Execuções anteriores"
          status={statusOf(runs.state)}
          defaultOpen
        >
          {runs.state.status === "loading" && <p>consultando…</p>}
          {runs.state.status === "unavailable" && (
            <UnavailableNote
              message={runs.state.message}
              details={runs.state.details}
              onRetry={runs.retry}
              refreshing={runs.refreshing}
            />
          )}
          {runs.state.status === "ok" && runs.state.data.items.length === 0 && (
            <p className="text-[color:var(--kaline-faint)] text-[13px]">Nenhuma execução ainda.</p>
          )}
          {runs.state.status === "ok" &&
            runs.state.data.items.map((run) => {
              const isOriginal = !run.undoOf && !run.redoOf;
              const isUndo = !!run.undoOf;
              const isRedo = !!run.redoOf;
              const canUndo = isOriginal && !run.undoneBy;
              const canRedo = isUndo && !run.redoneBy;
              return (
                <div
                  key={run.runId}
                  className="flex items-center justify-between gap-2 border-b border-[color:var(--kaline-border-copper)]/40 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[12px] text-[color:var(--kaline-text)] break-all">
                      {run.runId}
                    </span>
                    {isUndo && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--kaline-faint)]">
                        desfaz {run.undoOf}
                      </span>
                    )}
                    {isRedo && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--kaline-faint)]">
                        refaz {run.redoOf}
                      </span>
                    )}
                    {isOriginal && run.undoneBy && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--kaline-faint)]">
                        já desfeita
                      </span>
                    )}
                    {isUndo && run.redoneBy && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--kaline-faint)]">
                        já refeita
                      </span>
                    )}
                  </div>
                  {canUndo && (
                    <button
                      type="button"
                      onClick={() => handleUndo(run.runId)}
                      disabled={undoingRunId === run.runId}
                      className="text-[11px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-copper)] transition disabled:opacity-50 shrink-0"
                    >
                      {undoingRunId === run.runId ? "desfazendo…" : "Desfazer"}
                    </button>
                  )}
                  {canRedo && (
                    <button
                      type="button"
                      onClick={() => handleRedo(run.runId)}
                      disabled={redoingRunId === run.runId}
                      className="text-[11px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-copper)] transition disabled:opacity-50 shrink-0"
                    >
                      {redoingRunId === run.runId ? "refazendo…" : "Refazer"}
                    </button>
                  )}
                </div>
              );
            })}
          {undoError && (
            <p className="mt-2 text-[12px] text-[color:var(--kaline-ember)]">{undoError}</p>
          )}
          {redoError && (
            <p className="mt-2 text-[12px] text-[color:var(--kaline-ember)]">{redoError}</p>
          )}
        </DataCard>
      </section>
    </div>
  );
}
