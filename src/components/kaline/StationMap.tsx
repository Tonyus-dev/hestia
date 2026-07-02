import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { mapNodes, mapEdges, mapLegend, statusLabel, type MapNode } from "@/content/kaline";
import { cn } from "@/lib/utils";

type Dir = "left" | "right" | "up" | "down";

function findNeighbor(current: MapNode, dir: Dir): MapNode | null {
  const candidates = mapNodes.filter((n) => {
    if (n.id === current.id) return false;
    const dx = n.x - current.x;
    const dy = n.y - current.y;
    if (dir === "left") return dx < -1 && Math.abs(dy) <= Math.abs(dx) * 1.5;
    if (dir === "right") return dx > 1 && Math.abs(dy) <= Math.abs(dx) * 1.5;
    if (dir === "up") return dy < -1 && Math.abs(dx) <= Math.abs(dy) * 1.5;
    return dy > 1 && Math.abs(dx) <= Math.abs(dy) * 1.5;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const da = (a.x - current.x) ** 2 + (a.y - current.y) ** 2;
    const db = (b.x - current.x) ** 2 + (b.y - current.y) ** 2;
    return da - db;
  });
  return candidates[0];
}

export function StationMap({ tv = false }: { tv?: boolean }) {
  const byId = useMemo(() => Object.fromEntries(mapNodes.map((n) => [n.id, n])), []);
  const [selectedId, setSelectedId] = useState<string>(mapNodes[0].id);
  const nodeRefs = useRef<Record<string, SVGGElement | null>>({});

  const nodeW = tv ? 240 : 176;
  const nodeH = tv ? 96 : 68;
  const glyphSize = tv ? 30 : 20;
  const nameSize = tv ? 22 : 15;
  const roleSize = tv ? 15 : 10;
  const statusSize = tv ? 12 : 8.5;
  const ringR = tv ? 150 : 110;
  const halfW = nodeW / 2;
  const halfH = nodeH / 2;
  const padL = tv ? 22 : 16;

  const selected = byId[selectedId];

  const focusNode = (id: string) => {
    setSelectedId(id);
    // defer to let React render, then move DOM focus
    requestAnimationFrame(() => {
      nodeRefs.current[id]?.focus();
    });
  };

  const handleKey = (e: KeyboardEvent<SVGGElement>, node: MapNode) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedId(node.id);
      return;
    }
    const dirMap: Record<string, Dir> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const dir = dirMap[e.key];
    if (dir) {
      e.preventDefault();
      const next = findNeighbor(node, dir);
      if (next) focusNode(next.id);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusNode(mapNodes[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      focusNode(mapNodes[mapNodes.length - 1].id);
    }
  };

  return (
    <figure
      aria-labelledby="station-map-caption"
      className={cn("kaline-glass", tv ? "p-6 md:p-10" : "p-3 sm:p-4 md:p-6")}
    >
      <figcaption id="station-map-caption" className="sr-only">
        Mapa interativo da Estação Kaline. Navegue com Tab e setas do teclado; Enter ou Espaço confirma a seleção. Os detalhes do ponto ativo aparecem logo abaixo do mapa.
      </figcaption>
      <div
        id="station-map-canvas"
        role="group"
        aria-label="Área navegável do mapa da Estação"
        tabIndex={-1}
        className="-mx-1 sm:mx-0 overflow-x-auto scroll-mt-24 focus:outline-none"
      >
        <div
          className={cn(
            "relative w-full rounded-[14px] overflow-hidden bg-[color:var(--kaline-ember-bg)] border border-[color:var(--kaline-border-copper)]",
            tv ? "min-w-[900px] aspect-[16/9]" : "min-w-[560px] aspect-[16/10]",
          )}
        >
          <div className="absolute inset-0 kaline-halo-copper opacity-80" />
          <div className="absolute inset-0 kaline-halo-ember" />
          <svg
            viewBox="0 0 1000 620"
            preserveAspectRatio="xMidYMid meet"
            className="relative w-full h-full"
            role="img"
            aria-label="Mapa da Estação Kaline: servidor central, HD de backup, TV Box, notebook, celular e agentes pendentes conectados por linhas de rede. Use Tab para entrar no mapa e as setas para navegar entre os pontos."
          >
            <defs>
              <linearGradient id="wire" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="oklch(0.72 0.24 45)" stopOpacity="0.75" />
                <stop offset="1" stopColor="oklch(0.31 0.12 12)" stopOpacity="0.65" />
              </linearGradient>
            </defs>

            <circle
              cx={byId.server.x}
              cy={byId.server.y}
              r={ringR}
              fill="none"
              stroke="oklch(0.80 0.21 55)"
              strokeOpacity="0.32"
              strokeDasharray={tv ? "6 8" : "4 6"}
              strokeWidth={tv ? 1.4 : 1}
            />

            {mapEdges.map((e) => {
              const a = byId[e.from];
              const b = byId[e.to];
              const active = e.from === selectedId || e.to === selectedId;
              return (
                <line
                  key={`${e.from}-${e.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="url(#wire)"
                  strokeWidth={active ? (tv ? 2.6 : 1.8) : tv ? 1.8 : 1.1}
                  strokeDasharray={e.dashed ? (tv ? "5 7" : "3 5") : "0"}
                  opacity={active ? 1 : 0.85}
                />
              );
            })}

            {mapNodes.map((n) => {
              const isSelected = n.id === selectedId;
              const label = `${n.name}, ${n.role}, estado: ${statusLabel[n.status]}`;
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    nodeRefs.current[n.id] = el;
                  }}
                  transform={`translate(${n.x}, ${n.y})`}
                  tabIndex={isSelected ? 0 : -1}
                  role="button"
                  aria-label={label}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => handleKey(e, n)}
                  onClick={() => setSelectedId(n.id)}
                  onFocus={() => setSelectedId(n.id)}
                  className="kaline-map-node cursor-pointer outline-none"
                  style={{ transition: "transform 180ms ease" }}
                >
                  {isSelected && (
                    <rect
                      x={-halfW - 6}
                      y={-halfH - 6}
                      width={nodeW + 12}
                      height={nodeH + 12}
                      rx={tv ? 20 : 16}
                      fill="none"
                      stroke="oklch(0.86 0.22 55)"
                      strokeWidth={tv ? 2.4 : 1.8}
                      strokeOpacity="0.9"
                    />
                  )}
                  <rect
                    x={-halfW}
                    y={-halfH}
                    width={nodeW}
                    height={nodeH}
                    rx={tv ? 16 : 12}
                    fill={isSelected ? "oklch(0.18 0.045 30 / 0.95)" : "oklch(0.14 0.025 25 / 0.85)"}
                    stroke={
                      isSelected
                        ? "oklch(0.80 0.21 55 / 0.85)"
                        : "oklch(0.80 0.21 55 / 0.32)"
                    }
                    strokeWidth={isSelected ? (tv ? 1.8 : 1.4) : tv ? 1.4 : 1}
                  />
                  <text
                    x={-halfW + padL}
                    y={tv ? -14 : -8}
                    fill="oklch(0.80 0.21 55)"
                    fontFamily="Cormorant Garamond, serif"
                    fontSize={glyphSize}
                  >
                    {n.glyph}
                  </text>
                  <text
                    x={-halfW + padL + (tv ? 28 : 20)}
                    y={tv ? -14 : -8}
                    fill="oklch(0.94 0.025 75)"
                    fontFamily="Cormorant Garamond, serif"
                    fontSize={nameSize}
                  >
                    {n.name}
                  </text>
                  <text
                    x={-halfW + padL}
                    y={tv ? 12 : 12}
                    fill="oklch(0.78 0.035 75)"
                    fontFamily="Inter, sans-serif"
                    fontSize={roleSize}
                  >
                    {n.role}
                  </text>
                  <text
                    x={-halfW + padL}
                    y={tv ? 32 : 26}
                    fill="oklch(0.58 0.028 55)"
                    fontFamily="Inter, sans-serif"
                    fontSize={statusSize}
                    letterSpacing={tv ? 2.2 : 1.5}
                  >
                    {statusLabel[n.status].toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <section
        aria-labelledby="station-map-list-title"
        className={cn(
          "mt-4 rounded-[12px] border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-ember-bg)]/60",
          tv ? "p-6" : "p-3 sm:p-4",
        )}
      >
        <h3
          id="station-map-list-title"
          className={cn(
            "kaline-serif text-[color:var(--kaline-copper)]",
            tv ? "text-2xl" : "text-base",
          )}
        >
          Lista dos componentes
        </h3>
        <p
          className={cn(
            "mt-1 text-[color:var(--kaline-muted)]/80",
            tv ? "text-base" : "text-xs",
          )}
        >
          Alternativa ao diagrama: navegue por Tab e ative com Enter ou Espaço para selecionar um ponto.
        </p>
        <ul
          aria-label="Componentes da Estação Kaline"
          className={cn(
            "mt-3 grid gap-2",
            tv ? "md:grid-cols-2 gap-3" : "sm:grid-cols-2",
          )}
        >
          {mapNodes.map((n) => {
            const isSelected = n.id === selectedId;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${n.name}, ${n.role}, estado: ${statusLabel[n.status]}`}
                  onClick={() => setSelectedId(n.id)}
                  className={cn(
                    "w-full text-left rounded-[10px] border px-3 py-2 flex items-baseline gap-3",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--kaline-copper)]/60",
                    "min-h-11",
                    isSelected
                      ? "border-[color:var(--kaline-copper)]/70 bg-[color:var(--kaline-copper)]/10 text-[color:var(--kaline-text)]"
                      : "border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)] hover:border-[color:var(--kaline-copper)]/50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "kaline-serif text-[color:var(--kaline-copper)]",
                      tv ? "text-2xl" : "text-lg",
                    )}
                  >
                    {n.glyph}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "block kaline-serif",
                        tv ? "text-xl" : "text-sm",
                      )}
                    >
                      {n.name}
                    </span>
                    <span
                      className={cn(
                        "block text-[color:var(--kaline-muted)]/80",
                        tv ? "text-base" : "text-xs",
                      )}
                    >
                      {n.role}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "shrink-0 uppercase tracking-widest",
                      tv ? "text-xs" : "text-[9px]",
                      isSelected
                        ? "text-[color:var(--kaline-copper)]"
                        : "text-[color:var(--kaline-muted)]/70",
                    )}
                  >
                    {statusLabel[n.status]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>


      <section
        aria-labelledby="station-map-details-title"
        role="status"
        aria-live="polite"
        className={cn(
          "mt-4 rounded-[12px] border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-ember-bg)]/60",
          tv ? "p-6" : "p-3 sm:p-4",
        )}
      >
        <h3 id="station-map-details-title" className="sr-only">
          Detalhes do ponto selecionado
        </h3>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className={cn(
              "kaline-serif text-[color:var(--kaline-copper)]",
              tv ? "text-3xl" : "text-lg",
            )}
          >
            {selected.glyph} {selected.name}
          </span>
          <span
            className={cn(
              "uppercase tracking-widest text-[color:var(--kaline-muted)]",
              tv ? "text-sm" : "text-[10px]",
            )}
          >
            {statusLabel[selected.status]}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 text-[color:var(--kaline-muted)]",
            tv ? "text-xl" : "text-sm",
          )}
        >
          {selected.role}
        </p>
        <p
          className={cn(
            "mt-2 text-[color:var(--kaline-muted)]/70",
            tv ? "text-base" : "text-xs",
          )}
        >
          Use as setas do teclado para navegar entre os pontos. Enter ou Espaço confirma a seleção.
        </p>
      </section>

      <section aria-labelledby="station-map-legend-title">
        <h3 id="station-map-legend-title" className="sr-only">
          Legenda dos pontos do mapa
        </h3>
        <dl
          className={cn(
            "grid gap-3",
            tv ? "mt-10 md:grid-cols-2 gap-x-10 gap-y-5" : "mt-6 md:grid-cols-2",
          )}
        >
          {mapLegend.map((l) => (
            <div
              key={l.name}
              className={cn(
                "flex items-baseline gap-3 border-b border-[color:var(--kaline-border-copper)]/60",
                tv ? "pb-4" : "pb-2",
              )}
            >
              <dt
                className={cn(
                  "kaline-serif text-[color:var(--kaline-copper)]",
                  tv ? "text-2xl min-w-[220px]" : "text-sm min-w-[130px]",
                )}
              >
                {l.name}
              </dt>
              <dd
                className={cn(
                  "text-[color:var(--kaline-muted)]",
                  tv ? "text-xl leading-relaxed" : "text-sm",
                )}
              >
                {l.role}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </figure>
  );
}
