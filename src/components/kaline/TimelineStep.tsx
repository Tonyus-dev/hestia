import { StatusBadge } from "./StatusBadge";
import type { StatusVariant } from "@/content/kaline";

export function TimelineStep({
  step,
  titulo,
  itens,
  status,
  last,
}: {
  step: string;
  titulo: string;
  itens: string[];
  status: StatusVariant;
  last?: boolean;
}) {
  return (
    <div className="relative pl-14 pb-10">
      {/* rail */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[22px] top-12 bottom-0 w-px bg-gradient-to-b from-[color:var(--kaline-copper)]/40 to-transparent"
        />
      )}
      <div className="absolute left-0 top-0 h-11 w-11 rounded-full border border-[color:var(--kaline-border-copper)] flex items-center justify-center kaline-serif text-[color:var(--kaline-copper)] text-sm bg-[color:var(--kaline-obsidian)]">
        {step}
      </div>
      <div className="kaline-glass p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="kaline-serif text-xl text-[color:var(--kaline-text)] leading-tight">
            {titulo}
          </h3>
          <StatusBadge status={status} />
        </div>
        <ul className="mt-4 grid gap-1.5 text-sm text-[color:var(--kaline-muted)]">
          {itens.map((i) => (
            <li key={i} className="flex gap-3">
              <span className="text-[color:var(--kaline-copper)]">·</span>
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
