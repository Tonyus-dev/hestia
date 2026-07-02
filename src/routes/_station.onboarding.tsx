import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { TimelineStep } from "@/components/kaline/TimelineStep";
import { onboarding } from "@/content/kaline";

export const Route = createFileRoute("/_station/onboarding")({
  head: () => ({
    meta: [
      { title: "Primeira ligação — K∧LINE" },
      { name: "description", content: "Guia visual e honesto para acender a Estação Kaline." },
      { property: "og:title", content: "Primeira ligação — K∧LINE" },
      {
        property: "og:description",
        content: "Guia visual e honesto para acender a Estação Kaline.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Primeira ligação"
        title="Como acender a Estação"
        subtitle="Um roteiro honesto, sem checkboxes funcionais e sem progresso salvo. Só um guia visual do que precisa existir antes da Kaline respirar."
      />
      <div>
        {onboarding.map((o, i) => (
          <TimelineStep key={o.step} {...o} last={i === onboarding.length - 1} />
        ))}
      </div>
      <p className="mt-8 ka-caps">guia visual · nada aqui salva ou executa</p>
    </div>
  ),
});
