// Héstia Console — small static content shared by the shell.
// No mocked metrics. All live data comes from /api/* via src/lib/hestia/api.ts.

export type NavItem = {
  to: "/" | "/sistema" | "/servicos" | "/historico" | "/config" | "/endpoints";
  label: string;
  hint?: string;
};

export const nav: NavItem[] = [
  { to: "/", label: "Painel", hint: "cockpit" },
  { to: "/sistema", label: "Sistema", hint: "hardware real" },
  { to: "/servicos", label: "Serviços", hint: "status real" },
  { to: "/historico", label: "Histórico", hint: "runs e eventos" },
  { to: "/config", label: "Configuração", hint: "modo protegido" },
  { to: "/endpoints", label: "Endpoints", hint: "contratos /api" },
];

export const HESTIA = {
  appName: "Héstia Console",
  serverName: "Héstia Console",
  agentName: "Chama Local",
  subtitle: "Console visual da Héstia Console com Chama Local embutida",
  motto:
    "Héstia é a Estação. A Chama é o pulso. O Console é a face. Presence consulta. Kaline decide.",
  waiting: "Aguardando Chama Local",
  readonly:
    "Modo protegido: leitura por padrão; escrita local somente por ações explícitas, allowlisted e auditáveis.",
  footer: "Héstia é a Estação. Chama pulsa. Console mostra. Presence consulta.",
  defaultHost: "127.0.0.1",
  defaultPort: 4517,
  stationBaseUrl: null,
  services: ["tailscaled"],
  endpoints: [
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/health",
      purpose: "saúde geral da Chama Local",
      fields: ["ok", "appName", "version", "hostname", "timestamp", "processUptime", "readonly"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
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
      group: "Leitura / diagnóstico",
      path: "/api/hardware/status",
      purpose: "sensores e status de hardware real quando disponíveis",
      fields: ["status", "items[]"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/hardware/config",
      purpose: "configuração de leitura de hardware",
      fields: ["status", "items[]"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/services/status",
      purpose: "systemctl is-active para lista fixa",
      fields: ["name", "active", "status", "checkedAt"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/services/bindings",
      purpose: "serviços locais observados pelo notebook",
      fields: ["id", "label", "role"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/logs",
      purpose: "ring buffer da própria Chama",
      fields: ["items[].timestamp", "items[].level", "items[].message"],
    },
    {
      method: "GET",
      group: "Leitura / diagnóstico",
      path: "/api/config",
      purpose: "configuração modo protegido",
      fields: ["appName", "host", "port", "mode", "readonly", "stationBaseUrl", "services"],
    },
  ] as const,
};
