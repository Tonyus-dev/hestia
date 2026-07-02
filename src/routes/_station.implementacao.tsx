import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@/components/kaline/SectionHeader";
import { GlassCard } from "@/components/kaline/GlassCard";
import { StatusBadge } from "@/components/kaline/StatusBadge";
import { TimelineStep } from "@/components/kaline/TimelineStep";
import { FolderTree } from "@/components/kaline/FolderTree";
import { ConfigBlock } from "@/components/kaline/ConfigBlock";
import type { StatusVariant } from "@/content/kaline";

export const Route = createFileRoute("/_station/implementacao")({
  head: () => ({
    meta: [
      { title: "Implementação — K∧LINE" },
      {
        name: "description",
        content:
          "Guia visual da primeira montagem da Estação Kaline: base física, serviços leves, presença visual e Station Agent.",
      },
      { property: "og:title", content: "Implementação — K∧LINE" },
      {
        property: "og:description",
        content: "Guia visual da primeira montagem da Estação Kaline. Não executa instalação.",
      },
    ],
  }),
  component: ImplementacaoPage,
});

type PhysicalItem = { name: string; status: StatusVariant };

const fisico: PhysicalItem[] = [
  { name: "PC velho i7", status: "not-verified" },
  { name: 'Monitor 20"', status: "not-verified" },
  { name: "HD 1 TB", status: "not-verified" },
  { name: "SSD 128 GB", status: "not-verified" },
  { name: "Clamper DPS", status: "not-verified" },
  { name: "Teclado USB", status: "not-verified" },
  { name: "Mini teclado / touchpad", status: "not-verified" },
  { name: "TV Box · Kaline Deck", status: "not-verified" },
  { name: "Fonte 5V 2A da TV Box", status: "not-verified" },
  { name: "Cabo HDMI", status: "not-verified" },
  { name: "Microfone USB", status: "planned" },
  { name: "Adaptador Wi-Fi", status: "planned" },
  { name: "Repetidor Wi-Fi", status: "planned" },
  { name: "Notebook de desenvolvimento", status: "not-verified" },
  { name: "TV", status: "not-verified" },
];

const fases: {
  step: string;
  titulo: string;
  itens: string[];
  status: StatusVariant;
}[] = [
  {
    step: "01",
    titulo: "Fase 1 — Base física",
    status: "not-verified",
    itens: [
      "Ligar o PC no Clamper.",
      "Conectar monitor.",
      "Conectar teclado.",
      "Confirmar Linux Mint funcionando.",
      "Confirmar rede local.",
      "Confirmar HD 1 TB visível.",
    ],
  },
  {
    step: "02",
    titulo: "Fase 2 — Porão da Kaline",
    status: "planned",
    itens: [
      "Criar pasta /KALINE no HD 1 TB.",
      "Criar subpastas codice, midia, backups, modelos, kaline-local e central.",
      "Separar arquivos pesados do SSD.",
    ],
  },
  {
    step: "03",
    titulo: "Fase 3 — Serviços leves",
    status: "planned",
    itens: [
      "Samba para arquivos.",
      "Syncthing para sincronização.",
      "Jellyfin para mídia.",
      "Tailscale para acesso remoto.",
    ],
  },
  {
    step: "04",
    titulo: "Fase 4 — Kaline Presence",
    status: "prototype",
    itens: [
      "Abrir painel no monitor.",
      "Abrir /tv na TV Box.",
      "Usar Kaline TV como tela de presença.",
    ],
  },
  {
    step: "05",
    titulo: "Fase 5 — Station Agent",
    status: "future",
    itens: [
      "Criar serviço local futuro.",
      "Ler status real do servidor.",
      "Expor endpoints locais.",
      "Conectar Kaline Presence ao servidor.",
    ],
  },
];

const servidorPerfil: string[] = [
  "Linux Mint Xfce",
  "Intel i7-2600",
  "8 GB RAM",
  "SSD 128 GB",
  "HD 1 TB",
  "NVIDIA GT 710",
];

const servidorPassos: string[] = [
  "Ligar o PC no Clamper.",
  "Entrar no Linux Mint.",
  "Confirmar que o HD de 1 TB aparece no gerenciador de arquivos.",
  "Definir o nome da máquina como kaline-central futuramente.",
  "Manter SSD para sistema.",
  "Usar HD 1 TB para /KALINE.",
];

const poraoTree = `/KALINE
  /codice
    /epubs
    /pdfs
    /cache
    /fichamentos

  /midia
    /videos
    /audios
    /imagens

  /backups
    /supabase
    /sqlite
    /exports

  /modelos
    /gguf
    /whisper
    /tts

  /kaline-local
    /memoria
    /logs
    /config

  /central
    /status
    /scripts
    /healthchecks`;

const servicos: { title: string; funcao: string; status: StatusVariant }[] = [
  { title: "Samba", funcao: "Compartilhar a pasta /KALINE na rede local.", status: "planned" },
  {
    title: "Syncthing",
    funcao: "Sincronizar pastas entre notebook, servidor e outros dispositivos.",
    status: "planned",
  },
  {
    title: "Jellyfin",
    funcao: "Organizar vídeos, áudios, aulas e mídia doméstica.",
    status: "planned",
  },
  {
    title: "Tailscale",
    funcao: "Acessar a Estação Kaline com segurança fora da rede local.",
    status: "planned",
  },
];

const deckSpec: string[] = [
  "Rockchip RK3229",
  "1 GB RAM",
  "8 GB storage",
  "HDMI",
  "USB",
  "Ethernet",
  "Android antigo",
];

const deckDeveFazer: string[] = [
  "Abrir Kaline TV.",
  "Abrir Jellyfin.",
  "Usar navegador.",
  "Ser controlada pelo mini teclado / touchpad.",
  "Exibir presença na TV.",
];

const deckNaoDeveFazer: string[] = [
  "Não ser servidor.",
  "Não rodar IA.",
  "Não rodar banco.",
  "Não guardar arquivos pesados.",
  "Não rodar Jellyfin server.",
  "Não compilar projeto.",
];

const deckPassos: string[] = [
  "Usar fonte correta 5V 2A.",
  "Conectar HDMI na TV.",
  "Conectar rede, de preferência cabo Ethernet se possível.",
  "Parear ou conectar mini teclado / touchpad.",
  "Testar navegador.",
  "Abrir a rota /tv da Kaline Presence.",
  "Deixar em tela cheia, se o navegador permitir.",
];

const kalineTvPassos: string[] = [
  "No PC servidor ou no preview, abrir /tv.",
  "Na TV Box, abrir o navegador.",
  "Digitar o endereço da Kaline Presence.",
  "Entrar no modo TV.",
  "Usar modo Presença, Leitura, Casa ou Silêncio.",
];

const testesManuais: string[] = [
  "O PC liga.",
  "O monitor mostra o painel.",
  "A TV Box liga.",
  "O mini teclado controla a TV Box.",
  "O navegador da TV Box abre a Kaline TV.",
  "O HD 1 TB aparece no Linux.",
  "A pasta /KALINE existe.",
  "O notebook consegue acessar a rede local.",
];

const aindaNao: string[] = [
  "Não instalar IA local agora.",
  "Não instalar Docker agora.",
  "Não transformar TV Box em servidor.",
  "Não criar backup complexo agora.",
  "Não criar painel com métricas falsas.",
  "Não mexer em particionamento sem backup.",
  "Não instalar tudo de uma vez.",
  "Não criar automação antes da estação respirar.",
];

const comandosFuturos = `# Comandos futuros — para conferir antes de usar
# nada aqui é executado pela Kaline Presence

lsblk
hostname
df -h`;

function Divider({ label }: { label: string }) {
  return (
    <div className="mt-14 md:mt-16 mb-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[color:var(--kaline-copper)]/40 to-transparent" />
      <span className="kaline-eyebrow text-[color:var(--kaline-faint)] whitespace-nowrap">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[color:var(--kaline-copper)]/40 to-transparent" />
    </div>
  );
}

function ImplementacaoPage() {
  return (
    <div>
      {/* Hero */}
      <SectionHeader
        eyebrow="Guia de Implementação · Primeira Montagem"
        title="Primeira Montagem"
        subtitle="Guia visual para tirar a Estação Kaline do papel e colocar o corpo da Kaline na mesa, na TV e na rede local."
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <StatusBadge status="prototype" />
      </div>

      <div className="mt-6 kaline-glass p-6 border border-[color:var(--kaline-copper)]/30">
        <p className="kaline-serif text-lg md:text-xl leading-snug text-[color:var(--kaline-text)]">
          A Estação Kaline nasce em camadas: primeiro a base física, depois os serviços leves,
          depois a presença visual, e só então o Station Agent.
        </p>
        <p className="mt-4 text-sm text-[color:var(--kaline-muted)]">
          Este guia não instala nada sozinho. Ele apenas organiza os próximos passos da Estação
          Kaline.
        </p>
      </div>

      {/* Checklist físico */}
      <Divider label="Checklist físico" />
      <SectionHeader
        eyebrow="Peças no chão"
        title="O corpo antes da respiração"
        subtitle="Cada peça aparece com estado honesto. Nada aqui é salvo, marcado ou executado."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fisico.map((f) => (
          <GlassCard key={f.name} className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="kaline-serif text-[15px] text-[color:var(--kaline-text)] min-w-0 break-words">
                {f.name}
              </span>
              <StatusBadge status={f.status} />
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Fases */}
      <Divider label="Fases de instalação" />
      <SectionHeader
        eyebrow="Ordem preguiçosa e segura"
        title="Fases da montagem"
        subtitle="Uma fase por vez. Sem pressa. A Estação respira antes de pensar."
      />
      <div>
        {fases.map((f, i) => (
          <TimelineStep key={f.step} {...f} last={i === fases.length - 1} />
        ))}
      </div>

      {/* Servidor */}
      <Divider label="Servidor Kaline · PC i7" />
      <SectionHeader
        eyebrow="Cérebro técnico"
        title="Servidor Kaline · PC i7"
        subtitle="O PC velho é o cérebro técnico da Estação Kaline. Ele guarda arquivos, mídia, backups, Códice, serviços locais e futuramente modelos pequenos."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Perfil planejado</p>
          <ul className="grid gap-2 text-[color:var(--kaline-muted)] text-sm">
            {servidorPerfil.map((s) => (
              <li key={s} className="flex gap-3">
                <span className="text-[color:var(--kaline-copper)]">·</span>
                <span className="kaline-serif text-[15px] text-[color:var(--kaline-text)]">
                  {s}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <StatusBadge status="not-verified" />
          </div>
        </GlassCard>
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Passos visuais</p>
          <ol className="grid gap-2 text-[color:var(--kaline-muted)] text-sm">
            {servidorPassos.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="kaline-serif text-[color:var(--kaline-copper)] w-5 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
      <div className="mt-6">
        <ConfigBlock
          title="Comandos futuros · para conferir antes de usar"
          content={comandosFuturos}
        />
        <p className="mt-3 ka-caps">
          nenhum comando é executado pela Kaline Presence · sem formatação · sem particionamento
        </p>
      </div>

      {/* Porão */}
      <Divider label="Porão da Kaline · HD 1 TB" />
      <SectionHeader
        eyebrow="Onde o peso mora"
        title="Porão da Kaline"
        subtitle="O Porão da Kaline guarda o peso: livros, mídia, backups, modelos, logs e cache."
      />
      <FolderTree text={poraoTree} />
      <p className="mt-3 text-sm text-[color:var(--kaline-muted)]">
        Nada pesado deve morar no SSD de 128 GB quando puder morar no Porão da Kaline.
      </p>

      {/* Serviços leves */}
      <Divider label="Serviços leves" />
      <SectionHeader
        eyebrow="Ferramentas do servidor"
        title="Serviços leves"
        subtitle="Kaline Presence não substitui esses serviços. Ela apenas organiza atalhos e mostra estado quando o Station Agent existir."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {servicos.map((s) => (
          <GlassCard key={s.title}>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h3 className="ka-title-card-sm min-w-0">{s.title}</h3>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--kaline-muted)]">{s.funcao}</p>
          </GlassCard>
        ))}
      </div>

      {/* Kaline Deck / TV Box */}
      <Divider label="Kaline Deck · TV Box" />
      <SectionHeader
        eyebrow="Terminal leve"
        title="Kaline Deck · TV Box"
        subtitle="A TV Box não é o cérebro da Kaline. Ela é um terminal leve para abrir a Kaline TV, navegar no painel, controlar mídia e exibir presença na televisão."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Especificação</p>
          <ul className="grid gap-1.5 text-sm text-[color:var(--kaline-muted)]">
            {deckSpec.map((s) => (
              <li key={s} className="flex gap-3">
                <span className="text-[color:var(--kaline-copper)]">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard>
          <p className="kaline-eyebrow mb-3">O que ela deve fazer</p>
          <ul className="grid gap-1.5 text-sm text-[color:var(--kaline-muted)]">
            {deckDeveFazer.map((s) => (
              <li key={s} className="flex gap-3">
                <span className="text-[color:var(--kaline-copper)]">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard>
          <p className="kaline-eyebrow mb-3">O que ela NÃO deve fazer</p>
          <ul className="grid gap-1.5 text-sm text-[color:var(--kaline-muted)]">
            {deckNaoDeveFazer.map((s) => (
              <li key={s} className="flex gap-3">
                <span className="text-[color:var(--kaline-ember)]">×</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
      <div className="mt-6">
        <GlassCard>
          <p className="kaline-eyebrow mb-3">Passos visuais</p>
          <ol className="grid gap-2 text-sm text-[color:var(--kaline-muted)]">
            {deckPassos.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="kaline-serif text-[color:var(--kaline-copper)] w-5 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
      <div className="mt-4 rounded-[14px] border border-[color:var(--kaline-ember)]/55 bg-[color:var(--kaline-ember)]/10 p-4">
        <p className="kaline-eyebrow text-[color:var(--kaline-ember)]">Alerta</p>
        <p className="mt-2 kaline-serif text-lg text-[color:var(--kaline-text)]">
          A TV Box usa fonte 5V. Não usar fonte 9V ou 12V.
        </p>
      </div>

      {/* Kaline TV */}
      <Divider label="Kaline TV" />
      <SectionHeader
        eyebrow="Tela de presença"
        title="Abrindo a Kaline TV"
        subtitle="A Kaline TV é a tela de presença da Estação Kaline. Ela não é chat gigante. Ela mostra poucos sinais, com letras grandes, pronta para ser vista de longe."
      />
      <GlassCard>
        <div className="flex items-start justify-between gap-3">
          <p className="kaline-eyebrow">Passos</p>
          <StatusBadge status="prototype" />
        </div>
        <ol className="mt-4 grid gap-2 text-sm text-[color:var(--kaline-muted)]">
          {kalineTvPassos.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="kaline-serif text-[color:var(--kaline-copper)] w-5 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </GlassCard>

      {/* Testes manuais */}
      <Divider label="Testes manuais" />
      <SectionHeader
        eyebrow="Respiração da Estação"
        title="Teste de respiração"
        subtitle="Nada aqui é persistido. Só um roteiro visual para conferir com os olhos."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {testesManuais.map((t) => (
          <GlassCard key={t} className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-[color:var(--kaline-text)]">{t}</span>
              <StatusBadge status="not-verified" />
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Ainda não */}
      <Divider label="Ainda não" />
      <section className="relative overflow-hidden rounded-[20px] border border-[color:var(--kaline-ember)]/50 bg-[color:var(--kaline-ember-bg)] px-6 md:px-10 py-10">
        <div className="pointer-events-none absolute inset-0 kaline-halo-ember opacity-70" />
        <div className="relative">
          <p className="kaline-eyebrow text-[color:var(--kaline-ember)]">Ainda não</p>
          <h2 className="mt-3 ka-title-display">
            O que a Estação não faz agora
            <span className="text-[color:var(--kaline-copper)]">.</span>
          </h2>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2 text-[color:var(--kaline-muted)]">
            {aindaNao.map((n) => (
              <li key={n} className="flex gap-3 text-[15px]">
                <span className="text-[color:var(--kaline-ember)]">×</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 kaline-serif text-xl md:text-2xl text-[color:var(--kaline-text)]">
            Primeiro a Estação respira. Depois ela pensa.
          </p>
        </div>
      </section>

      <p className="mt-10 ka-caps">
        documentação visual · sem backend · sem instalação real · nada aqui é persistido
      </p>
    </div>
  );
}
