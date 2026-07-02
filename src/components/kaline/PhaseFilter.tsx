import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Phase = "agora" | "depois";

const PHASE_LABELS: Record<Phase, string> = {
  agora: "Agora",
  depois: "Depois",
};

const PHASE_HINTS: Record<Phase, string> = {
  agora: "só o que já existe na Estação",
  depois: "inclui o que ainda virá",
};

interface PhaseFilterCtx {
  phase: Phase;
  setPhase: (p: Phase) => void;
}

const PhaseFilterContext = createContext<PhaseFilterCtx | null>(null);

export function PhaseFilterProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("agora");
  return (
    <PhaseFilterContext.Provider value={{ phase, setPhase }}>
      {children}
    </PhaseFilterContext.Provider>
  );
}

export function usePhaseFilter() {
  const ctx = useContext(PhaseFilterContext);
  if (!ctx) throw new Error("usePhaseFilter must be inside PhaseFilterProvider");
  return ctx;
}

/** Statuses that belong to "Agora" — things already in some form at the Station */
export const AGORA_STATUSES = new Set([
  "prototype",
  "not-verified",
  "not-connected",
  "offline",
  "awaiting-library",
  "waiting",
]);

/** Statuses that belong to "Depois" — things planned for later */
export const DEPOIS_STATUSES = new Set(["planned", "future"]);

export function isAgoraStatus(status: string): boolean {
  return AGORA_STATUSES.has(status);
}

export function isDepoisStatus(status: string): boolean {
  return DEPOIS_STATUSES.has(status);
}

export function PhaseFilterToggle({ className }: { className?: string }) {
  const { phase, setPhase } = usePhaseFilter();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[color:var(--kaline-border-copper)] p-[3px]",
        className,
      )}
      role="radiogroup"
      aria-label="Filtro de fase da Estação"
    >
      {(["agora", "depois"] as Phase[]).map((p) => {
        const active = phase === p;
        return (
          <button
            key={p}
            role="radio"
            aria-checked={active}
            onClick={() => setPhase(p)}
            className={cn(
              "relative px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.24em] transition-all duration-200",
              active
                ? "text-[color:var(--kaline-text)] bg-[color:var(--kaline-copper)]/15 border border-[color:var(--kaline-copper)]/40"
                : "text-[color:var(--kaline-faint)] border border-transparent hover:text-[color:var(--kaline-muted)]",
            )}
            title={PHASE_HINTS[p]}
          >
            {PHASE_LABELS[p]}
            {p === "depois" && (
              <span
                className={cn(
                  "ml-1.5 inline-flex h-[6px] w-[6px] rounded-full",
                  active ? "bg-[color:var(--kaline-amber)]" : "bg-[color:var(--kaline-faint)]/50",
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
