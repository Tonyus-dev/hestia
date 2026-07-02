import { cn } from "@/lib/utils";
import { statusLabel, statusTooltip, type StatusVariant } from "@/content/kaline";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const tone: Record<StatusVariant, string> = {
  waiting: "border-[color:var(--kaline-amber)]/35 text-[color:var(--kaline-amber)]/90",
  offline: "border-[color:var(--kaline-ember)]/45 text-[color:var(--kaline-ember)]",
  planned: "border-[color:var(--kaline-copper)]/30 text-[color:var(--kaline-copper)]/85",
  "not-verified": "border-[color:var(--kaline-copper)]/22 text-[color:var(--kaline-copper)]/70",
  "not-connected": "border-[color:var(--kaline-copper)]/18 text-[color:var(--kaline-copper)]/60",
  prototype: "border-[color:var(--kaline-gold)]/55 text-[color:var(--kaline-gold)]",
  future: "border-[color:var(--kaline-copper)]/16 text-[color:var(--kaline-copper)]/55",
  "awaiting-library": "border-[color:var(--kaline-amber)]/35 text-[color:var(--kaline-amber)]/90",
};

// Two tiers so it's visually obvious what already exists vs what is still ahead.
// AGORA = what you can actually see/touch in this build (visual prototype).
// DEPOIS = everything not yet built (planned, future, waiting, offline, etc.).
const tier: Record<StatusVariant, "agora" | "depois"> = {
  prototype: "agora",
  waiting: "depois",
  offline: "depois",
  planned: "depois",
  "not-verified": "depois",
  "not-connected": "depois",
  future: "depois",
  "awaiting-library": "depois",
};

const tierChip: Record<"agora" | "depois", string> = {
  agora:
    "bg-[color:var(--kaline-gold)]/15 text-[color:var(--kaline-gold)] border-[color:var(--kaline-gold)]/40",
  depois:
    "bg-transparent text-[color:var(--kaline-copper)]/55 border-[color:var(--kaline-copper)]/25",
};

const dotPulses: StatusVariant[] = ["waiting", "offline"];

export function StatusBadge({
  status,
  label,
  className,
  showTier = true,
}: {
  status: StatusVariant;
  label?: string;
  className?: string;
  showTier?: boolean;
}) {
  const pulses = dotPulses.includes(status);
  const t = tier[status];
  const isAgora = t === "agora";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border",
            // padding e fonte um pouco menores no mobile, respiro no sm+
            "pl-1 pr-2 py-[3px] text-[9.5px] sm:pr-2.5 sm:text-[10px]",
            "uppercase tracking-[0.14em] sm:tracking-[0.16em]",
            "bg-[oklch(0.08_0.012_22/0.75)]",
            tone[status],
            className,
          )}
        >
          {showTier && (
            <span
              aria-hidden
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border",
                "px-1 py-[1px] text-[8px] tracking-[0.2em] sm:px-1.5 sm:text-[8.5px] sm:tracking-[0.22em]",
                tierChip[t],
              )}
            >
              <span
                className={cn(
                  "h-[4px] w-[4px] rounded-full",
                  isAgora
                    ? "bg-[color:var(--kaline-gold)]"
                    : "bg-transparent border border-[color:var(--kaline-copper)]/60",
                )}
              />
              {isAgora ? "Agora" : "Depois"}
            </span>
          )}
          <span
            aria-hidden
            className={cn(
              "shrink-0 h-[5px] w-[5px] rounded-full bg-current opacity-90",
              pulses && "kaline-pulse",
            )}
          />
          {/* rótulo trunca em uma linha em vez de estourar a largura do card */}
          <span className="min-w-0 truncate">{label ?? statusLabel[status]}</span>
        </span>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[16rem] text-[11px] leading-relaxed tracking-normal normal-case bg-[oklch(0.12_0.02_28)] border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-text)] px-3 py-2"
      >
        {statusTooltip[status]}
      </TooltipContent>
    </Tooltip>
  );
}
