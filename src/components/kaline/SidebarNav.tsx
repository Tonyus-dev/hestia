import { Link, useRouterState } from "@tanstack/react-router";
import { nav } from "@/content/kaline";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { usePhaseFilter, isAgoraStatus } from "./PhaseFilter";

const GROUP_ORDER = ["K∧LINE", "PRESENÇA", "MEMÓRIA", "MONTAGEM", "SISTEMA"] as const;

export function SidebarNav({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { phase } = usePhaseFilter();

  const filteredNav = nav.filter((n) => {
    if (phase === "depois") return true;
    return isAgoraStatus(n.status);
  });

  const activeItem =
    filteredNav.find((n) => (n.to === "/" ? pathname === "/" : pathname === n.to)) ??
    filteredNav.find((n) => n.to !== "/" && pathname.startsWith(n.to + "/"));

  const linkNode = (n: (typeof nav)[number]) => {
    const active =
      n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(n.to + "/");

    const inner = (
      <Link
        key={n.to}
        to={n.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 pl-5 pr-3 rounded-md border border-transparent",
          "transition-colors duration-150 outline-none",
          "focus-visible:border-[color:var(--kaline-copper)]/60 focus-visible:bg-[color:var(--kaline-copper)]/[0.06]",
          mobile ? "min-h-11 py-2.5" : "py-2",
          active
            ? "border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-copper)]/12 text-[color:var(--kaline-text)]"
            : "text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] hover:bg-white/[0.03] hover:border-[color:var(--kaline-copper)]/20",
        )}
      >
        {/* Left rail: solid ember bar when active, thin copper wedge on hover, dim dot otherwise */}
        <span
          aria-hidden
          className={cn(
            "absolute left-1 top-1/2 -translate-y-1/2 rounded-full transition-all duration-150",
            active
              ? "h-5 w-[3px] bg-[color:var(--kaline-ember)] shadow-[0_0_10px_oklch(0.70_0.28_38/0.65)]"
              : "h-1.5 w-1.5 bg-[color:var(--kaline-copper)] opacity-25 group-hover:opacity-70 group-hover:h-4 group-hover:w-[2px]",
          )}
        />
        <span
          className={cn(
            "serif text-[15px] tracking-tight flex-1 truncate",
            active && "text-[color:var(--kaline-text)]",
          )}
        >
          {n.label}
        </span>
        {n.hint && !mobile && (
          <span
            className={cn(
              "text-[9px] uppercase tracking-[0.22em] truncate transition-colors",
              active
                ? "text-[color:var(--kaline-copper)]"
                : "text-[color:var(--kaline-faint)]/70 group-hover:text-[color:var(--kaline-faint)]",
            )}
          >
            {n.hint}
          </span>
        )}
      </Link>
    );

    if (!n.tooltip) return inner;

    return (
      <Tooltip key={`tt-${n.to}`}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="max-w-[14rem] text-[11px] leading-relaxed tracking-normal normal-case bg-[oklch(0.12_0.02_28)] border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-text)] px-3 py-2"
        >
          {n.tooltip}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav className="flex flex-col gap-5">
      {/* Breadcrumb of current location — mirrors Totalidade's "grupo › item" spine */}
      {activeItem && (
        <div
          key={activeItem.to}
          className="mx-2 mb-1 rounded-md border border-[color:var(--kaline-copper)]/15 bg-gradient-to-r from-[color:var(--kaline-copper)]/[0.07] to-[color:var(--kaline-copper)]/[0.02] px-3 py-2.5 animate-fade-in transition-colors duration-300"
        >
          <div className="text-[9px] uppercase tracking-[0.34em] text-[color:var(--kaline-faint)]/80">
            {activeItem.group}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[color:var(--kaline-copper)]/70 text-[11px] leading-none">›</span>
            <span className="serif text-[15px] leading-tight text-[color:var(--kaline-text)] tracking-tight truncate">
              {activeItem.label}
            </span>
          </div>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const items = filteredNav.filter((n) => n.group === group);
        if (items.length === 0) return null;
        const hasActive = items.some((n) =>
          n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(n.to + "/"),
        );
        return (
          <div key={group} className="flex flex-col gap-1">
            <div
              className={cn(
                "px-3 pb-1 text-[10px] uppercase tracking-[0.32em] transition-colors",
                hasActive
                  ? "text-[color:var(--kaline-copper)]"
                  : "text-[color:var(--kaline-faint)]",
              )}
            >
              {group}
            </div>
            {items.map(linkNode)}
          </div>
        );
      })}
    </nav>
  );
}
