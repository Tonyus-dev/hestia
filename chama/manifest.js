// Chama Local — manifesto estático da estação.
// Conteúdo versionado no git, não em disco — mesma lógica que config.js.
import { getPresenceServiceBindings } from "./serviceBindings.js";

export function getManifest() {
  return {
    station: {
      name: "Héstia Console",
      tagline:
        "Héstia organiza, registra e sustenta. Chama Local mede e serve. Presence mostra e consulta.",
      components: [
        {
          name: "Héstia",
          role: "host",
          description: "App local do servidor",
        },
        {
          name: "Héstia Console",
          role: "interface",
          description: "A tela dentro da Héstia (web app local)",
        },
        {
          name: "Chama Local",
          role: "sensor",
          description: "Módulo/API somente leitura embutido (o pulso interno)",
        },
      ],
    },
    services: getPresenceServiceBindings(),
    // readonly:false desde que a Héstia ganhou uma única capacidade de escrita local (mover/copiar
    // dentro de um plano aprovado — ver chama/capabilities.js). Presence nunca vê o plano em si.
    capabilities: {
      readonly: true,
      readonlyByDefault: true,
      controlledWrites: true,
      writeCapabilities: ["organizer.apply", "organizer.undo", "organizer.redo", "hermes"],
      metrics: true,
      events: true,
      snapshots: true,
    },
  };
}
