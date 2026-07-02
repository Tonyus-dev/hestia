import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { BookshelfPlaceholder } from "@/components/kaline/BookshelfPlaceholder";
import { codiceCards } from "@/content/kaline";

export const Route = createFileRoute("/_station/codice")({
  head: () => ({
    meta: [
      { title: "Códice — Biblioteca viva da Kaline" },
      {
        name: "description",
        content: "A biblioteca doméstica da Kaline: livros, fichamentos, margens, tudo aguardando.",
      },
      { property: "og:title", content: "Códice — Biblioteca viva da Kaline" },
      {
        property: "og:description",
        content: "A biblioteca doméstica da Kaline: livros, fichamentos, margens, tudo aguardando.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Códice · biblioteca viva"
        title="O que a Kaline ainda vai ler"
        subtitle="Uma biblioteca planejada, sem livros fingidos. Cada card aponta um pedaço da leitura doméstica que ainda precisa acontecer."
      />

      <BookshelfPlaceholder />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {codiceCards.map((c) => (
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

      <p className="mt-8 max-w-2xl text-sm text-[color:var(--kaline-muted)] leading-relaxed">
        A Kaline não terá catálogo pronto: ela vai receber livros aos poucos, do jeito da casa. O
        Supabase guardará apenas metadados — nunca os arquivos pesados, que vivem no Porão.
      </p>
    </div>
  ),
});
