import { createFileRoute } from "@tanstack/react-router";
import { hestiaApi } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { DataCard } from "@/components/hestia/shared/DataCard";
import { Row } from "@/components/hestia/shared/Row";
export const Route = createFileRoute("/_station/servicos")({ component: Servicos });
function Servicos() {
  const s = useApi(hestiaApi.services);
  const b = useApi(hestiaApi.serviceBindings);
  return (
    <div className="space-y-6">
      <header>
        <p className="kaline-eyebrow">/servicos</p>
        <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Serviços</h1>
      </header>
      <DataCard
        title="Matriz real"
        eyebrow="systemd"
        status={
          s.state.status === "ok" ? "ok" : s.state.status === "unavailable" ? "error" : "loading"
        }
        defaultOpen
      >
        {s.state.status === "ok" &&
          s.state.data.items.map((x) => (
            <Row
              key={x.name}
              k={x.name}
              v={`${x.status} · ${new Date(x.checkedAt).toLocaleString()}`}
            />
          ))}
        {s.state.status === "unavailable" && (
          <UnavailableNote
            message={s.state.message}
            details={s.state.details}
            onRetry={s.retry}
            refreshing={s.refreshing}
          />
        )}
      </DataCard>
      <DataCard
        title="Vínculos"
        eyebrow="serviços"
        status={b.state.status === "ok" ? "ok" : "idle"}
      >
        {b.state.status === "ok" &&
          b.state.data.map((x) => (
            <Row key={x.id} k={x.label} v={`${x.serviceName} · ${x.role}`} />
          ))}
      </DataCard>
    </div>
  );
}
