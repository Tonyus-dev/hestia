// Chama Local — vínculos read-only com serviços já existentes no servidor.
// Não instala, não configura, não inicia/para/reinicia nenhum destes serviços.

export function getServiceBindings() {
  return [
    {
      id: "samba",
      serviceName: "smbd",
      label: "Samba",
      role: "Acesso de rede ao /KALINE",
      relatedStorage: ["/KALINE"],
    },
    {
      id: "syncthing",
      serviceName: "syncthing",
      label: "Syncthing",
      role: "Sincronização de entrada/pastas escolhidas",
      relatedStorage: ["/KALINE/entrada"],
    },
    {
      id: "tailscale",
      serviceName: "tailscaled",
      label: "Tailscale",
      role: "Acesso privado ao servidor",
      relatedStorage: [],
    },
    {
      id: "jellyfin",
      serviceName: "jellyfin",
      label: "Jellyfin",
      role: "Leitura de /KALINE/midia",
      relatedStorage: ["/KALINE/midia"],
    },
  ];
}

// Versão sanitizada (sem relatedStorage/serviceName) para superfícies Presence-safe.
export function getPresenceServiceBindings() {
  return getServiceBindings().map(({ id, label, role }) => ({ id, label, role }));
}
