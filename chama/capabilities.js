// Chama Local — capabilities estáticas (somente leitura).
// Todos os campos de escrita/comando estão hardcoded como false.

export function getCapabilities() {
  return {
    reading: {
      health: true,
      metrics: true,
      events: true,
      snapshots: true,
      logs: true,
      config: true,
    },
    writing: {
      executeCommands: false,
      configureServices: false,
      manageBackups: false,
      modifyStorage: false,
      manageUsers: false,
    },
    mode: "read-only",
  };
}
