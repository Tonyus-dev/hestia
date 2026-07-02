import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { KalineMark } from "@/components/kaline/KalineMark";
import { LocalClock } from "@/components/kaline/LocalClock";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { GlassCard } from "@/components/kaline/GlassCard";
import { BookshelfPlaceholder } from "@/components/kaline/BookshelfPlaceholder";
import { cn } from "@/lib/utils";
import { midiaCards, devices, backupsCards, codiceCards, homeCards } from "@/content/kaline";
import kalineAvatar from "@/assets/kaline-avatar.png.asset.json";
import kaApple from "@/assets/ka-apple.png.asset.json";

type Mode = "presenca" | "leitura" | "casa" | "silencio";
const modes: { id: Mode; label: string }[] = [
  { id: "presenca", label: "Presença" },
  { id: "leitura", label: "Leitura" },
  { id: "casa", label: "Casa" },
  { id: "silencio", label: "Silêncio" },
];

export const Route = createFileRoute("/tv")({
  head: () => ({
    meta: [
      { title: "Kaline TV — Tela de presença" },
      { name: "description", content: "Tela cheia da Estação Kaline para a TV Box." },
      { property: "og:title", content: "Kaline TV — Tela de presença" },
      { property: "og:description", content: "Tela cheia da Estação Kaline para a TV Box." },
    ],
  }),
  component: TvPage,
});

function TvPage() {
  const [mode, setMode] = useState<Mode>("presenca");

  return (
    <div className="min-h-screen relative overflow-hidden tv-atmos-base">
      {/* slow drifting copper/ember plumes */}
      <div aria-hidden className="pointer-events-none absolute -inset-[10%] tv-atmos-drift" />
      {/* very slow conic sweep — barely perceptible light rotation */}
      <div aria-hidden className="pointer-events-none absolute -inset-[20%] tv-atmos-sweep" />
      {/* film grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.82  0 0 0 0 0.55  0 0 0 0.4 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* soft CRT scanlines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 tv-scanlines opacity-20" />
      {/* atmospheric vignette — must sit above color layers, below content */}
      <div aria-hidden className="pointer-events-none absolute inset-0 tv-vignette" />

      <div className="relative min-h-screen flex flex-col px-5 sm:px-8 md:px-16 py-8 md:py-14">
        {/* Header — mobile: 2 linhas empilhadas; md+: wordmark absolutamente centralizado */}
        <header className="relative flex flex-col gap-3 md:flex-row md:items-center">
          {/* linha 1 mobile: wordmark centralizado + relógio compacto */}
          <div className="flex items-center justify-between gap-3 md:contents">
            <span className="ka-caps-xs hidden md:inline">Tela de presença</span>
            <Link
              to="/"
              className="inline-flex items-center gap-2 md:absolute md:left-1/2 md:-translate-x-1/2 md:gap-3"
              aria-label="K∧LINE. — voltar ao painel"
            >
              <KalineMark size="lg" />
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--kaline-amber)] shadow-[0_0_14px_oklch(0.82_0.19_60/0.8)]"
              />
            </Link>
            <LocalClock
              className="md:ml-auto md:text-right text-lg sm:text-xl md:text-3xl serif text-[color:var(--kaline-muted)] text-right shrink-0"
              captionClassName="hidden md:block"
            />
          </div>
          {/* eyebrow em linha própria no mobile */}
          <span className="ka-caps-xs md:hidden">Tela de presença</span>
        </header>

        {/* Mode tabs */}
        {mode !== "silencio" && (
          <nav className="mt-8 flex flex-wrap gap-2 stagger">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "px-4 py-2 rounded-full border text-[11px] uppercase tracking-[0.28em] press-scale",
                  mode === m.id
                    ? "border-[color:var(--kaline-gold)]/60 text-[color:var(--kaline-text)] bg-[color:var(--kaline-copper)]/12"
                    : "border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-text)]",
                )}
              >
                {m.label}
              </button>
            ))}
          </nav>
        )}

        <main key={mode} className="flex-1 mt-10 md:mt-14 fade-up">
          {mode === "presenca" && <PresencaMode />}
          {mode === "leitura" && <LeituraMode />}
          {mode === "casa" && <CasaMode />}
          {mode === "silencio" && <SilencioMode onExit={() => setMode("presenca")} />}
        </main>

        <footer className="mt-10 flex items-center justify-between ka-caps">
          <Link to="/" className="hover:text-[color:var(--kaline-copper)] transition">
            ← voltar ao painel
          </Link>
          <span>protótipo visual · nada aqui é leitura real</span>
        </footer>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada, Antônio.";
  if (h < 12) return "Bom dia, Antônio.";
  if (h < 18) return "Boa tarde, Antônio.";
  return "Boa noite, Antônio.";
}

function ModeHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[color:var(--kaline-copper)]/60" />
        <p className="ka-kicker">{kicker}</p>
      </div>
      <h1 className="mt-5 ka-title-display">
        {title}
        <span className="text-[color:var(--kaline-copper)]">.</span>
      </h1>
      {sub && <p className="mt-5 text-[color:var(--kaline-muted)] text-lg max-w-2xl">{sub}</p>}
    </div>
  );
}

function PresencaMode() {
  const essenciais = homeCards.slice(0, 4);
  return (
    <div>
      <div className="flex items-center gap-6 md:gap-8">
        <div className="relative shrink-0">
          <span
            aria-hidden
            className="absolute -inset-4 rounded-full bg-[color:var(--kaline-copper)]/25 blur-2xl"
          />
          <img
            src={kalineAvatar.url}
            alt="Retrato da Kaline"
            className="relative h-24 w-24 md:h-32 md:w-32 rounded-full border border-[color:var(--kaline-copper)]/50 shadow-[0_0_40px_-10px_oklch(0.72_0.24_45/0.6)] select-none"
            draggable={false}
          />
        </div>
        <div className="min-w-0">
          <ModeHeader kicker="Modo Presença" title={greeting()} />
        </div>
      </div>
      <p className="mt-8 text-[color:var(--kaline-muted)] text-lg md:text-xl max-w-2xl">
        A Estação está acordada em modo visual. Nada aqui mede ou executa — apenas mostra que a casa
        continua de pé.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4 stagger">
        {essenciais.map((c) => (
          <GlassCard key={c.title} className="py-8">
            <div className="flex items-start justify-between gap-3">
              <h3 className="kaline-serif text-2xl text-[color:var(--kaline-text)] leading-tight">
                {c.title}
              </h3>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-3 text-[color:var(--kaline-muted)]">{c.subtitle}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function LeituraMode() {
  const cards = codiceCards.slice(0, 4);
  return (
    <div>
      <ModeHeader
        kicker="Modo Leitura"
        title="Códice · biblioteca viva"
        sub="Uma estante ainda planejada. Nenhum livro está sendo listado — nem real, nem inventado."
      />

      <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_1fr]">
        <BookshelfPlaceholder />
        <div className="grid gap-4 content-start">
          {cards.map((c) => (
            <GlassCard key={c.title} className="flex items-center justify-between gap-4">
              <div>
                <h3 className="kaline-serif text-2xl text-[color:var(--kaline-text)]">{c.title}</h3>
                <p className="text-[color:var(--kaline-muted)] mt-1">{c.subtitle}</p>
              </div>
              <StatusBadge status={c.status} />
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function CasaMode() {
  return (
    <div>
      <ModeHeader
        kicker="Modo Casa"
        title="A malha doméstica"
        sub="Dispositivos, mídia, backups e próximos passos — como planos, não como leituras."
      />

      <div className="mt-10 grid gap-6 xl:grid-cols-3">
        <TvColumn
          title="Dispositivos"
          items={devices.map((d) => ({ title: d.name, subtitle: d.role, status: d.status }))}
        />
        <TvColumn title="Mídia" items={midiaCards.slice(0, 4)} />
        <TvColumn title="Backups" items={backupsCards.slice(0, 4)} />
      </div>
    </div>
  );
}

function TvColumn({
  title,
  items,
}: {
  title: string;
  items: { title: string; subtitle: string; status: import("@/content/kaline").StatusVariant }[];
}) {
  return (
    <div>
      <p className="kaline-eyebrow mb-4">{title}</p>
      <div className="grid gap-3">
        {items.map((i) => (
          <GlassCard key={i.title} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="kaline-serif text-xl text-[color:var(--kaline-text)] leading-tight">
                  {i.title}
                </h4>
                <p className="text-sm text-[color:var(--kaline-muted)] mt-1">{i.subtitle}</p>
              </div>
              <StatusBadge status={i.status} />
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function SilencioMode({ onExit }: { onExit: () => void }) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-10">
      <div className="relative">
        <span
          aria-hidden
          className="absolute -inset-8 rounded-full bg-[color:var(--kaline-ember)]/12 blur-3xl"
        />
        <img
          src={kaApple.url}
          alt=""
          aria-hidden
          className="relative h-48 md:h-64 w-auto ember-glow select-none"
          draggable={false}
        />
      </div>
      <KalineMark size="lg" />
      <LocalClock className="text-6xl md:text-8xl" />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--kaline-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--kaline-ember)] kaline-pulse" />
        Aguardando Station Agent
      </div>
      <button
        onClick={onExit}
        className="mt-4 text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)] hover:text-[color:var(--kaline-copper)] transition"
      >
        sair do silêncio
      </button>
    </div>
  );
}
