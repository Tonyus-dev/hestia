// Chama Local — vínculos read-only com serviços já existentes no notebook.
// Não instala, não configura, não inicia/para/reinicia nenhum destes serviços.

export function getServiceBindings() {
  return [
    {
      id: "samba",
      serviceName: "smbd",
      label: "Samba",
      role: "Serviço local observado",
    },
    {
      id: "tailscale",
      serviceName: "tailscaled",
      label: "Tailscale",
      role: "Serviço local observado",
    },
    {
      id: "jellyfin",
      serviceName: "jellyfin",
      label: "Jellyfin",
      role: "Serviço local observado",
    },
  ];
}

// Versão sanitizada (sem serviceName) para superfícies Presence-safe.
export function getPresenceServiceBindings() {
  return getServiceBindings().map(({ id, label, role }) => ({ id, label, role }));
}
