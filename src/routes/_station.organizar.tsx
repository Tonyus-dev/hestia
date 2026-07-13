import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { hestiaApi } from "@/lib/hestia/api";
import type { OrganizerPlan, OrganizerRunManifest } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { DataCard, type CardStatus } from "@/components/hestia/shared/DataCard";

function statusOf(s: { status: string }): CardStatus {
  if (s.status === "loading") return "loading";
  if (s.status === "unavailable") return "error";
  return "ok";
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_station/organizar")({
  head: () => ({
    meta: [
      { title: "Héstia Station — Organizar" },
      { name: "description", content: "Planos aprovados, apply, undo, redo e runs anteriores." },
      { property: "og:title", content: "Héstia Station — Organizar" },
      {
        property: "og:description",
        content: "Ações locais em modo protegido, sempre por plano aprovado.",
      },
    ],
  }),
  component: OrganizarPage,
});

export function OrganizarPage() {
  const runs = useApi(hestiaApi.organizerRuns);

  const [plan, setPlan] = useState<OrganizerPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [applyResult, setApplyResult] = useState<OrganizerRunManifest | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [largeConfirm, setLargeConfirm] = useState("");

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
    const result = await hestiaApi.organizerApply(plan.planId, (plan.summary.planned ?? 0) > 5000);
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
        <p className="kaline-eyebrow">/organizar</p>
        <h1 className="kaline-serif text-3xl md:text-4xl text-[color:var(--kaline-text)]">
          Organizar por plano aprovado
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--kaline-muted)] max-w-2xl">
          Modo protegido: gerar plano é dry-run. Nenhum arquivo é alterado até você clicar em
          Aplicar.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
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
                {plan.summary.total} total · {plan.summary.planned} planejados ·{" "}
                {plan.summary.conflicts} conflitos · {plan.summary.ignored ?? 0} ignorados ·{" "}
                {plan.summary.quarantined ?? 0} quarentena
              </p>
              <p className="text-[12px] text-[color:var(--kaline-muted)]">
                Gerar plano apenas simula a organização. Nenhum arquivo será movido, copiado,
                apagado ou renomeado até você clicar em Aplicar.
              </p>
              {plan.summary.byExtension && (
                <p className="text-[11px] text-[color:var(--kaline-faint)]">
                  Extensões:{" "}
                  {Object.entries(plan.summary.byExtension)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ") || "—"}
                </p>
              )}
              {plan.summary.byTargetArea && (
                <p className="text-[11px] text-[color:var(--kaline-faint)]">
                  Destinos:{" "}
                  {Object.entries(plan.summary.byTargetArea)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ") || "—"}
                </p>
              )}
              {plan.summary.rules && (
                <details className="text-[11px] text-[color:var(--kaline-faint)] mt-2 mb-2 border border-[color:var(--kaline-border-copper)]/40 p-2 rounded">
                  <summary className="cursor-pointer text-[color:var(--kaline-copper)] hover:opacity-80">
                    Regras de organização aplicadas
                  </summary>
                  <ul className="mt-2 space-y-1 ml-4 list-disc">
                    {plan.summary.rules.extensionRules.map((r, i) => (
                      <li key={i}>
                        <span className="font-mono text-[color:var(--kaline-text)]">
                          {r.extensions.join(", ")}
                        </span>
                        {" → "}
                        {r.relativePath}
                      </li>
                    ))}
                    <li className="text-[color:var(--kaline-muted)]">
                      <em>Outros (desconhecidos)</em> → {plan.summary.rules.fallback}
                    </li>
                  </ul>
                </details>
              )}
              {plan.items.length > 100 && (
                <p className="text-[11px] text-[color:var(--kaline-amber)]">
                  exibindo os primeiros 100 de {plan.items.length} itens
                </p>
              )}
              {(plan.summary.planned ?? 0) > 1000 && (
                <label className="block text-[11px] text-[color:var(--kaline-muted)]">
                  Confirmação extra: digite exatamente “Estou ciente que este plano afetará{" "}
                  {plan.summary.planned} arquivos.”
                  <input
                    value={largeConfirm}
                    onChange={(event) => setLargeConfirm(event.target.value)}
                    className="mt-1 w-full rounded border border-[color:var(--kaline-border-copper)] bg-transparent px-2 py-1 font-mono text-[11px]"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => downloadJson(`hestia-plan-${plan.planId}.json`, plan)}
                className="text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 transition"
              >
                Baixar JSON do plano
              </button>
              {plan.items.slice(0, 100).map((item) => (
                <div
                  key={item.id}
                  className="border-b border-[color:var(--kaline-border-copper)]/40 pb-2 last:border-0"
                >
                  <div className="font-mono text-[12px] text-[color:var(--kaline-text)] break-all">
                    {item.sourcePath} → {item.targetPath}
                  </div>
                  <div className="text-[11px] text-[color:var(--kaline-faint)]">
                    {item.action} · {item.reason} · {item.status}
                    {item.sourceKind ? ` · ${item.sourceKind}` : ""}
                    {item.sourceLabel ? `/${item.sourceLabel}` : ""}
                    {item.mtimeIso ? ` · ${item.mtimeIso}` : ""}
                    {item.ignoredReason ? ` · ${item.ignoredReason}` : ""}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={
                  applying ||
                  plan.items.length === 0 ||
                  ((plan.summary.planned ?? 0) > 1000 &&
                    largeConfirm !==
                      `Estou ciente que este plano afetará ${plan.summary.planned} arquivos.`)
                }
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
                falhas · {applyResult.summary.skipped} pulados · manifest: dataDir/organizer/runs/
                {applyResult.runId}.json
              </p>
              <button
                type="button"
                onClick={() => downloadJson(`hestia-run-${applyResult.runId}.json`, applyResult)}
                className="mt-2 text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 transition"
              >
                Baixar JSON da execução
              </button>
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
