import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { midiaCards } from "@/content/kaline";

export const Route = createFileRoute("/_station/midia")({
  head: () => ({
    meta: [
      { title: "Mídia — Jellyfin planejado" },
      { name: "description", content: "A sala de mídia da Estação Kaline, ainda por acender." },
      { property: "og:title", content: "Mídia — Jellyfin planejado" },
      {
        property: "og:description",
        content: "A sala de mídia da Estação Kaline, ainda por acender.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Mídia · Jellyfin"
        title="Onde os filmes vão morar"
        subtitle="Um servidor de mídia no HD do Porão, um cliente leve na TV Box, e o celular como controle. Nada disso está no ar ainda."
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {midiaCards.map((c) => (
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
          Abrir Jellyfin
          <span className="text-[9px] tracking-[0.22em] text-[color:var(--kaline-copper)] border border-[color:var(--kaline-copper)]/40 rounded-full px-1.5 py-0.5">
            Aguardando servidor
          </span>
        </button>
      </div>
    </div>
  ),
});
