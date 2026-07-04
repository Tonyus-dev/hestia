// Chama Local — capabilities estáticas.
// Única capacidade de escrita real: mover/copiar arquivo dentro de um plano gerado pela própria
// Héstia e aplicado com confirmação explícita (ver chama/organizerPlan.js/organizerApply.js).
// Todo o resto (executar comando, configurar/reiniciar serviço, gerenciar usuário) continua
// hardcoded como false — não existe em nenhum lugar do código.

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
      modifyStorage: true,
      manageUsers: false,
    },
    mode: "local-write-with-approval",
  };
}
