import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, FolderSearch, RefreshCw } from "lucide-react";

import { hestiaApi, type ApiState, type OrganizerPlan, type OrganizerRun } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_station/organizador")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Organizador" },
      { name: "description", content: "Plano e aplicação real do Organizer na Station desktop." },
    ],
  }),
  component: OrganizerPage,
});

const PAGE_SIZE = 20;

function OrganizerPage() {
  const desktop = useApi(() => hestiaApi.stationConnection("desktop"));
  const runs = useApi(hestiaApi.desktopOrganizerRuns);
  const [planState, setPlanState] = useState<ApiState<OrganizerPlan>>({ status: "idle" });
  const [applyState, setApplyState] = useState<ApiState<OrganizerRun>>({ status: "idle" });
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [visibleItems, setVisibleItems] = useState(PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [largeConfirmation, setLargeConfirmation] = useState("");
  const [consumedPlanId, setConsumedPlanId] = useState<string | null>(null);

  const disabled =
    (runs.state.status === "unavailable" && runs.state.details.code === "ORGANIZER_DISABLED") ||
    (planState.status === "unavailable" && planState.details.code === "ORGANIZER_DISABLED");
  const stationAvailable =
    desktop.state.status === "ok" && desktop.state.data.state === "available";
  const plan = planState.status === "ok" ? planState.data.plan : null;
  const applied = !!plan && consumedPlanId === plan.planId;
  const canApply =
    !!plan &&
    plan.summary.planned > 0 &&
    stationAvailable &&
    !applied &&
    applyState.status !== "loading";

  async function generatePlan() {
    setPlanState({ status: "loading" });
    setApplyState({ status: "idle" });
    setConsumedPlanId(null);
    setVisibleItems(PAGE_SIZE);
    setPlanState(await hestiaApi.desktopOrganizerPlan(selectedExtensions));
  }

  async function applyPlan() {
    if (!plan || confirmation !== "EFETIVAR") return;
    if (plan.requiresExtraConfirmation && largeConfirmation !== plan.planId) return;
    setApplyState({ status: "loading" });
    const result = await hestiaApi.desktopOrganizerApply({
      planId: plan.planId,
      confirmation: "EFETIVAR",
      largePlanConfirmation: plan.requiresExtraConfirmation ? largeConfirmation : null,
    });
    setApplyState(result);
    if (result.status === "ok") {
      setConsumedPlanId(plan.planId);
      setDialogOpen(false);
      runs.retry();
    }
  }

  function toggleExtension(extension: string) {
    setSelectedExtensions((current) =>
      current.includes(extension)
        ? current.filter((item) => item !== extension)
        : [...current, extension],
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">/organizador</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)] md:text-4xl">
          Organizador do servidor
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--kaline-muted)]">
          Gerar e revisar o plano não altera arquivos. Efetivar o plano altera arquivos reais após
          confirmação.
        </p>
      </header>

      <div className="rounded-xl border border-[color:var(--kaline-amber)]/50 bg-[color:var(--kaline-amber)]/5 p-4">
        <p className="font-medium text-[color:var(--kaline-amber)]">
          {applyState.status === "ok"
            ? "Plano efetivado. Consulte o run abaixo."
            : "Revise antes de efetivar."}
        </p>
        <p className="mt-1 text-xs text-[color:var(--kaline-muted)]">
          Desfazer e refazer ainda não estão disponíveis nesta interface. PENDENTE DE GATE FÍSICO:
          teste posterior com arquivo descartável único.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <InfoCard
          title="Station desktop"
          value={
            desktop.state.status === "loading"
              ? "Consultando…"
              : stationAvailable
                ? "Disponível"
                : desktop.state.status === "ok"
                  ? "Indisponível"
                  : "Não foi possível consultar"
          }
        />
        <InfoCard
          title="Organizer"
          value={
            disabled
              ? "Desativado no servidor"
              : runs.state.status === "ok"
                ? "plano + aplicação"
                : runs.state.status === "loading"
                  ? "Consultando…"
                  : "Indisponível"
          }
        />
      </section>

      {!disabled && (
        <section className="space-y-4">
          <button
            type="button"
            onClick={generatePlan}
            disabled={!stationAvailable || planState.status === "loading"}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--kaline-copper)] disabled:opacity-40"
          >
            <FolderSearch className="h-4 w-4" />{" "}
            {selectedExtensions.length ? "Gerar plano filtrado" : "Gerar plano"}
          </button>
          {selectedExtensions.length > 0 && (
            <span className="ml-3 text-xs text-[color:var(--kaline-muted)]">
              Filtro: {selectedExtensions.join(", ")}
            </span>
          )}
          {planState.status === "loading" && (
            <p className="inline-flex items-center gap-2 text-sm text-[color:var(--kaline-muted)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Gerando plano real…
            </p>
          )}
          {applyState.status === "loading" && (
            <p className="inline-flex items-center gap-2 text-sm text-[color:var(--kaline-muted)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Efetivando plano real…
            </p>
          )}
          {planState.status === "unavailable" && (
            <UnavailableNote message={planState.message} details={planState.details} />
          )}
          {applyState.status === "unavailable" && (
            <UnavailableNote message={applyState.message} details={applyState.details} />
          )}
          {plan && (
            <PlanView
              plan={plan}
              selected={selectedExtensions}
              onToggle={toggleExtension}
              visibleItems={visibleItems}
              onMore={() => setVisibleItems((n) => n + PAGE_SIZE)}
              canApply={canApply}
              onReview={() => setDialogOpen(true)}
            />
          )}
        </section>
      )}

      {applyState.status === "ok" && <RunResult run={applyState.data.run} />}
      <Runs
        state={runs.state}
        retry={runs.retry}
        refreshing={runs.refreshing}
        disabled={disabled}
      />
      {plan && dialogOpen && (
        <ApplyDialog
          plan={plan}
          selectedExtensions={selectedExtensions}
          confirmation={confirmation}
          largeConfirmation={largeConfirmation}
          setConfirmation={setConfirmation}
          setLargeConfirmation={setLargeConfirmation}
          onCancel={() => setDialogOpen(false)}
          onApply={applyPlan}
          disabled={
            !canApply ||
            confirmation !== "EFETIVAR" ||
            (plan.requiresExtraConfirmation && largeConfirmation !== plan.planId)
          }
        />
      )}
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
      <p className="kaline-eyebrow">{title}</p>
      <p className="mt-3 text-sm text-[color:var(--kaline-text)]">{value}</p>
    </div>
  );
}

function PlanView({
  plan,
  selected,
  onToggle,
  visibleItems,
  onMore,
  canApply,
  onReview,
}: {
  plan: OrganizerPlan["plan"];
  selected: string[];
  onToggle: (ext: string) => void;
  visibleItems: number;
  onMore: () => void;
  canApply: boolean;
  onReview: () => void;
}) {
  const move = plan.items.filter(
    (item) => item.action === "move" && item.status === "planned",
  ).length;
  const copy = plan.items.filter(
    (item) => item.action === "copy" && item.status === "planned",
  ).length;
  return (
    <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
      <div className="flex flex-wrap gap-5 text-sm text-[color:var(--kaline-text)]">
        <span>Arquivos planejados: {plan.summary.planned}</span>
        <span>Conflitos: {plan.summary.conflicts}</span>
        <span>Ignorados: {plan.summary.ignored}</span>
        <span>Quarentena: {plan.summary.quarantined}</span>
        <span>
          Tamanho total planejado:{" "}
          {formatBytes(
            plan.items.filter((i) => i.status === "planned").reduce((sum, i) => sum + i.size, 0),
          )}
        </span>
        <span>Mover: {move}</span>
        <span>Copiar: {copy}</span>
      </div>
      <h2 className="kaline-eyebrow mt-5">Por extensão</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(plan.summary.byExtension).map(([ext, count]) => (
          <button
            key={ext}
            type="button"
            onClick={() => onToggle(ext)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              selected.includes(ext)
                ? "border-[color:var(--kaline-copper)] text-[color:var(--kaline-copper)]"
                : "border-white/10 text-[color:var(--kaline-muted)]",
            )}
          >
            {ext} {count}
          </button>
        ))}
      </div>
      <h2 className="kaline-eyebrow mt-5">Por destino</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--kaline-muted)]">
        {Object.entries(plan.summary.byTargetArea).map(([area, count]) => (
          <span key={area} className="rounded-full border border-white/10 px-3 py-1">
            {area} {count}
          </span>
        ))}
      </div>
      {plan.summary.conflicts > 0 || plan.requiresExtraConfirmation ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-[color:var(--kaline-amber)]">
          <AlertTriangle className="h-4 w-4" /> O plano contém avisos; conflitos não serão tocados.
        </p>
      ) : null}
      {plan.items.length > 0 && (
        <ul className="mt-4 space-y-2 text-xs text-[color:var(--kaline-muted)]">
          {plan.items.slice(0, visibleItems).map((item) => (
            <li key={item.id} className="rounded border border-white/5 p-2 font-mono">
              <span className="text-[color:var(--kaline-text)]">
                {extensionOf(item.source.relativePath) || "sem extensão"}
              </span>{" "}
              · ação: {item.action === "move" ? "mover" : "copiar"} · origem: {item.source.label}/
              {item.source.kind} · arquivo: {item.source.relativePath} · destino:{" "}
              {item.target.relativePath} · tamanho: {formatBytes(item.size)} · risco: {item.risk} ·
              status: {item.status}
            </li>
          ))}
        </ul>
      )}
      {visibleItems < plan.items.length && (
        <button
          type="button"
          onClick={onMore}
          className="mt-3 rounded border border-[color:var(--kaline-border-copper)] px-3 py-2 text-xs text-[color:var(--kaline-copper)]"
        >
          Mostrar mais 20
        </button>
      )}
      <div>
        <button
          type="button"
          onClick={onReview}
          disabled={!canApply}
          className="mt-5 rounded-full border border-[color:var(--kaline-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--kaline-copper)] disabled:opacity-40"
        >
          Revisar efetivação
        </button>
      </div>
    </div>
  );
}

function ApplyDialog(props: {
  plan: OrganizerPlan["plan"];
  selectedExtensions: string[];
  confirmation: string;
  largeConfirmation: string;
  setConfirmation: (v: string) => void;
  setLargeConfirmation: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
  disabled: boolean;
}) {
  const { plan } = props;
  const move = plan.items.filter(
    (item) => item.action === "move" && item.status === "planned",
  ).length;
  const copy = plan.items.filter(
    (item) => item.action === "copy" && item.status === "planned",
  ).length;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="max-w-xl rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 text-sm text-[color:var(--kaline-text)]">
        <h2 className="kaline-serif text-2xl">Revisar efetivação</h2>
        <p className="mt-3">
          {plan.summary.planned} arquivos serão efetivados. {move} serão movidos. {copy} serão
          copiados. {plan.summary.conflicts} conflitos não serão tocados. {plan.summary.ignored}{" "}
          ignorados não serão tocados. Tamanho total:{" "}
          {formatBytes(
            plan.items.filter((i) => i.status === "planned").reduce((sum, i) => sum + i.size, 0),
          )}
          .
        </p>
        <p className="mt-2 text-xs text-[color:var(--kaline-muted)]">
          Extensões selecionadas: {props.selectedExtensions.join(", ") || "todas"}. Principais
          destinos: {Object.keys(plan.summary.byTargetArea).slice(0, 5).join(", ") || "—"}.
        </p>
        <label className="mt-4 block text-xs">
          Digite EFETIVAR
          <input
            value={props.confirmation}
            onChange={(e) => props.setConfirmation(e.target.value)}
            className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2"
          />
        </label>
        {plan.requiresExtraConfirmation && (
          <label className="mt-4 block text-xs">
            Cole o planId {plan.planId}
            <input
              value={props.largeConfirmation}
              onChange={(e) => props.setLargeConfirmation(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2"
            />
          </label>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded border border-white/10 px-3 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onApply}
            disabled={props.disabled}
            className="rounded border border-[color:var(--kaline-copper)] px-3 py-2 text-[color:var(--kaline-copper)] disabled:opacity-40"
          >
            Efetivar {plan.summary.planned} arquivos
          </button>
        </div>
      </div>
    </div>
  );
}

function RunResult({ run }: { run: OrganizerRun["run"] }) {
  return (
    <section className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 text-sm">
      <p className="kaline-eyebrow">Resultado real</p>
      <p>runId: {run.runId}</p>
      <p>status: {run.status}</p>
      <p>operações concluídas: {run.summary.ok}</p>
      <p>falhas: {run.summary.failed}</p>
      <p>itens ignorados: {run.summary.skipped}</p>
    </section>
  );
}
function Runs({
  state,
  retry,
  refreshing,
  disabled,
}: {
  state: ApiState<import("@/lib/hestia/api").OrganizerRuns>;
  retry: () => void;
  refreshing: boolean;
  disabled: boolean;
}) {
  if (state.status === "unavailable" && !disabled)
    return (
      <UnavailableNote
        message={state.message}
        details={state.details}
        onRetry={retry}
        refreshing={refreshing}
      />
    );
  if (state.status !== "ok") return null;
  return (
    <section className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5">
      <p className="kaline-eyebrow">Histórico de runs ({state.data.items.length})</p>
      {state.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--kaline-muted)]">Nenhum run registrado.</p>
      ) : (
        <ul className="mt-3 space-y-2 font-mono text-xs text-[color:var(--kaline-muted)]">
          {state.data.items.map((run) => (
            <li key={run.runId}>
              {run.runId} · {run.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function extensionOf(path: string) {
  const name = path.split("/").pop() || "";
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}
function formatBytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit++;
  }
  return `${next.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
