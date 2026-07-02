import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { backupsCards } from "@/content/kaline";

export const Route = createFileRoute("/_station/backups")({
  head: () => ({
    meta: [
      { title: "Backups — Rotinas pendentes" },
      {
        name: "description",
        content: "Nenhum backup foi executado ainda. Esta seção mostra o plano, não a memória.",
      },
      { property: "og:title", content: "Backups — Rotinas pendentes" },
      {
        property: "og:description",
        content: "Nenhum backup foi executado ainda. Esta seção mostra o plano, não a memória.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Backups"
        title="A memória que ainda não foi salva"
        subtitle="Nada foi executado ainda. Aqui aparecem as rotinas planejadas — todas dependem do Station Agent para começar a existir."
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {backupsCards.map((c) => (
          <GlassCard key={c.title} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h3 className="kaline-serif text-xl leading-tight text-[color:var(--kaline-text)] min-w-0">
                {c.title}
              </h3>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-[color:var(--kaline-muted)]">{c.subtitle}</p>
          </GlassCard>
        ))}
      </div>
      <div className="mt-8">
        <button
          type="button"
          disabled
          aria-disabled
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-muted)] opacity-55 cursor-not-allowed"
        >
          Executar backup
          <span className="text-[9px] tracking-[0.22em] text-[color:var(--kaline-amber)] border border-[color:var(--kaline-amber)]/40 rounded-full px-1.5 py-0.5">
            Planejado
          </span>
        </button>
      </div>
    </div>
  ),
});
