// Chama Local — desfaz uma execução já aplicada do organizer. Só reverte operações com
// status "ok" (nada aconteceu no disco pra "skipped"/"failed", nada a desfazer).
// move: move de volta (to -> from), reaproveitando o mesmo fallback de EXDEV do apply.
// copy: apaga só a cópia em "to", nunca toca a origem em "from" — e recusa apagar se "from"
// não existir mais (senão o arquivo deixaria de existir em qualquer lugar).
// Não há checksum/hash gravado no manifesto original: a checagem aqui é só de existência, não
// de conteúdo — se o arquivo em "to" foi substituído depois do apply, o undo não percebe isso.
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getOrganizerRun,
  targetExists,
  moveWithExdevFallback,
  writeManifest,
} from "./organizerApply.js";
import { appendEvent } from "./events.js";

async function targetChanged(op) {
  if (op.targetSize == null || op.targetMtimeMs == null) return false;
  try {
    const st = await fs.stat(op.to);
    return st.size !== op.targetSize || Math.abs(st.mtimeMs - op.targetMtimeMs) > 5;
  } catch {
    return false;
  }
}

async function undoOperation(op) {
  if (op.status !== "ok") {
    return {
      ...op,
      undoStatus: "skipped",
      undoError: "operação original não foi aplicada com sucesso",
    };
  }

  if (op.action === "move") {
    if (!(await targetExists(op.to))) {
      return { ...op, undoStatus: "failed", undoError: "arquivo não está mais no destino" };
    }
    if (await targetChanged(op)) {
      return { ...op, undoStatus: "skipped", undoError: "destino foi alterado após a execução" };
    }
    if (await targetExists(op.from)) {
      return {
        ...op,
        undoStatus: "skipped",
        undoError: "origem já existe de novo; não sobrescreve",
      };
    }
    try {
      await fs.mkdir(dirname(op.from), { recursive: true });
      await moveWithExdevFallback(op.to, op.from);
      return { ...op, undoStatus: "ok" };
    } catch (err) {
      return { ...op, undoStatus: "failed", undoError: err.code || err.message };
    }
  }

  // action === "copy": só apaga a cópia; nunca toca a origem externa.
  if (!(await targetExists(op.from))) {
    return {
      ...op,
      undoStatus: "skipped",
      undoError: "origem não existe mais; cópia mantida por segurança",
    };
  }
  if (!(await targetExists(op.to))) {
    return { ...op, undoStatus: "skipped", undoError: "cópia já não existe no destino" };
  }
  if (await targetChanged(op)) {
    return { ...op, undoStatus: "skipped", undoError: "destino foi alterado após a execução" };
  }
  try {
    await fs.unlink(op.to);
    return { ...op, undoStatus: "ok" };
  } catch (err) {
    return { ...op, undoStatus: "failed", undoError: err.code || err.message };
  }
}

export async function undoOrganizerRun(runId, dataDir) {
  const originalRun = await getOrganizerRun(runId, dataDir);
  if (!originalRun) return null;
  if (originalRun.undoneBy) {
    throw Object.assign(new Error("Execução já foi desfeita"), { code: "EALREADYUNDONE" });
  }

  const undoRunId = `undo_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const operations = [];
  for (const op of originalRun.operations) {
    operations.push(await undoOperation(op));
  }

  const summary = {
    total: operations.length,
    ok: operations.filter((o) => o.undoStatus === "ok").length,
    failed: operations.filter((o) => o.undoStatus === "failed").length,
    skipped: operations.filter((o) => o.undoStatus === "skipped").length,
  };

  const status =
    summary.total === 0 || (summary.failed === 0 && summary.skipped === 0)
      ? "applied"
      : summary.ok > 0 || summary.skipped > 0
        ? "partially_applied"
        : "failed";

  const undoManifest = {
    runId: undoRunId,
    undoOf: runId,
    createdAt: new Date().toISOString(),
    status,
    mode: "local-only-undo",
    operations: operations.map(({ from, to, action, undoStatus, undoError }) => ({
      from: to,
      to: from,
      action: action === "move" ? "move" : "delete",
      status: undoStatus,
      ...(undoError ? { error: undoError } : {}),
    })),
    summary,
  };

  await writeManifest(undoManifest, dataDir);

  originalRun.undoneBy = undoRunId;
  originalRun.undoneAt = undoManifest.createdAt;
  await writeManifest(originalRun, dataDir);

  const eventType =
    status === "applied"
      ? "organizer.run.undone"
      : status === "partially_applied"
        ? "organizer.run.partially_undone"
        : "organizer.run.undo_failed";
  await appendEvent({ type: eventType, data: { runId, undoRunId, summary } }, dataDir);

  return undoManifest;
}
