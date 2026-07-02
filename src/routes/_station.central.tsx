import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { HardwareSpec } from "@/components/kaline/HardwareSpec";
import { EndpointList } from "@/components/kaline/EndpointList";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { GlassCard } from "@/components/kaline/GlassCard";
import { hardware, centralStatus, endpointsCentral } from "@/content/kaline";

export const Route = createFileRoute("/_station/central")({
  head: () => ({
    meta: [
      { title: "Central — Servidor Kaline" },
      {
        name: "description",
        content: "O servidor doméstico da Estação Kaline, sem métricas falsas.",
      },
      { property: "og:title", content: "Central — Servidor Kaline" },
      {
        property: "og:description",
        content: "O servidor doméstico da Estação Kaline, sem métricas falsas.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Central · Servidor"
        title="O corpo da Estação"
        subtitle="Nenhum número aqui vem de leitura real. Esta versão apenas descreve o que o servidor será — sem CPU%, sem barras, sem invenção."
      />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <GlassCard>
          <p className="kaline-eyebrow mb-4">Perfil planejado</p>
          <HardwareSpec items={hardware} />
        </GlassCard>

        <GlassCard>
          <p className="kaline-eyebrow mb-4">Status operacional</p>
          <ul className="grid gap-3">
            {centralStatus.map((s) => (
              <li
                key={s.label}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[color:var(--kaline-border-copper)]/50 pb-2.5 last:border-b-0"
              >
                <span className="text-[color:var(--kaline-text)] text-sm min-w-0">{s.label}</span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-faint)]">
            leitura real chega com o Station Agent
          </p>
        </GlassCard>
      </div>

      <div className="mt-6">
        <EndpointList items={endpointsCentral} />
      </div>
    </div>
  ),
});
