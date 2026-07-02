import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { FolderTree } from "@/components/kaline/FolderTree";
import { arquivosCards, folderTree } from "@/content/kaline";

export const Route = createFileRoute("/_station/arquivos")({
  head: () => ({
    meta: [
      { title: "Arquivos — Porão da Kaline" },
      { name: "description", content: "A estrutura de pastas planejada no HD de 1 TB da Estação." },
      { property: "og:title", content: "Arquivos — Porão da Kaline" },
      {
        property: "og:description",
        content: "A estrutura de pastas planejada no HD de 1 TB da Estação.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Arquivos · Porão"
        title="Onde o peso descansa"
        subtitle="O HD de 1 TB não está montado, e nenhuma pasta foi lida. A árvore abaixo é o desenho da casa — não uma leitura do disco."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <FolderTree text={folderTree} />
        <div className="grid gap-4">
          {arquivosCards.map((c) => (
            <GlassCard
              key={c.title}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            >
              <div className="min-w-0">
                <h3 className="kaline-serif text-lg text-[color:var(--kaline-text)]">{c.title}</h3>
                <p className="text-sm text-[color:var(--kaline-muted)] mt-1">{c.subtitle}</p>
              </div>
              <StatusBadge status={c.status} />
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  ),
});
