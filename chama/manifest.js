// Chama Local — manifesto estático da estação.
// Conteúdo versionado no git, não em disco — mesma lógica que config.js.

export function getManifest() {
  return {
    station: {
      name: "Héstia Console",
      tagline: "Héstia guarda, serve e sustenta. A Chama Local mede e valida. Presence mostra.",
      components: [
        {
          name: "Héstia",
          role: "host",
          description: "Servidor físico/local da Estação Kaline",
        },
        {
          name: "Héstia Console",
          role: "interface",
          description: "Web app local (a tela)",
        },
        {
          name: "Chama Local",
          role: "sensor",
          description: "API local embutida (o pulso interno)",
        },
      ],
    },
    capabilities: {
      readonly: true,
      metrics: true,
      events: true,
      snapshots: true,
    },
  };
}
