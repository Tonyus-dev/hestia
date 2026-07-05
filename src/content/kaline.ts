// Héstia Console — small static content shared by the shell.
// No mocked metrics. All live data comes from /api/* via src/lib/hestia/api.ts.

export type NavItem = {
  to:
    | "/"
    | "/sistema"
    | "/storage"
    | "/organizar"
    | "/servicos"
    | "/historico"
    | "/config"
    | "/endpoints";
  label: string;
  hint?: string;
};

export const nav: NavItem[] = [
  { to: "/", label: "Painel", hint: "cockpit" },
  { to: "/sistema", label: "Sistema", hint: "hardware real" },
  { to: "/storage", label: "Storage", hint: "/KALINE" },
  { to: "/organizar", label: "Organizar", hint: "plano aprovado" },
  { to: "/servicos", label: "Serviços", hint: "status real" },
  { to: "/historico", label: "Histórico", hint: "runs e eventos" },
  { to: "/config", label: "Configuração", hint: "modo protegido" },
  { to: "/endpoints", label: "Endpoints", hint: "contratos /api" },
];

export const HESTIA = {
  appName: "Héstia Console",
  serverName: "Héstia",
  agentName: "Chama Local",
  subtitle: "Interface local da Héstia com Chama Local embutida",
  motto: "Héstia organiza, registra e sustenta. Chama Local mede e serve.",
  waiting: "Aguardando Chama Local",
  readonly: "Modo protegido: escrita local apenas com aprovação e sem comandos destrutivos.",
  footer: "Héstia sustenta. Chama serve. Presence consulta.",
  defaultHost: "127.0.0.1",
  defaultPort: 4517,
  storagePaths: ["/", "/KALINE"],
  services: ["jellyfin", "syncthing", "smbd", "tailscaled"],
  endpoints: [
    {
      method: "GET",
      group: "read-only",
      path: "/api/health",
      purpose: "saúde geral da Chama Local",
      fields: ["ok", "appName", "version", "hostname", "timestamp", "processUptime", "readonly"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/server/status",
      purpose: "dados reais de node:os",
      fields: [
        "hostname",
        "platform",
        "release",
        "arch",
        "uptime",
        "totalMemory",
        "freeMemory",
        "loadAverage",
      ],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/storage/status",
      purpose: "df -kP em paths fixos",
      fields: ["path", "exists", "total", "used", "free", "percentUsed", "status"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/storage/model",
      purpose: "árvore canônica de /KALINE (estática)",
      fields: [
        "root",
        "folders[].id",
        "folders[].relativePath",
        "folders[].category",
        "folders[].purpose",
      ],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/storage/sources",
      purpose: "fontes externas do HD configuradas em ~/.chama/config.json",
      fields: ["items[].id", "items[].label", "items[].path", "items[].category", "items[].mode"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/storage/scan",
      purpose:
        "varredura read-only de /KALINE e das fontes externas (resumo, sem lista de arquivos)",
      fields: [
        "kaline.folders[].files",
        "kaline.folders[].bytes",
        "kaline.folders[].extensions",
        "sources.items[]",
      ],
    },
    {
      method: "GET",
      group: "local-action",
      path: "/api/storage/organizer/plan",
      purpose: "gera e persiste um plano dry-run de organização (só cálculo)",
      fields: [
        "planId",
        "items[].sourcePath",
        "items[].targetPath",
        "items[].action",
        "items[].status",
        "summary",
      ],
    },
    {
      method: "POST",
      group: "local-action",
      path: "/api/local/organizer/apply",
      purpose:
        "POST — aplica um plano já gerado (exige header X-Hestia-Local-Confirm: organize); única rota de escrita",
      fields: ["runId", "planId", "status", "operations[]", "summary"],
    },
    {
      method: "GET",
      group: "local-action",
      path: "/api/local/organizer/runs",
      purpose: "lista execuções anteriores do organizer",
      fields: ["items[]"],
    },
    {
      method: "POST",
      group: "local-action",
      path: "/api/local/organizer/runs/:runId/undo",
      purpose:
        "POST — desfaz uma execução aplicada (exige header X-Hestia-Local-Confirm: organize); não repetível",
      fields: ["runId", "undoOf", "status", "operations[]", "summary"],
    },
    {
      method: "POST",
      group: "local-action",
      path: "/api/local/organizer/runs/:runId/redo",
      purpose:
        "POST — refaz uma execução de undo (exige o mesmo header); só funciona em cima de um undo, terminal (sem novo undo/redo)",
      fields: ["runId", "redoOf", "status", "operations[]", "summary"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/services/status",
      purpose: "systemctl is-active para lista fixa",
      fields: ["name", "active", "status", "checkedAt"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/services/bindings",
      purpose: "vínculos read-only com serviços existentes do servidor",
      fields: ["id", "serviceName", "label", "role", "relatedStorage"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/logs",
      purpose: "ring buffer da própria Chama",
      fields: ["items[].timestamp", "items[].level", "items[].message"],
    },
    {
      method: "GET",
      group: "read-only",
      path: "/api/config",
      purpose: "configuração modo protegido",
      fields: ["appName", "host", "port", "mode", "readonly", "storagePaths", "services"],
    },
  ] as const,
};
