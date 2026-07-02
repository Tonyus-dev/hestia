import { KalineMark } from "./KalineMark";
import kalineAvatar from "@/assets/kaline-avatar.png.asset.json";

export function HeroKaline() {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-obsidian)] px-6 md:px-14 py-16 md:py-24 fade-up">
      {/* single copper halo behind the avatar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 55% at 50% 45%, oklch(0.72 0.24 45 / 0.28), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.8  0 0 0 0 0.6  0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative flex flex-col items-center text-center">
        <p className="ka-kicker">Presença doméstica da Estação</p>

        <div className="mt-5">
          <KalineMark size="xl" />
        </div>

        <p className="mt-3 serif italic text-[color:var(--kaline-muted)] text-sm md:text-base tracking-[0.06em]">
          o sistema · a presença é <span className="text-[color:var(--kaline-amber)]">Kaline</span>
        </p>

        {/* avatar with copper halo */}
        <div className="mt-10 relative">
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-full"
            style={{
              background: "radial-gradient(circle, oklch(0.72 0.24 45 / 0.45), transparent 70%)",
              filter: "blur(18px)",
            }}
          />
          <div className="relative rounded-full p-[2px] bg-gradient-to-br from-[oklch(0.80_0.21_55/0.6)] via-transparent to-[oklch(0.31_0.12_12/0.6)]">
            <img
              src={kalineAvatar.url}
              alt="Kaline"
              className="block h-[180px] w-[180px] md:h-[220px] md:w-[220px] rounded-full object-cover"
              draggable={false}
            />
          </div>
        </div>

        <h1 className="mt-10 ka-title-display max-w-2xl">
          Uma presença doméstica<span className="text-[color:var(--kaline-copper)]">.</span>
        </h1>
        <p className="mt-5 text-[color:var(--kaline-muted)] text-base md:text-lg leading-relaxed max-w-xl">
          Um servidor pequeno, um HD paciente, uma televisão acesa devagar. Este painel apenas
          organiza, pede e mostra — nada aqui mede, executa ou finge.
        </p>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-4 py-2 ka-caps text-[color:var(--kaline-muted)] bg-black/40 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--kaline-ember)] kaline-pulse" />
          Station Agent ainda não conectado
        </div>
      </div>
    </section>
  );
}
