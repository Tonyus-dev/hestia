import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { EndpointList } from "@/components/kaline/EndpointList";
import { devices, endpointsDevices } from "@/content/kaline";

export const Route = createFileRoute("/_station/dispositivos")({
  head: () => ({
    meta: [
      { title: "Dispositivos — K∧LINE" },
      {
        name: "description",
        content: "A malha doméstica da Kaline: servidor, TV Box, TV, notebook, celular.",
      },
      { property: "og:title", content: "Dispositivos — K∧LINE" },
      {
        property: "og:description",
        content: "A malha doméstica da Kaline: servidor, TV Box, TV, notebook, celular.",
      },
    ],
  }),
  component: () => (
    <div>
      <SectionHeader
        eyebrow="Dispositivos"
        title="A malha da casa"
        subtitle="O navegador não expõe o nome do dispositivo. Aqui, cada peça aparece pelo papel que exerce na Estação, não por leitura remota."
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {devices.map((d) => (
          <GlassCard key={d.name} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h3 className="kaline-serif text-xl leading-tight text-[color:var(--kaline-text)] min-w-0">
                {d.name}
              </h3>
              <StatusBadge status={d.status} />
            </div>
            <p className="text-sm text-[color:var(--kaline-muted)]">{d.role}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <EndpointList items={endpointsDevices} />
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Nomear este dispositivo</p>
          <p className="text-sm text-[color:var(--kaline-muted)]">
            O Station Agent será o único capaz de reconhecer e nomear as peças da casa. Enquanto ele
            não chega, esta ação fica em pausa.
          </p>
          <button
            type="button"
            disabled
            aria-disabled
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-muted)] opacity-55 cursor-not-allowed"
          >
            Nomear dispositivo
            <span className="text-[9px] tracking-[0.22em] text-[color:var(--kaline-amber)] border border-[color:var(--kaline-amber)]/40 rounded-full px-1.5 py-0.5">
              Planejado
            </span>
          </button>
        </GlassCard>
      </div>
    </div>
  ),
});
