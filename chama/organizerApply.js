// Chama Local — aplicação local de um plano já gerado pela própria Héstia.
// Só aplica planos persistidos por chama/organizerPlan.js (nunca aceita paths/lista de
// arquivos vindos do cliente). Operações permitidas: move, copy. Nunca sobrescreve um
// targetPath existente (re-verificado aqui, mesmo que o plano já tenha marcado "conflict").
// Nunca apaga sem antes verificar que a cópia foi bem-sucedida (fallback de EXDEV).
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { appendEvent } from "./events.js";
import { isValidOrganizerId } from "./organizerIds.js";
import { legacyStorageRoot } from "./legacyStorageConfig.js";
import { config } from "./config.js";

// Exportadas para reaproveitar em chama/organizerUndo.js — mesmo fallback de EXDEV, mesma
// checagem de "não sobrescrever", sem duplicar a lógica em dois lugares.
export async function targetExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function kalineRoot() {
  return legacyStorageRoot();
}
const PLAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const LARGE_PLAN_THRESHOLD = 5000;

function isInside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(`${p}/`);
}

async function getNearestExistingAncestor(targetPath) {
  let current = resolve(targetPath);
  while (true) {
    try {
      const stat = await fs.stat(current);
      return { path: current, stat };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Nenhum ancestral existente para o caminho: ${targetPath}`);
    }
    current = parent;
  }
}

function allowedSourceRoots() {
  return [kalineRoot(), ...(config.storageSources || []).map((source) => source.path)];
}

async function validateItem(item) {
  if (!(await targetExists(item.sourcePath))) return "sourcePath não existe";
  if (!allowedSourceRoots().some((root) => isInside(item.sourcePath, root))) {
    return "sourcePath fora das fontes permitidas";
  }

  // 1. Validação lexical básica contra travessia
  const targetAbs = resolve(item.targetPath);
  const rootAbs = resolve(kalineRoot());
  if (!isInside(targetAbs, rootAbs)) {
    return "targetPath fora de /KALINE";
  }

  if (resolve(item.sourcePath) === targetAbs) {
    return "sourcePath igual a targetPath";
  }

  // 2. Localizar o primeiro ancestral existente de targetPath
  let ancestor;
  try {
    ancestor = await getNearestExistingAncestor(targetAbs);
  } catch (err) {
    return err.message;
  }

  // 3. Resolver realpath do ancestral
  let realAncestor;
  try {
    realAncestor = await fs.realpath(ancestor.path);
  } catch (err) {
    return `erro ao obter realpath do ancestral: ${err.code || err.message}`;
  }

  // 4. Validar se o realpath do ancestral está contido em /KALINE
  const realRoot = await fs.realpath(rootAbs);
  if (!isInside(realAncestor, realRoot)) {
    return "targetPath ancestral escapa de /KALINE";
  }

  // 5. Criar os diretórios e validar o targetPath final
  try {
    await fs.mkdir(dirname(targetAbs), { recursive: true });
    const realTargetDir = await fs.realpath(dirname(targetAbs));
    if (!isInside(realTargetDir, realRoot)) {
      return "targetPath escapa de /KALINE via symlink/realpath";
    }
  } catch (err) {
    return err.code || err.message;
  }

  if (await targetExists(targetAbs)) {
    return "target já existe (conflito)";
  }
  return null;
}

function assertPlanFresh(plan) {
  if (!plan.generatedAt) return;
  const age = Date.now() - Date.parse(plan.generatedAt);
  if (!Number.isFinite(age) || age > PLAN_MAX_AGE_MS) {
    throw Object.assign(new Error("Plano expirado"), {
      code: "EPLANEXPIRED",
      detail: "Gere um novo plano antes de aplicar.",
    });
  }
}

function assertLargePlanConfirmed(plan, confirmedPlanId) {
  const planned = plan.summary?.planned ?? plan.items.filter((i) => i.status === "planned").length;
  if (planned > LARGE_PLAN_THRESHOLD && confirmedPlanId !== plan.planId) {
    throw Object.assign(new Error("Plano grande exige confirmação extra"), {
      code: "ELARGEPLANCONFIRM",
      detail: `Este plano afeta ${planned} arquivos.`,
    });
  }
}

export async function moveWithExdevFallback(sourcePath, targetPath) {
  let linked = false;
  try {
    await fs.link(sourcePath, targetPath);
    linked = true;
    await fs.unlink(sourcePath);
    return;
  } catch (err) {
    if (linked) {
      await fs.unlink(targetPath).catch(() => {});
      throw err;
    }
    const fallbackCodes = ["EXDEV", "EPERM", "EOPNOTSUPP", "ENOSYS"];
    if (!fallbackCodes.includes(err.code)) {
      throw err;
    }
  }

  let copied = false;
  try {
    await fs.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    copied = true;
    const [srcStat, dstStat] = await Promise.all([fs.stat(sourcePath), fs.stat(targetPath)]);
    if (srcStat.size !== dstStat.size) {
      throw new Error("verificação de tamanho falhou após cópia cross-device");
    }
    await fs.unlink(sourcePath);
  } catch (err) {
    if (copied) {
      await fs.unlink(targetPath).catch(() => {});
    }
    throw err;
  }
}

async function applyItem(item) {
  if (item.status === "conflict") {
    return { ...item, status: "skipped", error: "conflito detectado no plano" };
  }
  if (item.status === "ignored" || item.sourcePath === item.targetPath) {
    return { ...item, status: "skipped", error: item.ignoredReason || "item ignorado no plano" };
  }
  const validationError = await validateItem(item);
  if (validationError) return { ...item, status: "skipped", error: validationError };
  try {
    if (item.action === "move") {
      await moveWithExdevFallback(item.sourcePath, item.targetPath);
    } else {
      await fs.copyFile(item.sourcePath, item.targetPath, fs.constants.COPYFILE_EXCL);
    }
    const targetStat = await fs.stat(item.targetPath);
    return {
      ...item,
      status: "ok",
      targetSize: targetStat.size,
      targetMtimeMs: targetStat.mtime.getTime(),
    };
  } catch (err) {
    return { ...item, status: "failed", error: err.code || err.message };
  }
}

export function runPath(runId, dataDir) {
  return join(dataDir, "organizer", "runs", `${runId}.json`);
}

export async function writeManifest(manifest, dataDir) {
  const dir = join(dataDir, "organizer", "runs");
  await fs.mkdir(dir, { recursive: true });
  const finalPath = runPath(manifest.runId, dataDir);
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.rename(tmpPath, finalPath);
}

export async function applyOrganizerPlan(plan, dataDir, options = {}) {
  assertPlanFresh(plan);
  assertLargePlanConfirmed(plan, options.largePlanConfirmed);
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
    generatedAt: plan.generatedAt,
    appliedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status,
    mode: "local-only",
    operations: operations.map(
      ({
        sourcePath,
        targetPath,
        action,
        status: opStatus,
        reason,
        error,
        targetSize,
        targetMtimeMs,
      }) => ({
        sourcePath,
        targetPath,
        from: sourcePath,
        to: targetPath,
        action,
        status: opStatus,
        reason,
        undoPossible: opStatus === "ok",
        ...(targetSize != null ? { targetSize } : {}),
        ...(targetMtimeMs != null ? { targetMtimeMs } : {}),
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

// Devolve metadados mínimos (não o manifesto inteiro) — o suficiente pra UI decidir quando
// mostra "Desfazer" (execução original, ainda não desfeita) ou "Refazer" (execução de undo,
// ainda não refeita). Uma execução de redo é terminal: nunca mostra nenhum dos dois botões.
export async function getOrganizerRuns(dataDir) {
  try {
    const dir = join(dataDir, "organizer", "runs");
    const files = await fs.readdir(dir);
    const runIds = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
    return await Promise.all(
      runIds.map(async (runId) => {
        const manifest = await getOrganizerRun(runId, dataDir);
        return {
          runId,
          status: manifest?.status ?? null,
          undoOf: manifest?.undoOf ?? null,
          undoneBy: manifest?.undoneBy ?? null,
          redoOf: manifest?.redoOf ?? null,
          redoneBy: manifest?.redoneBy ?? null,
        };
      }),
    );
  } catch {
    return [];
  }
}

export async function getOrganizerRun(runId, dataDir) {
  // runId vem de input do cliente (URL param) — nunca monta o path sem validar o formato
  // primeiro (path.join normaliza "..", então isso é uma defesa real contra path traversal).
  if (!isValidOrganizerId(runId)) return null;
  try {
    const raw = await fs.readFile(runPath(runId, dataDir), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function claimAndApplyOrganizerPlan(planId, dataDir, options = {}) {
  if (!isValidOrganizerId(planId)) {
    throw Object.assign(new Error("Plan ID inválido"), { code: "EPLANNOTFOUND" });
  }

  const plansDir = join(dataDir, "organizer", "plans");
  const origPath = join(plansDir, `${planId}.json`);
  const claimPath = join(plansDir, `${planId}.claimed.json`);
  const consumedPath = join(plansDir, `${planId}.consumed.json`);

  if (await targetExists(consumedPath)) {
    throw Object.assign(new Error("Plano já aplicado"), {
      code: "PLAN_ALREADY_APPLIED",
    });
  }

  try {
    await fs.rename(origPath, claimPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      if (await targetExists(claimPath)) {
        throw Object.assign(new Error("Plano já em execução ou reclamado"), {
          code: "PLAN_ALREADY_CLAIMED",
        });
      }
      throw Object.assign(new Error("Plano não encontrado"), {
        code: "EPLANNOTFOUND",
      });
    }
    throw err;
  }

  let plan;
  try {
    const raw = await fs.readFile(claimPath, "utf8");
    plan = JSON.parse(raw);
  } catch (err) {
    await fs.rename(claimPath, origPath).catch(() => {});
    throw err;
  }

  try {
    assertPlanFresh(plan);
    assertLargePlanConfirmed(plan, options.largePlanConfirmed);
  } catch (err) {
    await fs.rename(claimPath, origPath).catch(() => {});
    throw err;
  }

  try {
    const manifest = await applyOrganizerPlan(plan, dataDir, options);
    await fs.rename(claimPath, consumedPath).catch(() => {});
    return manifest;
  } catch (err) {
    await fs.rename(claimPath, consumedPath).catch(() => {});
    throw err;
  }
}
