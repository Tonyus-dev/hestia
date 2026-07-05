// Chama Local — validação estrita de IDs do organizer (plano/execução).
// planId/runId vêm de input do cliente (body do POST, param da URL) e são usados pra montar
// paths de arquivo via path.join(dataDir, ..., `${id}.json`) — path.join NORMALIZA "..", então
// um id como "../../../../etc/passwd" escaparia de dataDir/organizer/{plans,runs}/ sem essa
// validação. Nunca ler/escrever um arquivo a partir de um id que não bata neste formato exato.
const ID_PATTERN = /^(plan|org|undo|redo)_\d+_[0-9a-f]{8}$/;

export function isValidOrganizerId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}
