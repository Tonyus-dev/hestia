import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { ConfigBlock } from "@/components/kaline/ConfigBlock";
import { GlassCard } from "@/components/kaline/GlassCard";
import { configJson } from "@/content/kaline";

export const Route = createFileRoute("/_station/configuracao")({
  head: () => ({
    meta: [
      { title: "Configuração — Endereços e chaves" },
      {
        name: "description",
        content: "Configuração planejada da Estação Kaline em JSON estático.",
      },
      { property: "og:title", content: "Configuração — Endereços e chaves" },
      {
        property: "og:description",
        content: "Configuração planejada da Estação Kaline em JSON estático.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Configuração"
        title="O desenho técnico da casa"
        subtitle="Nenhum valor aqui foi lido. É apenas o formato que a Estação terá quando o Station Agent estiver de pé."
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <ConfigBlock content={configJson} />
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Próximo passo</p>
          <p className="kaline-serif text-2xl text-[color:var(--kaline-text)] leading-snug">
            Conectar o Station Agent local.
          </p>
          <p className="mt-3 text-sm text-[color:var(--kaline-muted)]">
            Um pequeno serviço rodando no servidor Kaline, ouvindo pedidos da UI e executando com
            responsabilidade no Linux. Sem ele, esta central permanece um painel bonito e honesto.
          </p>
        </GlassCard>
      </div>
    </div>
  ),
});
