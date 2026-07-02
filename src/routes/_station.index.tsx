import { createFileRoute } from "@tanstack/react-router";
import { HeroKaline } from "@/components/kaline/HeroKaline";
import { ServiceCard } from "@/components/kaline/ServiceCard";
import { homeCards } from "@/content/kaline";
import { PhaseFilterToggle, usePhaseFilter, isAgoraStatus } from "@/components/kaline/PhaseFilter";

export const Route = createFileRoute("/_station/")({
  head: () => ({
    meta: [
      { title: "K∧LINE CENTRAL — Painel vivo" },
      {
        name: "description",
        content: "A porta de entrada da Estação Kaline. Um painel vivo, honesto e doméstico.",
      },
      { property: "og:title", content: "K∧LINE CENTRAL — Painel vivo" },
      {
        property: "og:description",
        content: "A porta de entrada da Estação Kaline. Um painel vivo, honesto e doméstico.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { phase } = usePhaseFilter();
  const filteredCards =
    phase === "depois" ? homeCards : homeCards.filter((c) => isAgoraStatus(c.status));

  return (
    <div className="space-y-14 md:space-y-16">
      <HeroKaline />
      <section>
        <div className="mb-5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <h2 className="ka-title-card">Cômodos da Estação</h2>
          <div className="flex items-center gap-3">
            <PhaseFilterToggle />
            <span className="ka-caps-xs">
              {phase === "depois" ? "todos os estados honestos" : "só o que existe agora"}
            </span>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {filteredCards.map((c) => (
            <ServiceCard key={c.title} {...c} />
          ))}
        </div>
      </section>
    </div>
  );
}
