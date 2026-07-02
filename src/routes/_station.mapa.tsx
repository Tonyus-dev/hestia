import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { StationMap } from "@/components/kaline/StationMap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_station/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa da Estação — K∧LINE" },
      { name: "description", content: "Como as peças físicas da Estação Kaline conversam." },
      { property: "og:title", content: "Mapa da Estação — K∧LINE" },
      {
        property: "og:description",
        content: "Diagrama elegante da arquitetura doméstica da Kaline.",
      },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  const [tv, setTv] = useState(false);

  return (
    // Em modo TV, "quebramos" o container do StationShell para ocupar toda a largura
    <div className={cn(tv && "-mx-4 sm:-mx-6 md:-mx-8 lg:-mx-10")}>
      <a
        href="#station-map-canvas"
        className={cn(
          "sr-only focus-visible:not-sr-only",
          "focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50",
          "focus-visible:rounded-full focus-visible:border focus-visible:border-[color:var(--kaline-copper)]/70",
          "focus-visible:bg-[color:var(--kaline-ember-bg)] focus-visible:px-4 focus-visible:py-2",
          "focus-visible:text-[11px] focus-visible:uppercase focus-visible:tracking-[0.28em]",
          "focus-visible:text-[color:var(--kaline-text)] focus-visible:shadow-[0_0_18px_-6px_oklch(0.70_0.28_38/0.55)]",
        )}
      >
        Pular para o mapa da Estação
      </a>

      <header className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="min-w-0 flex-1">
          <SectionHeader
            eyebrow="Mapa da Estação"
            title="A arquitetura física da Kaline"
            subtitle="Um servidor pequeno, um HD paciente, uma TV Box, um notebook, um celular. E dois habitantes ainda ausentes: o Station Agent e o Supabase, que registrará apenas metadados."
          />
        </div>
        <button
          type="button"
          onClick={() => setTv((v) => !v)}
          aria-pressed={tv}
          className={cn(
            "shrink-0 mt-2 inline-flex items-center gap-2 rounded-full border px-4 py-2",
            "text-[11px] uppercase tracking-[0.28em] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--kaline-copper)]/50",
            tv
              ? "border-[color:var(--kaline-gold)]/60 bg-[color:var(--kaline-copper)]/12 text-[color:var(--kaline-text)] shadow-[0_0_18px_-6px_oklch(0.70_0.28_38/0.55)]"
              : "border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] hover:border-[color:var(--kaline-copper)]/50",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              tv
                ? "bg-[color:var(--kaline-ember)] shadow-[0_0_10px_oklch(0.70_0.28_38/0.75)]"
                : "bg-[color:var(--kaline-copper)]/40",
            )}
          />
          Modo TV
        </button>
      </header>

      <section
        aria-labelledby="station-map-title"
        className={cn(tv && "mt-4 px-2 sm:px-4 md:px-6")}
      >
        <h2 id="station-map-title" className="sr-only">
          Mapa interativo da Estação Kaline
        </h2>
        <StationMap tv={tv} />
      </section>
    </div>
  );
}
