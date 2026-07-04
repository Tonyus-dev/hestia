// Héstia Console — small static content shared by the shell.
// No mocked metrics. All live data comes from /api/* via src/lib/hestia/api.ts.

export type NavItem = {
  to: "/" | "/logs" | "/config" | "/endpoints";
  label: string;
  hint?: string;
};

export const nav: NavItem[] = [
  { to: "/", label: "Painel", hint: "saúde da Héstia" },
  { to: "/logs", label: "Logs", hint: "somente da Chama" },
  { to: "/config", label: "Configuração", hint: "somente leitura" },
  { to: "/endpoints", label: "Endpoints", hint: "contratos /api" },
];

export const HESTIA = {
  appName: "Héstia Console",
  serverName: "Héstia",
  agentName: "Chama Local",
  subtitle: "Interface local da Héstia com Chama Local embutida",
  motto: "Héstia organiza, registra e sustenta. Chama Local mede e serve.",
  waiting: "Aguardando Chama Local",
  readonly:
    "Modo somente leitura. O Console da Héstia observa o servidor, mas não executa comandos destrutivos.",
  footer: "Héstia sustenta. Chama serve. Presence consulta.",
  defaultHost: "127.0.0.1",
  defaultPort: 4517,
  hardware: [
    "PC i7",
    "Linux Mint Xfce",
    "8 GB RAM",
    "SSD 128 GB",
    "HD 1 TB",
    "GT 710",
  ],
  futureFunctions: [
    "arquivos",
    "mídia",
    "backups",
    "Códice local",
    "Jellyfin",
    "Samba",
    "Syncthing",
    "Tailscale",
    "Chama Local",
  ],
  storagePaths: ["/", "/KALINE"],
  services: ["jellyfin", "syncthing", "smbd", "tailscaled"],
  endpoints: [
    {
      path: "/api/health",
      purpose: "saúde geral da Chama Local",
      fields: ["ok", "appName", "version", "hostname", "timestamp", "processUptime", "readonly"],
    },
    {
      path: "/api/server/status",
      purpose: "dados reais de node:os",
      fields: ["hostname", "platform", "release", "arch", "uptime", "totalMemory", "freeMemory", "loadAverage"],
    },
    {
      path: "/api/storage/status",
      purpose: "df -kP em paths fixos",
      fields: ["path", "exists", "total", "used", "free", "percentUsed", "status"],
    },
    {
      path: "/api/services/status",
      purpose: "systemctl is-active para lista fixa",
      fields: ["name", "active", "status", "checkedAt"],
    },
    {
      path: "/api/services/bindings",
      purpose: "vínculos read-only com serviços existentes do servidor",
      fields: ["id", "serviceName", "label", "role", "relatedStorage"],
    },
    {
      path: "/api/logs",
      purpose: "ring buffer da própria Chama",
      fields: ["items[].timestamp", "items[].level", "items[].message"],
    },
    {
      path: "/api/config",
      purpose: "configuração somente leitura",
      fields: ["appName", "host", "port", "mode", "readonly", "storagePaths", "services"],
    },
  ] as const,
};
