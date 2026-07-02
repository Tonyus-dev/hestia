import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { roadmap } from "@/content/kaline";

export const Route = createFileRoute("/_station/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — Fases da Estação" },
      {
        name: "description",
        content: "As quatro fases da Estação Kaline, do painel visual à presença completa.",
      },
      { property: "og:title", content: "Roadmap — Fases da Estação" },
      {
        property: "og:description",
        content: "As quatro fases da Estação Kaline, do painel visual à presença completa.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Roadmap"
        title="As fases da Kaline"
        subtitle="Do painel visual à presença completa. Cada fase entra em cena quando a anterior está de pé."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {roadmap.map((r) => (
          <GlassCard key={r.fase} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--kaline-copper)]">
                  {r.fase}
                </p>
                <h3 className="kaline-serif text-2xl mt-1 text-[color:var(--kaline-text)]">
                  {r.titulo}
                </h3>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm text-[color:var(--kaline-muted)]">{r.descricao}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  ),
});
