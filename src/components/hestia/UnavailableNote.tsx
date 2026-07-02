import { HESTIA } from "@/content/kaline";

export function UnavailableNote({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-glass)] p-4 text-[13px] text-[color:var(--kaline-muted)]">
      <p className="kaline-eyebrow text-[color:var(--kaline-amber)]">{HESTIA.waiting}</p>
      <p className="mt-2">{message ?? "API local indisponível"}</p>
      <p className="mt-1 text-[color:var(--kaline-faint)] text-[12px]">
        Sem leitura real ainda · Nenhuma métrica será inventada
      </p>
    </div>
  );
}

export function DataCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col gap-3">
      {eyebrow && <p className="kaline-eyebrow">{eyebrow}</p>}
      <h3 className="kaline-serif text-xl text-[color:var(--kaline-text)]">{title}</h3>
      <div className="text-[13.5px] text-[color:var(--kaline-muted)] flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--kaline-border-copper)]/40 pb-1.5 last:border-0 last:pb-0">
      <span className="text-[color:var(--kaline-faint)] text-[11px] uppercase tracking-[0.22em]">
        {k}
      </span>
      <span className="text-right font-mono text-[12.5px] text-[color:var(--kaline-text)] break-all">
        {v}
      </span>
    </div>
  );
}
