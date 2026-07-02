import { Link } from "@tanstack/react-router";
import { GlassCard } from "./GlassCard";
import { StatusBadge } from "./StatusBadge";
import type { StatusVariant } from "@/content/kaline";

export function ServiceCard({
  eyebrow,
  title,
  subtitle,
  status,
  to,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  status: StatusVariant;
  to?: string;
}) {
  const inner = (
    <GlassCard className="h-full flex flex-col gap-5 p-7">
      {eyebrow && (
        <p className="text-[10px] uppercase tracking-[0.32em] text-[color:var(--kaline-faint)]">
          {eyebrow}
        </p>
      )}
      <h3 className="serif text-2xl leading-[1.1] text-[color:var(--kaline-text)]">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-[color:var(--kaline-muted)]">{subtitle}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3 border-t border-[color:var(--kaline-copper)]/10">
        <div className="min-w-0">
          <StatusBadge status={status} />
        </div>
        {to && (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-copper)]/80">
            entrar →
          </span>
        )}
      </div>
    </GlassCard>
  );
  return to ? (
    <Link
      to={to}
      className="block h-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--kaline-copper)] rounded-[18px]"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}
