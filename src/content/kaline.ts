// K∧LINE CENTRAL — all mocked content lives here.
// Zero fetch. Zero API. Ready to be serialized into a single HTML export later.

export type StatusVariant =
  | "waiting"
  | "planned"
  | "not-verified"
  | "not-connected"
  | "prototype"
  | "offline"
  | "future"
  | "awaiting-library";

export const statusLabel: Record<StatusVariant, string> = {
  waiting: "Aguardando agente",
  planned: "Planejado",
  "not-verified": "Não verificado",
  "not-connected": "Não conectado",
  prototype: "Protótipo visual",
  offline: "Aguardando heartbeat",
  future: "Integração futura",
  "awaiting-library": "Aguardando biblioteca",
};

export const statusTooltip: Record<StatusVariant, string> = {
  waiting:
    "O Station Agent ainda não está conectado. Este cômodo só funciona quando o agente local responder ao painel.",
  planned: "Este cômodo está no roadmap, mas ainda não foi montado ou conectado na Estação.",
  "not-verified":
    "O hardware ou serviço existe fisicamente, mas ainda não foi testado ou confirmado no painel.",
  "not-connected": "O dispositivo existe, mas não está pareado ou acessível na rede local.",
  prototype: "Você está vendo uma simulação da interface. Não há backend real por trás ainda.",
  offline:
    "O serviço está desligado ou o heartbeat ainda não chegou. Verifique se o servidor está ligado.",
  future: "Esta funcionalidade faz parte de uma fase posterior da Estação.",
  "awaiting-library": "Esperando que os arquivos sejam colocados na pasta correta no HD.",
};

export type NavItem = {
  to: string;
  label: string;
  hint?: string;
  tooltip?: string;
  priority?: boolean; // shown first on mobile
  group: "K∧LINE" | "PRESENÇA" | "MEMÓRIA" | "MONTAGEM" | "SISTEMA";
  status: StatusVariant;
};

export const nav: NavItem[] = [
  {
    to: "/",
    label: "Home",
    hint: "Painel vivo",
    tooltip: "Painel principal com o estado honesto de todos os cômodos da Estação.",
    priority: true,
    group: "K∧LINE",
    status: "prototype",
  },
  {
    to: "/central",
    label: "Central",
    hint: "Servidor Kaline",
    tooltip:
      "O PC i7 que guarda, serve e coordena. Aguardando Station Agent para responder ao painel.",
    priority: true,
    group: "K∧LINE",
    status: "waiting",
  },
  {
    to: "/dispositivos",
    label: "Dispositivos",
    hint: "Malha da casa",
    tooltip: "Todos os aparelhos da Estação — servidor, TV Box, notebook e celular.",
    priority: true,
    group: "K∧LINE",
    status: "not-verified",
  },
  {
    to: "/mapa",
    label: "Mapa da Estação",
    hint: "Arquitetura física",
    tooltip: "Diagrama de como as peças físicas da Estação se conectam entre si.",
    group: "K∧LINE",
    status: "prototype",
  },
  {
    to: "/tv",
    label: "Kaline TV",
    hint: "Tela de presença",
    tooltip: "A televisão como rosto da Kaline. Protótipo visual pronto para testar na TV Box.",
    priority: true,
    group: "PRESENÇA",
    status: "prototype",
  },
  {
    to: "/codice",
    label: "Códice",
    hint: "Biblioteca viva",
    tooltip: "Biblioteca doméstica de livros, PDFs e fichamentos. Aguardando os arquivos no HD.",
    group: "MEMÓRIA",
    status: "awaiting-library",
  },
  {
    to: "/midia",
    label: "Mídia",
    hint: "Jellyfin planejado",
    tooltip: "Servidor de filmes e séries via Jellyfin. Planejado para a próxima fase da Estação.",
    group: "MEMÓRIA",
    status: "planned",
  },
  {
    to: "/arquivos",
    label: "Arquivos",
    hint: "Porão da Kaline",
    tooltip: "Pastas e estrutura de arquivos no HD de 1 TB. Ainda não verificado no servidor.",
    group: "MEMÓRIA",
    status: "awaiting-library",
  },
  {
    to: "/backups",
    label: "Backups",
    hint: "Rotinas pendentes",
    tooltip: "Snapshots e cópias de segurança. Planejado, mas ainda não configurado.",
    group: "MEMÓRIA",
    status: "planned",
  },
  {
    to: "/onboarding",
    label: "Primeira ligação",
    hint: "Guia visual",
    tooltip: "Guia passo a passo para acender a Estação pela primeira vez.",
    group: "MONTAGEM",
    status: "prototype",
  },
  {
    to: "/implementacao",
    label: "Implementação",
    hint: "Primeira montagem",
    tooltip: "Checklist prático de montagem física e lógica da Estação Kaline.",
    group: "MONTAGEM",
    status: "prototype",
  },
  {
    to: "/roadmap",
    label: "Roadmap",
    hint: "Fases da Estação",
    tooltip: "As quatro fases de construção da Estação, do protótipo à presença completa.",
    group: "MONTAGEM",
    status: "future",
  },
  {
    to: "/verdade",
    label: "Verdade operacional",
    hint: "Manifesto",
    tooltip: "O manifesto da Estação: o que ela faz, o que não faz e como decide.",
    group: "SISTEMA",
    status: "prototype",
  },
  {
    to: "/configuracao",
    label: "Configuração",
    hint: "Endereços e chaves",
    tooltip: "Endereços, portas e chaves da Estação. Não verificado até o primeiro boot.",
    group: "SISTEMA",
    status: "not-verified",
  },
];

// ── Home ──────────────────────────────────────────────────────────────
export const homeCards: {
  title: string;
  subtitle: string;
  status: StatusVariant;
  to: string;
}[] = [
  {
    title: "Central",
    subtitle: "Servidor Kaline · PC i7 na mesa",
    status: "waiting",
    to: "/central",
  },
  {
    title: "Kaline TV",
    subtitle: "Rosto grande na televisão",
    status: "prototype",
    to: "/tv",
  },
  {
    title: "Dispositivos",
    subtitle: "Notebook, celular, TV Box, servidor",
    status: "not-verified",
    to: "/dispositivos",
  },
  {
    title: "Códice",
    subtitle: "Biblioteca doméstica planejada",
    status: "awaiting-library",
    to: "/codice",
  },
  {
    title: "Mídia",
    subtitle: "Jellyfin no Porão da Kaline",
    status: "planned",
    to: "/midia",
  },
  {
    title: "Backups",
    subtitle: "Rotinas ainda não configuradas",
    status: "planned",
    to: "/backups",
  },
  {
    title: "Mapa da Estação",
    subtitle: "Como as peças físicas conversam",
    status: "prototype",
    to: "/mapa",
  },
  {
    title: "Primeira ligação",
    subtitle: "Guia honesto para acender a Estação",
    status: "prototype",
    to: "/onboarding",
  },
];

// ── Central / hardware ────────────────────────────────────────────────
export const hardware: { label: string; value: string }[] = [
  { label: "Sistema previsto", value: "Debian estável · sem interface gráfica" },
  { label: "Processador", value: "Intel Core i7 · geração doméstica" },
  { label: "Memória", value: "16 GB · não verificada" },
  { label: "SSD", value: "sistema + serviços leves" },
  { label: "HD 1 TB", value: "Porão da Kaline · aguardando montagem" },
  { label: "Gráfica", value: "integrada · sem uso pesado" },
  { label: "Função", value: "guardar, servir, coordenar" },
];

export const centralStatus: { label: string; status: StatusVariant }[] = [
  { label: "Serviço Samba", status: "waiting" },
  { label: "Serviço Syncthing", status: "waiting" },
  { label: "Serviço Jellyfin", status: "waiting" },
  { label: "Túnel Tailscale", status: "waiting" },
  { label: "Heartbeat do Station Agent", status: "offline" },
  { label: "Rotina de backup local", status: "planned" },
];

export const endpointsCentral: string[] = [
  "GET  /api/health          → planejado",
  "GET  /api/services        → aguardando Station Agent",
  "GET  /api/hardware        → não verificado",
  "POST /api/services/:name  → futuro",
];

// ── Dispositivos ──────────────────────────────────────────────────────
export const devices: {
  name: string;
  role: string;
  status: StatusVariant;
}[] = [
  { name: "Servidor Kaline", role: "PC i7 · guarda tudo", status: "waiting" },
  { name: "Kaline Deck", role: "TV Box · terminal leve", status: "not-verified" },
  { name: "Kaline TV", role: "televisão · rosto da Kaline", status: "prototype" },
  { name: "Notebook", role: "oficina de desenvolvimento", status: "not-connected" },
  { name: "Celular", role: "controle remoto doméstico", status: "not-connected" },
];

export const endpointsDevices: string[] = [
  "GET  /api/devices        → aguardando Station Agent",
  "POST /api/devices/name   → planejado",
  "GET  /api/devices/:id    → futuro",
];

// ── Códice ────────────────────────────────────────────────────────────
export const codiceCards: {
  title: string;
  subtitle: string;
  status: StatusVariant;
}[] = [
  { title: "Biblioteca local", subtitle: "raiz em /KALINE/codice", status: "awaiting-library" },
  { title: "EPUBs", subtitle: "livros digitais da casa", status: "awaiting-library" },
  { title: "PDFs", subtitle: "artigos, manuais, textos soltos", status: "awaiting-library" },
  { title: "Fichamentos", subtitle: "notas por livro", status: "planned" },
  { title: "Cache de texto", subtitle: "trechos extraídos para busca", status: "future" },
  { title: "Margens", subtitle: "grifos e observações", status: "planned" },
  { title: "Livros recentes", subtitle: "últimos abertos", status: "not-connected" },
  { title: "Arquivos pendentes", subtitle: "aguardando classificação", status: "waiting" },
  { title: "Metadados no Supabase", subtitle: "só metadados, nunca o arquivo", status: "future" },
  { title: "Pasta no Porão", subtitle: "/KALINE/codice no HD de 1 TB", status: "planned" },
];

// ── Mídia ─────────────────────────────────────────────────────────────
export const midiaCards: {
  title: string;
  subtitle: string;
  status: StatusVariant;
}[] = [
  {
    title: "Servidor Jellyfin",
    subtitle: "http://kaline.local:8096 · planejado",
    status: "planned",
  },
  { title: "Biblioteca de filmes", subtitle: "/KALINE/midia/filmes", status: "awaiting-library" },
  { title: "Biblioteca de séries", subtitle: "/KALINE/midia/series", status: "awaiting-library" },
  { title: "Trilhas e podcasts", subtitle: "/KALINE/midia/audio", status: "planned" },
  { title: "Kaline Deck", subtitle: "cliente na TV Box", status: "not-verified" },
  { title: "Controle remoto", subtitle: "via celular na rede local", status: "future" },
];

// ── Arquivos ──────────────────────────────────────────────────────────
export const arquivosCards: {
  title: string;
  subtitle: string;
  status: StatusVariant;
}[] = [
  { title: "/KALINE/codice", subtitle: "livros, fichamentos, margens", status: "awaiting-library" },
  { title: "/KALINE/midia", subtitle: "filmes, séries, áudio", status: "awaiting-library" },
  { title: "/KALINE/backups", subtitle: "snapshots do sistema e dados", status: "planned" },
  { title: "/KALINE/modelos", subtitle: "pesos e artefatos de IA local", status: "future" },
  { title: "/KALINE/logs", subtitle: "diário técnico da Estação", status: "planned" },
  { title: "/KALINE/entrada", subtitle: "arquivos a classificar", status: "waiting" },
];

export const folderTree = `/KALINE
├── codice/         (aguardando biblioteca local)
│   ├── epub/
│   ├── pdf/
│   ├── fichamentos/
│   └── margens/
├── midia/
│   ├── filmes/
│   ├── series/
│   └── audio/
├── backups/
│   ├── sistema/
│   └── dados/
├── modelos/         (integração futura)
├── logs/            (planejado)
└── entrada/         (arquivos pendentes)`;

// ── Backups ───────────────────────────────────────────────────────────
export const backupsCards: {
  title: string;
  subtitle: string;
  status: StatusVariant;
}[] = [
  { title: "Snapshot do sistema", subtitle: "imagem semanal do SSD", status: "planned" },
  { title: "Snapshot do Códice", subtitle: "espelho no HD de 1 TB", status: "planned" },
  {
    title: "Exportação de metadados",
    subtitle: "cópia dos registros do Supabase",
    status: "planned",
  },
  { title: "Backup remoto", subtitle: "cópia off-site periódica", status: "future" },
  { title: "Retenção configurada", subtitle: "quantas cópias manter", status: "not-verified" },
  { title: "Último backup", subtitle: "nenhum executado ainda", status: "waiting" },
];

// ── Configuração ──────────────────────────────────────────────────────
export const configJson = `{
  "estacao": "kaline",
  "servidor": {
    "host": "kaline.local",
    "porta_agent": 4711,
    "sistema": "debian (planejado)"
  },
  "servicos": {
    "samba": "planejado",
    "syncthing": "planejado",
    "jellyfin": "planejado",
    "tailscale": "planejado"
  },
  "portao": {
    "hd": "/KALINE",
    "capacidade": "1 TB"
  },
  "station_agent": {
    "status": "aguardando_heartbeat",
    "heartbeat": null
  }
}`;

// ── Roadmap ───────────────────────────────────────────────────────────
export const roadmap: {
  fase: string;
  titulo: string;
  descricao: string;
  status: StatusVariant;
}[] = [
  {
    fase: "Fase 1",
    titulo: "Painel vivo",
    descricao: "Interface honesta, sem backend. Você está vendo esta fase agora.",
    status: "prototype",
  },
  {
    fase: "Fase 2",
    titulo: "Base física",
    descricao: "Servidor de pé, HD montado, TV Box conectada, rede testada.",
    status: "not-verified",
  },
  {
    fase: "Fase 3",
    titulo: "Station Agent",
    descricao: "Serviço local que valida pedidos da UI e coordena o Linux.",
    status: "future",
  },
  {
    fase: "Fase 4",
    titulo: "Presença completa",
    descricao: "Códice, mídia, backups e IA local operando juntos.",
    status: "future",
  },
];

// ── Onboarding ("Primeira ligação") ──────────────────────────────────
export const onboarding: {
  step: string;
  titulo: string;
  itens: string[];
  status: StatusVariant;
}[] = [
  {
    step: "01",
    titulo: "Base física",
    itens: [
      "PC ligado ao Clamper",
      "monitor conectado",
      "teclado funcionando",
      "TV Box alimentada com fonte 5 V",
      "rede local testada",
    ],
    status: "not-verified",
  },
  {
    step: "02",
    titulo: "Porão da Kaline",
    itens: [
      "criar pasta /KALINE no HD de 1 TB",
      "subpasta codice/",
      "subpasta midia/",
      "subpasta backups/",
      "subpasta modelos/ e logs/",
    ],
    status: "planned",
  },
  {
    step: "03",
    titulo: "Serviços leves",
    itens: ["Samba", "Syncthing", "Jellyfin", "Tailscale"],
    status: "waiting",
  },
  {
    step: "04",
    titulo: "Station Agent",
    itens: [
      "serviço local em desenvolvimento",
      "responde à UI",
      "executa no Linux",
      "ainda não conectado",
    ],
    status: "future",
  },
  {
    step: "05",
    titulo: "Kaline TV",
    itens: [
      "abrir /tv na TV Box",
      "usar como tela de presença",
      "hora local do dispositivo apenas",
    ],
    status: "prototype",
  },
];

// ── Verdade operacional ──────────────────────────────────────────────
export const naoFaz: string[] = [
  "não mede CPU",
  "não lê HD",
  "não verifica serviços",
  "não executa backup",
  "não abre Jellyfin automaticamente",
  "não sincroniza arquivos",
  "não roda IA local",
  "não controla o servidor",
];

export const regraDaEstacao: string[] = [
  "UI pede.",
  "Station Agent valida.",
  "Linux executa.",
  "Supabase registra metadados.",
  "HD guarda o pesado.",
];

// ── Mapa da Estação ──────────────────────────────────────────────────
export type MapNode = {
  id: string;
  name: string;
  role: string;
  status: StatusVariant;
  glyph: string; // typographic glyph, not a Lucide icon
  x: number; // 0..1000 SVG coords
  y: number;
};

export const mapNodes: MapNode[] = [
  {
    id: "server",
    name: "Servidor Kaline",
    role: "PC i7 · guarda e serve",
    status: "waiting",
    glyph: "◇",
    x: 500,
    y: 300,
  },
  {
    id: "porao",
    name: "Porão da Kaline",
    role: "HD 1 TB · o peso",
    status: "planned",
    glyph: "▢",
    x: 500,
    y: 520,
  },
  {
    id: "deck",
    name: "Kaline Deck",
    role: "TV Box · terminal leve",
    status: "not-verified",
    glyph: "▽",
    x: 780,
    y: 220,
  },
  {
    id: "tv",
    name: "Kaline TV",
    role: "televisão · rosto grande",
    status: "prototype",
    glyph: "◯",
    x: 880,
    y: 380,
  },
  {
    id: "notebook",
    name: "Notebook",
    role: "oficina de desenvolvimento",
    status: "not-connected",
    glyph: "◱",
    x: 180,
    y: 220,
  },
  {
    id: "celular",
    name: "Celular",
    role: "controle remoto",
    status: "not-connected",
    glyph: "▮",
    x: 180,
    y: 420,
  },
  {
    id: "supabase",
    name: "Supabase",
    role: "só metadados externos",
    status: "future",
    glyph: "△",
    x: 500,
    y: 90,
  },
  {
    id: "agent",
    name: "Station Agent",
    role: "serviço local futuro",
    status: "future",
    glyph: "✦",
    x: 340,
    y: 380,
  },
];

export const mapEdges: { from: string; to: string; dashed?: boolean }[] = [
  { from: "server", to: "porao" },
  { from: "server", to: "deck" },
  { from: "deck", to: "tv" },
  { from: "notebook", to: "server" },
  { from: "celular", to: "server", dashed: true },
  { from: "server", to: "supabase", dashed: true },
  { from: "agent", to: "server", dashed: true },
];

export const mapLegend: { name: string; role: string }[] = [
  { name: "Servidor Kaline", role: "guarda arquivos, mídia, backups, Códice e serviços locais." },
  { name: "Porão da Kaline", role: "guarda o peso — o HD de 1 TB." },
  { name: "Kaline Deck", role: "terminal leve na TV Box." },
  { name: "Kaline TV", role: "o rosto grande da Kaline, na televisão." },
  { name: "Notebook", role: "oficina de desenvolvimento." },
  { name: "Celular", role: "controle remoto doméstico." },
  { name: "Supabase", role: "registra metadados, nunca arquivos pesados." },
  { name: "Station Agent", role: "futuro serviço local, ainda aguardando conexão." },
];
