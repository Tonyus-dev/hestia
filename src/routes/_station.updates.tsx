import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  hestiaApi,
  STATION_IDS,
  type StationId,
  type StationUpdates,
  type UpdatePackageItem,
} from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { DataCard } from "@/components/hestia/shared/DataCard";
import { Row } from "@/components/hestia/shared/Row";

export const Route = createFileRoute("/_station/updates")({ component: UpdatesDoDia });

const STATION_NAMES: Record<string, string> = {
  desktop: "Servidor",
  tvbox: "TV Box",
  pocket: "Pocket",
  baby: "Baby",
  mini: "Mini",
  max: "MAX",
};

type SelectedStationModal = {
  stationName: string;
  updates: UpdatePackageItem[];
} | null;

function UpdatesDoDia() {
  const [selectedModal, setSelectedModal] = useState<SelectedStationModal>(null);

  // Consultar todas as Stations registradas
  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="kaline-eyebrow">/updates</p>
          <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)]">Updates do Dia</h1>
          <p className="mt-1 text-xs text-[color:var(--kaline-muted)]">
            Central visual de diagnóstico e atualizações das Stations reais
          </p>
        </div>
      </header>

      <UpdatesSummary />

      <section className="space-y-4">
        <h2 className="serif text-xl text-[color:var(--kaline-text)]">Máquinas Registradas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(STATION_IDS as StationId[]).map((id) => (
            <StationUpdateCard
              key={id}
              stationId={id}
              onInspectPackages={(updates) =>
                setSelectedModal({ stationName: STATION_NAMES[id] || id, updates })
              }
            />
          ))}
        </div>
      </section>

      {/* Modal de Detalhes dos Pacotes */}
      {selectedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="packages-modal-title"
        >
          <div className="bg-[#121212] border border-[color:var(--kaline-border-copper)] rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-[color:var(--kaline-border-copper)] flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
                  Pacotes disponíveis
                </p>
                <h3
                  id="packages-modal-title"
                  className="serif text-xl text-[color:var(--kaline-text)]"
                >
                  {selectedModal.stationName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModal(null)}
                className="px-3 py-1.5 rounded text-xs bg-white/5 hover:bg-white/10 text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] border border-white/10"
              >
                Fechar
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
              {selectedModal.updates.length === 0 ? (
                <p className="text-sm text-[color:var(--kaline-muted)] italic">
                  Nenhuma atualização pendente nesta máquina.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedModal.updates.map((pkg) => (
                    <div
                      key={pkg.package}
                      className="p-3 rounded border border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-[color:var(--kaline-text)]">
                            {pkg.package}
                          </span>
                          {pkg.security === true ? (
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Segurança
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-white/5 text-[color:var(--kaline-faint)] border border-white/10">
                              Não classificada
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[color:var(--kaline-muted)] mt-1 font-mono">
                          {pkg.installedVersion} →{" "}
                          <span className="text-[color:var(--kaline-ember)]">
                            {pkg.candidateVersion}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[color:var(--kaline-border-copper)] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedModal(null)}
                className="px-4 py-2 rounded text-xs uppercase tracking-wider font-medium bg-[color:var(--kaline-copper)]/20 hover:bg-[color:var(--kaline-copper)]/30 text-[color:var(--kaline-text)] border border-[color:var(--kaline-copper)]/40"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpdatesSummary() {
  const desktopUpdates = useApi(() => hestiaApi.stationUpdates("desktop"));
  const tvboxUpdates = useApi(() => hestiaApi.stationUpdates("tvbox"));
  const pocketUpdates = useApi(() => hestiaApi.stationUpdates("pocket"));
  const babyUpdates = useApi(() => hestiaApi.stationUpdates("baby"));
  const miniUpdates = useApi(() => hestiaApi.stationUpdates("mini"));
  const maxUpdates = useApi(() => hestiaApi.stationUpdates("max"));

  const allUpdatesState = [
    desktopUpdates.state,
    tvboxUpdates.state,
    pocketUpdates.state,
    babyUpdates.state,
    miniUpdates.state,
    maxUpdates.state,
  ];

  let totalUpdatesCount = 0;
  let totalSecurityCount = 0;

  for (const st of allUpdatesState) {
    if (st.status === "ok" && st.data.ok === true) {
      totalUpdatesCount += st.data.totalUpdates;
      totalSecurityCount += st.data.securityUpdates || 0;
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="p-4 rounded border border-[color:var(--kaline-border-copper)] bg-[#121212]">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
          Total de Updates
        </p>
        <p className="mt-2 text-2xl font-mono font-semibold text-[color:var(--kaline-ember)]">
          {totalUpdatesCount}
        </p>
      </div>

      <div className="p-4 rounded border border-[color:var(--kaline-border-copper)] bg-[#121212]">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
          Segurança Confirmada
        </p>
        <p className="mt-2 text-2xl font-mono font-semibold text-amber-400">{totalSecurityCount}</p>
        <p className="mt-1 text-[10px] text-[color:var(--kaline-faint)]">
          {totalSecurityCount} atualizações de segurança confirmadas
        </p>
      </div>

      <div className="p-4 rounded border border-[color:var(--kaline-border-copper)] bg-[#121212]">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
          Modo
        </p>
        <p className="mt-2 text-sm font-mono text-emerald-400 font-medium uppercase">READ-ONLY</p>
        <p className="mt-1 text-[10px] text-[color:var(--kaline-faint)]">Sem privilégios / sudo</p>
      </div>

      <div className="p-4 rounded border border-[color:var(--kaline-border-copper)] bg-[#121212]">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
          Última consulta
        </p>
        <p className="mt-2 text-xs font-mono text-[color:var(--kaline-muted)]">
          {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function StationUpdateCard({
  stationId,
  onInspectPackages,
}: {
  stationId: StationId;
  onInspectPackages: (updates: UpdatePackageItem[]) => void;
}) {
  const name = STATION_NAMES[stationId] || stationId;
  const conn = useApi(() => hestiaApi.stationConnection(stationId));
  const sys = useApi(() => hestiaApi.stationSystem(stationId));
  const upd = useApi(() => hestiaApi.stationUpdates(stationId));

  const isOnline = conn.state.status === "ok" && conn.state.data.state === "available";
  const isNotConfigured = conn.state.status === "ok" && conn.state.data.state === "not_configured";
  const isOffline =
    conn.state.status === "unavailable" ||
    (conn.state.status === "ok" && conn.state.data.state === "unavailable");

  const updatesData: StationUpdates | null = upd.state.status === "ok" ? upd.state.data : null;

  const isUnsupported = updatesData?.ok === false && updatesData?.status === "unsupported";
  const isOkUpdates = updatesData?.ok === true && updatesData?.status === "ok";

  const handleRefresh = () => {
    conn.retry();
    sys.retry();
    upd.retry();
  };

  return (
    <DataCard
      title={name}
      eyebrow={stationId}
      status={isOnline ? "ok" : isNotConfigured ? "idle" : "error"}
      defaultOpen
    >
      <div className="space-y-3">
        {/* Status Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            {isOnline && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ONLINE
              </span>
            )}
            {isOffline && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                OFFLINE
              </span>
            )}
            {isNotConfigured && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-white/5 text-[color:var(--kaline-faint)] border border-white/10">
                NÃO CONFIGURADO
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-[color:var(--kaline-faint)]">
            {conn.state.status === "ok"
              ? new Date(conn.state.data.checkedAt).toLocaleTimeString()
              : "—"}
          </span>
        </div>

        {/* System Info */}
        {sys.state.status === "ok" && sys.state.data.ok === true && (
          <Row
            k="Sistema"
            v={`${sys.state.data.system.hostname} · ${sys.state.data.system.platform} ${sys.state.data.system.release} (${sys.state.data.system.arch})`}
          />
        )}

        {/* Updates Info */}
        {isUnsupported && (
          <div className="p-3 rounded border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Updates</span>
            <span className="font-mono">NÃO SUPORTADO ({updatesData.reason})</span>
          </div>
        )}

        {isOkUpdates && (
          <div className="space-y-2">
            <Row
              k="Atualizações disponíveis"
              v={`${updatesData.totalUpdates} ${
                updatesData.securityUpdates
                  ? `(${updatesData.securityUpdates} de segurança confirmadas)`
                  : ""
              }`}
            />

            {updatesData.rebootRequired && (
              <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[11px] font-semibold uppercase tracking-wider">
                REINICIALIZAÇÃO NECESSÁRIA
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={upd.refreshing}
            className="px-3 py-1.5 rounded text-xs bg-white/5 hover:bg-white/10 text-[color:var(--kaline-text)] border border-white/10 disabled:opacity-50 transition-colors"
          >
            {upd.refreshing ? "Consultando..." : "Consultar"}
          </button>

          {isOkUpdates && updatesData.updates.length > 0 && (
            <button
              type="button"
              onClick={() => onInspectPackages(updatesData.updates)}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[color:var(--kaline-copper)]/20 hover:bg-[color:var(--kaline-copper)]/30 text-[color:var(--kaline-text)] border border-[color:var(--kaline-copper)]/40 transition-colors"
            >
              Ver pacotes ({updatesData.updates.length})
            </button>
          )}
        </div>
      </div>
    </DataCard>
  );
}
