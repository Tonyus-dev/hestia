import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { hestiaApi, hestiaLegacyApi } from "@/lib/hestia/api";
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
      { title: "Héstia Console — Organizar" },
      { name: "description", content: "Planos aprovados, apply, undo, redo e runs anteriores." },
      { property: "og:title", content: "Héstia Console — Organizar" },
      {
        property: "og:description",
        content: "Ações remotas na Estação, em modo protegido e sempre por plano aprovado.",
      },
    ],
  }),
  component: OrganizarPage,
});

const FILTERS = [
  { label: "Todos os arquivos", value: "" },
  {
    label: "Livros & Códice (.pdf, .epub, .mobi, .azw3, .cbz, .cbr, .md, .txt)",
    value: ".pdf,.epub,.mobi,.azw3,.cbz,.cbr,.md,.txt",
  },
  {
    label: "Apenas Documentos (.doc, .docx, .xls, .xlsx, .ppt, .pptx, .odt, .ods, .odp, .csv)",
    value: ".doc,.docx,.odt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp",
  },
  {
    label: "Apenas Mídia (.mp4, .mkv, .avi, .mov, .mp3, .flac, .wav, .jpg, .png, .webp, .heic)",
    value:
      ".mp4,.mkv,.avi,.mov,.webm,.mp3,.flac,.wav,.m4a,.jpg,.jpeg,.png,.webp,.heic,.raw,.cr2,.nef,.arw,.dng",
  },
  {
    label: "Design & 3D (.svg, .psd, .fig, .ttf, .blend, .obj, .stl)",
    value: ".svg,.ai,.eps,.psd,.fig,.ttf,.otf,.obj,.stl,.blend",
  },
  {
    label: "Compactados / Bancos de Dados (.zip, .rar, .7z, .sqlite, .db, .sql)",
    value: ".zip,.rar,.7z,.tar,.gz,.sqlite,.db,.sql",
  },
];

export function OrganizarPage() {
  const station = useApi(hestiaApi.stationConnection);
  const stationAvailable =
    station.state.status === "ok" && station.state.data.state === "available";
  const runs = useApi(hestiaApi.stationOrganizerRuns);
  const stationRefreshing = station.refreshing || runs.refreshing;
  const retryStation = () => {
    station.retry();
    runs.retry();
  };

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

  const [selectedFilter, setSelectedFilter] = useState("");

  // LLM Assistant states
  const [assistantModel, setAssistantModel] = useState("qwen3.5-0.8b");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  async function askAssistant(promptText: string) {
    if (!plan || assistantLoading) return;
    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantMessages((prev) => [...prev, { role: "user", content: promptText }]);

    const contextBlock = `ID do Plano: ${plan.planId}
Total Planejado: ${plan.planned} arquivos
Conflitos detectados: ${plan.summary.conflicts}
Ignorados: ${plan.summary.ignored}
Extensões: ${JSON.stringify(plan.summary.byExtension)}
Destinos: ${JSON.stringify(plan.summary.byTargetArea)}
Amostra de arquivos do plano (primeiros 20):
${plan.items
  .slice(0, 20)
  .map(
    (i) =>
      `${i.source.label}: ${i.source.relativePath} -> ${i.target.relativePath} (${i.status} - ${i.reason})`,
  )
  .join("\n")}`;

    const result = await hestiaLegacyApi.llmChat(promptText, assistantModel, contextBlock);
    setAssistantLoading(false);
    if (result.status === "ok" && result.data.ok) {
      setAssistantMessages((prev) => [...prev, { role: "assistant", content: result.data.text }]);
    } else {
      setAssistantError(
        result.status === "unavailable" ? result.message : "Erro ao consultar o assistente.",
      );
    }
  }

  async function handleGeneratePlan() {
    setPlan(null);
    setLargeConfirm("");
    setPlanLoading(true);
    setPlanError(null);
    setApplyResult(null);
    setApplyError(null);
    setAssistantMessages([]);
    const result = await hestiaApi.stationOrganizerPlan(selectedFilter || undefined);
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
    const result = await hestiaApi.stationOrganizerApply(
      plan.planId,
      !!plan.requiresExtraConfirmation,
    );
    setApplying(false);
    if (result.status === "ok") {
      setApplyResult(result.data);
      setPlan(null);
      setLargeConfirm("");
      runs.retry();
    } else if (result.status === "unavailable") {
      setApplyError(result.message);
    }
  }

  async function handleUndo(runId: string) {
    setUndoingRunId(runId);
    setUndoError(null);
    const result = await hestiaApi.stationOrganizerUndo(runId);
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
    const result = await hestiaApi.stationOrganizerRedo(undoRunId);
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
        <p className="text-[13px] text-[color:var(--kaline-muted)] max-w-2xl">
          As operações são executadas no servidor da Estação, nunca no armazenamento local deste
          notebook.
        </p>
        {station.state.status === "loading" && (
          <p className="text-[12px] text-[color:var(--kaline-muted)]">Verificando Estação…</p>
        )}
        {station.state.status === "unavailable" && (
          <div className="space-y-2 text-[12px] text-[color:var(--kaline-ember)]">
            <p>{station.state.message}</p>
            <button
              type="button"
              onClick={retryStation}
              disabled={stationRefreshing}
              className="rounded border border-[color:var(--kaline-border-copper)] px-3 py-1.5 text-[11px] text-[color:var(--kaline-copper)] disabled:opacity-50"
            >
              {stationRefreshing ? "Verificando Estação…" : "Verificar Estação"}
            </button>
          </div>
        )}
        {station.state.status === "ok" && station.state.data.state !== "available" && (
          <div className="space-y-2 text-[12px] text-[color:var(--kaline-ember)]">
            <p>
              {station.state.data.state === "not_configured"
                ? "Estação não configurada. Defina a conexão no ambiente do serviço."
                : "Estação indisponível. As ações do Organizer estão bloqueadas."}
            </p>
            <button
              type="button"
              onClick={retryStation}
              disabled={stationRefreshing}
              className="rounded border border-[color:var(--kaline-border-copper)] px-3 py-1.5 text-[11px] text-[color:var(--kaline-copper)] disabled:opacity-50"
            >
              {stationRefreshing ? "Verificando Estação…" : "Verificar Estação"}
            </button>
          </div>
        )}
        {station.state.status === "ok" && station.state.data.state === "available" && (
          <p className="text-[12px] text-[color:var(--kaline-muted)]">Estação disponível.</p>
        )}
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <DataCard eyebrow="Organizer" title="Plano de organização" status="idle" defaultOpen>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] uppercase tracking-wider text-[color:var(--kaline-muted)]">
                Filtrar arquivos por tipo:
              </label>
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="rounded border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] text-[color:var(--kaline-text)] text-[11px] px-2 py-1 focus:outline-none focus:border-[color:var(--kaline-copper)] w-full"
              >
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={planLoading || !stationAvailable}
              className="text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 transition disabled:opacity-50 sm:mt-5"
            >
              {planLoading ? "gerando…" : "Gerar plano"}
            </button>
          </div>

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
              {plan.requiresExtraConfirmation && (
                <label className="block text-[11px] text-[color:var(--kaline-muted)]">
                  Confirmação extra: digite exatamente “Estou ciente que este plano afetará{" "}
                  {plan.planned} arquivos.”
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
                    {item.source.relativePath} → {item.target.relativePath}
                  </div>
                  <div className="text-[11px] text-[color:var(--kaline-faint)]">
                    {item.action} · {item.reason} · {item.status}
                    {` · ${item.source.kind}`}
                    {` · ${item.source.label}`}
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
                  !stationAvailable ||
                  plan.items.length === 0 ||
                  (plan.requiresExtraConfirmation &&
                    largeConfirm !==
                      `Estou ciente que este plano afetará ${plan.planned} arquivos.`)
                }
                className="mt-2 text-[11px] px-3 py-1.5 rounded border border-[color:var(--kaline-copper)] text-[color:var(--kaline-copper)] bg-[color:var(--kaline-copper)]/10 hover:bg-[color:var(--kaline-copper)]/20 transition disabled:opacity-50"
              >
                {applying ? "aplicando…" : "Aplicar plano na Estação"}
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
                falhas · {applyResult.summary.skipped} pulados · execução {applyResult.runId}
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
              onRetry={retryStation}
              refreshing={stationRefreshing}
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
                      disabled={undoingRunId === run.runId || !stationAvailable}
                      className="text-[11px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-copper)] transition disabled:opacity-50 shrink-0"
                    >
                      {undoingRunId === run.runId ? "desfazendo…" : "Desfazer"}
                    </button>
                  )}
                  {canRedo && (
                    <button
                      type="button"
                      onClick={() => handleRedo(run.runId)}
                      disabled={redoingRunId === run.runId || !stationAvailable}
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

        {plan && (
          <div className="md:col-span-2">
            <DataCard
              eyebrow="Assistente LLM"
              title="Auxiliar do Plano de Organização"
              status="idle"
              defaultOpen
            >
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-[color:var(--kaline-border-copper)]/30 pb-3">
                  <p className="text-[12px] text-[color:var(--kaline-muted)]">
                    Use os modelos locais configurados para analisar ou tirar dúvidas sobre o plano
                    gerado.
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-[color:var(--kaline-faint)]">
                      Modelo:
                    </label>
                    <select
                      value={assistantModel}
                      onChange={(e) => setAssistantModel(e.target.value)}
                      className="rounded border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] text-[color:var(--kaline-text)] text-[11px] px-2 py-0.5"
                    >
                      <option value="qwen3.5-0.8b">qwen3.5-0.8b (Padrão)</option>
                      <option value="qwen2.5:0.5b">qwen2.5:0.5b</option>
                    </select>
                  </div>
                </div>

                {/* Botões Rápidos */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      askAssistant(
                        "Resuma este plano de organização, destacando os caminhos de destino das extensões e o total planejado.",
                      )
                    }
                    disabled={assistantLoading}
                    className="text-[10px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)]/40 hover:border-[color:var(--kaline-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] transition disabled:opacity-50"
                  >
                    Resumir plano
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      askAssistant(
                        "Quais são as regras de organização aplicadas a este plano? Explique onde cada tipo de arquivo será colocado.",
                      )
                    }
                    disabled={assistantLoading}
                    className="text-[10px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)]/40 hover:border-[color:var(--kaline-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] transition disabled:opacity-50"
                  >
                    Explicar regras aplicadas
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      askAssistant(
                        "Existem riscos de conflito ou sobrescrita no plano atual? Explique como os conflitos são calculados e apresentados.",
                      )
                    }
                    disabled={assistantLoading}
                    className="text-[10px] px-2.5 py-1 rounded border border-[color:var(--kaline-border-copper)]/40 hover:border-[color:var(--kaline-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] transition disabled:opacity-50"
                  >
                    Checar riscos / conflitos
                  </button>
                </div>

                {/* Histórico do Assistente */}
                <div className="space-y-3 max-h-[250px] overflow-y-auto border border-[color:var(--kaline-border-copper)]/20 rounded p-3 bg-black/10">
                  {assistantMessages.length === 0 && (
                    <p className="text-[11px] text-[color:var(--kaline-faint)] text-center py-4">
                      Nenhuma pergunta feita ao assistente ainda. Use um botão rápido acima ou
                      digite abaixo.
                    </p>
                  )}
                  {assistantMessages.map((msg, index) => (
                    <div key={index} className="space-y-1">
                      <p className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--kaline-faint)]">
                        {msg.role === "user" ? "Você" : `Assistente (${assistantModel})`}
                      </p>
                      <p className="text-[12px] whitespace-pre-wrap text-[color:var(--kaline-text)]">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                  {assistantLoading && (
                    <p className="text-[11px] text-[color:var(--kaline-muted)] animate-pulse">
                      Analisando o plano com a LLM local...
                    </p>
                  )}
                  {assistantError && (
                    <p className="text-[11px] text-[color:var(--kaline-ember)]">{assistantError}</p>
                  )}
                </div>

                {/* Campo de Entrada */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="Pergunte ao assistente sobre o plano de organização..."
                    disabled={assistantLoading}
                    className="flex-1 rounded border border-[color:var(--kaline-border-copper)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--kaline-text)] focus:outline-none focus:border-[color:var(--kaline-copper)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && assistantInput.trim()) {
                        askAssistant(assistantInput.trim());
                        setAssistantInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (assistantInput.trim()) {
                        askAssistant(assistantInput.trim());
                        setAssistantInput("");
                      }
                    }}
                    disabled={assistantLoading || !assistantInput.trim()}
                    className="px-3 py-1.5 rounded bg-[color:var(--kaline-copper)] text-[color:var(--kaline-surface)] text-[10px] uppercase tracking-wider font-semibold hover:opacity-90 transition disabled:opacity-40"
                  >
                    Perguntar
                  </button>
                </div>
              </div>
            </DataCard>
          </div>
        )}
      </section>
    </div>
  );
}
