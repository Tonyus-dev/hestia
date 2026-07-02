import { naoFaz, regraDaEstacao } from "@/content/kaline";

export function PrincipleCard() {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[color:var(--kaline-copper)]/45 bg-[color:var(--kaline-ember-bg)] px-8 md:px-14 py-14">
      <div className="pointer-events-none absolute inset-0 kaline-halo-ember" />
      <div className="pointer-events-none absolute inset-0 kaline-halo-copper opacity-70" />

      <div className="relative grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="kaline-eyebrow">Verdade operacional · manifesto</p>
          <blockquote className="mt-5 kaline-serif text-[color:var(--kaline-text)] text-3xl md:text-4xl leading-[1.2]">
            “A Central não finge ser servidor. Ela{" "}
            <span className="text-[color:var(--kaline-copper)]">organiza</span>,{" "}
            <span className="text-[color:var(--kaline-copper)]">pede</span>,{" "}
            <span className="text-[color:var(--kaline-copper)]">mostra</span> e{" "}
            <span className="text-[color:var(--kaline-copper)]">coordena</span>. O que ainda não
            está conectado aparece como aguardando, planejado ou não verificado.”
          </blockquote>

          <div className="mt-10">
            <p className="kaline-eyebrow mb-4">A regra da Estação</p>
            <ol className="grid gap-2">
              {regraDaEstacao.map((line, i) => (
                <li
                  key={line}
                  className="kaline-serif text-xl md:text-2xl text-[color:var(--kaline-text)] flex items-baseline gap-4"
                >
                  <span className="text-[color:var(--kaline-copper)] text-sm tabular-nums w-6">
                    0{i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="kaline-glass p-6 self-start">
          <p className="kaline-eyebrow mb-4">O que esta versão ainda não faz</p>
          <ul className="grid gap-2 text-[color:var(--kaline-muted)]">
            {naoFaz.map((n) => (
              <li key={n} className="flex gap-3 text-[15px]">
                <span className="text-[color:var(--kaline-ember)]">×</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-faint)]">
            honestidade antes de fingimento
          </p>
        </div>
      </div>
    </section>
  );
}
