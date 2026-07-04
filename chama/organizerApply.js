// Chama Local — aplicação local de um plano já gerado pela própria Héstia.
// Só aplica planos persistidos por chama/organizerPlan.js (nunca aceita paths/lista de
// arquivos vindos do cliente). Operações permitidas: move, copy. Nunca sobrescreve um
// targetPath existente (re-verificado aqui, mesmo que o plano já tenha marcado "conflict").
// Nunca apaga sem antes verificar que a cópia foi bem-sucedida (fallback de EXDEV).
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { appendEvent } from "./events.js";

async function targetExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function moveWithExdevFallback(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
  }
  // rename entre filesystems diferentes (comum ao mover de um HD externo para /KALINE):
  // copia, verifica o tamanho e só então apaga a origem.
  await fs.copyFile(sourcePath, targetPath);
  const [srcStat, dstStat] = await Promise.all([fs.stat(sourcePath), fs.stat(targetPath)]);
  if (srcStat.size !== dstStat.size) {
    await fs.unlink(targetPath).catch(() => {});
    throw new Error("verificação de tamanho falhou após cópia cross-device");
  }
  await fs.unlink(sourcePath);
}

async function applyItem(item) {
  if (item.status === "conflict") {
    return { ...item, status: "skipped", error: "conflito detectado no plano" };
  }
  await fs.mkdir(dirname(item.targetPath), { recursive: true });
  if (await targetExists(item.targetPath)) {
    return { ...item, status: "skipped", error: "target já existe (conflito)" };
  }
  try {
    if (item.action === "move") {
      await moveWithExdevFallback(item.sourcePath, item.targetPath);
    } else {
      await fs.copyFile(item.sourcePath, item.targetPath);
    }
    return { ...item, status: "ok" };
  } catch (err) {
    return { ...item, status: "failed", error: err.code || err.message };
  }
}

function runPath(runId, dataDir) {
  return join(dataDir, "organizer", "runs", `${runId}.json`);
}

async function writeManifest(manifest, dataDir) {
  const dir = join(dataDir, "organizer", "runs");
  await fs.mkdir(dir, { recursive: true });
  const finalPath = runPath(manifest.runId, dataDir);
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.rename(tmpPath, finalPath);
}

export async function applyOrganizerPlan(plan, dataDir) {
  const runId = `org_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const operations = [];
  for (const item of plan.items) {
    operations.push(await applyItem(item));
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

  const manifest = {
    runId,
    planId: plan.planId,
    createdAt: new Date().toISOString(),
    status,
    mode: "local-only",
    operations: operations.map(
      ({ sourcePath, targetPath, action, status: opStatus, reason, error }) => ({
        from: sourcePath,
        to: targetPath,
        action,
        status: opStatus,
        reason,
        ...(error ? { error } : {}),
      }),
    ),
    summary,
  };

  await writeManifest(manifest, dataDir);

  const eventType =
    status === "applied"
      ? "organizer.plan.applied"
      : status === "partially_applied"
        ? "organizer.plan.partially_applied"
        : "organizer.plan.failed";
  await appendEvent({ type: eventType, data: { runId, planId: plan.planId, summary } }, dataDir);

  return manifest;
}

export async function getOrganizerRuns(dataDir) {
  try {
    const dir = join(dataDir, "organizer", "runs");
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function getOrganizerRun(runId, dataDir) {
  try {
    const raw = await fs.readFile(runPath(runId, dataDir), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
