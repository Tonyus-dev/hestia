import { createFileRoute } from "@tanstack/react-router";
import { PrincipleCard } from "@/components/kaline/PrincipleCard";

export const Route = createFileRoute("/_station/verdade")({
  head: () => ({
    meta: [
      { title: "Verdade operacional — K∧LINE" },
      {
        name: "description",
        content: "O manifesto da Estação Kaline: pedir, coordenar, nunca fingir.",
      },
      { property: "og:title", content: "Verdade operacional — K∧LINE" },
      {
        property: "og:description",
        content: "O manifesto da Estação Kaline: pedir, coordenar, nunca fingir.",
      },
    ],
  }),
  component: () => (
    <div>
      <PrincipleCard />
    </div>
  ),
});
