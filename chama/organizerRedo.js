// Chama Local — refaz uma execução de undo (reaplica as operações originais). Só funciona em
// cima de uma execução de undo (runId com `undoOf`), nunca diretamente numa execução de apply.
// Undo/redo é de um nível só nesta fatia: uma execução de redo é terminal — não dá pra desfazer
// nem refazer de novo. Só reaplica operações que o undo correspondente desfez com sucesso
// (undoStatus "ok"); pareamento por índice, já que ambos os manifestos preservam a mesma ordem
// das operações originais.
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getOrganizerRun, targetExists, applyItem, writeManifest } from "./organizerApply.js";
import { appendEvent } from "./events.js";

async function redoOperation(originalOp) {
  if (await targetExists(originalOp.to)) {
    return { ...originalOp, status: "skipped", error: "target já existe (conflito)" };
  }
  return applyItem({
    ...originalOp,
    sourcePath: originalOp.from,
    targetPath: originalOp.to,
    status: "planned",
  });
}

export async function redoOrganizerRun(undoRunId, dataDir) {
  const undoRun = await getOrganizerRun(undoRunId, dataDir);
  if (!undoRun) return null;
  if (!undoRun.undoOf) {
    throw Object.assign(new Error("Execução não é um undo — nada para refazer"), {
      code: "ENOTUNDORUN",
    });
  }
  if (undoRun.redoneBy) {
    throw Object.assign(new Error("Undo já foi refeito"), { code: "EALREADYREDONE" });
  }

  const originalRun = await getOrganizerRun(undoRun.undoOf, dataDir);
  if (!originalRun) {
    throw Object.assign(new Error("Execução original não encontrada (pode ter expirado)"), {
      code: "EORIGINALNOTFOUND",
    });
  }

  const redoRunId = `redo_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const operations = [];
  for (let i = 0; i < originalRun.operations.length; i++) {
    const originalOp = originalRun.operations[i];
    const undoOp = undoRun.operations[i];
    if (!undoOp || undoOp.status !== "ok") {
      operations.push({
        ...originalOp,
        status: "skipped",
        error: "operação não foi desfeita com sucesso; nada a refazer",
      });
      continue;
    }
    operations.push(await redoOperation(originalOp));
  }

  const summary = {
    total: operations.length,
    ok: operations.filter((o) => o.status === "ok").length,
    failed: operations.filter((o) => o.status === "failed").length,
    skipped: operations.filter((o) => o.status === "skipped").length,
  };

  const status =
    summary.total === 0 || (summary.failed === 0 && summary.skipped === 0)
      ? "applied"
      : summary.ok > 0 || summary.skipped > 0
        ? "partially_applied"
        : "failed";

  const redoManifest = {
    runId: redoRunId,
    redoOf: undoRunId,
    createdAt: new Date().toISOString(),
    status,
    mode: "local-only-redo",
    operations: operations.map(({ from, to, action, status: opStatus, reason, error }) => ({
      from,
      to,
      action,
      status: opStatus,
      reason,
      ...(error ? { error } : {}),
    })),
    summary,
  };

  await writeManifest(redoManifest, dataDir);

  undoRun.redoneBy = redoRunId;
  undoRun.redoneAt = redoManifest.createdAt;
  await writeManifest(undoRun, dataDir);

  const eventType =
    status === "applied"
      ? "organizer.run.redone"
      : status === "partially_applied"
        ? "organizer.run.partially_redone"
        : "organizer.run.redo_failed";
  await appendEvent({ type: eventType, data: { undoRunId, redoRunId, summary } }, dataDir);

  return redoManifest;
}
