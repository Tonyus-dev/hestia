import { isAbsolute, relative, resolve, sep } from "node:path";
import { isValidOrganizerId } from "./organizerIds.js";

function inside(pathValue, root) {
  const child = resolve(pathValue);
  const parent = resolve(root);
  return child === parent || child.startsWith(`${parent}${sep}`);
}

function safeRelative(root, pathValue) {
  if (!pathValue || !isAbsolute(pathValue) || !inside(pathValue, root)) return null;
  const value = relative(root, pathValue).split(sep).join("/");
  if (!value || value.startsWith("../") || value.includes("/../")) return null;
  return value;
}

function publicSource(pathValue, item, options) {
  const external = (options.storageSources || []).find((source) => inside(pathValue, source.path));
  if (external) {
    return {
      kind: "external",
      label: external.label,
      relativePath: safeRelative(external.path, pathValue) || "unknown",
    };
  }
  let relativePath = safeRelative(options.storagePath, pathValue) || "unknown";
  relativePath = relativePath.replace(/^entrada\/(uploads|dispositivos|manual|revisar)\//, "");
  return {
    kind: "entrada",
    label: item.sourceKind === "manual" ? "Entrada manual" : item.sourceLabel || "Entrada",
    relativePath,
  };
}

function publicTarget(pathValue, options) {
  return { relativePath: safeRelative(options.storagePath, pathValue) || "unknown" };
}

function safeOperationError(value) {
  if (!value) return null;
  const known = {
    "conflito detectado no plano": "conflict",
    "target já existe (conflito)": "conflict",
    "destino foi alterado após a execução": "target_modified",
    "arquivo não está mais no destino": "target_missing",
    "origem já existe de novo; não sobrescreve": "source_exists",
  };
  return known[value] || "operation_failed";
}

export function publicOrganizerOperation(operation, options) {
  const sourcePath = operation.sourcePath || operation.from;
  const targetPath = operation.targetPath || operation.to;
  return {
    source: publicSource(sourcePath, operation, options),
    target: publicTarget(targetPath, options),
    action: operation.action || "move",
    status: operation.status || "failed",
    reason: operation.reason || null,
    error: safeOperationError(operation.error),
    undoPossible: operation.undoPossible === true,
  };
}

export function publicOrganizerPlan(plan, options) {
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    plan: {
      planId: plan.planId,
      generatedAt: plan.generatedAt,
      dryRun: true,
      requiresExtraConfirmation: plan.requiresExtraConfirmation === true,
      largePlanThreshold: plan.largePlanThreshold,
      planned: plan.planned,
      items: plan.items.map((item) => ({
        id: item.id,
        source: publicSource(item.sourcePath, item, options),
        target: publicTarget(item.targetPath, options),
        action: item.action,
        reason: item.reason || null,
        risk: item.risk || "low",
        status: item.status,
        size: Number.isFinite(item.size) ? item.size : 0,
        mtimeIso: item.mtimeIso || null,
        ignoredReason: item.ignoredReason || null,
      })),
      summary: {
        total: plan.summary.total,
        planned: plan.summary.planned,
        conflicts: plan.summary.conflicts,
        ignored: plan.summary.ignored,
        quarantined: plan.summary.quarantined,
        byExtension: { ...(plan.summary.byExtension || {}) },
        byTargetArea: { ...(plan.summary.byTargetArea || {}) },
        rules: {
          extensionRules: (plan.summary.rules?.extensionRules || []).map((rule) => ({
            extensions: [...rule.extensions],
            relativePath: rule.relativePath,
          })),
          fallback: plan.summary.rules?.fallback || "entrada/revisar",
        },
      },
    },
  };
}

export function publicOrganizerRunSummary(run) {
  return {
    runId: run.runId,
    status: run.status,
    undoOf: run.undoOf || null,
    undoneBy: run.undoneBy || null,
    redoOf: run.redoOf || null,
    redoneBy: run.redoneBy || null,
  };
}

export function publicOrganizerRuns(items) {
  const statuses = new Set(["applied", "partially_applied", "failed"]);
  const safeItems = items.filter(
    (item) =>
      isValidOrganizerId(item.runId) &&
      statuses.has(item.status) &&
      [item.undoOf, item.undoneBy, item.redoOf, item.redoneBy].every(
        (value) => value == null || isValidOrganizerId(value),
      ),
  );
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    items: safeItems.map(publicOrganizerRunSummary),
  };
}

export function publicOrganizerRun(run, options) {
  const kind = run.undoOf ? "undo" : run.redoOf ? "redo" : "apply";
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    run: {
      runId: run.runId,
      planId: run.planId,
      kind,
      status: run.status,
      createdAt: run.createdAt || run.appliedAt,
      appliedAt: run.appliedAt || run.createdAt,
      undoOf: run.undoOf || null,
      undoneBy: run.undoneBy || null,
      redoOf: run.redoOf || null,
      redoneBy: run.redoneBy || null,
      operations: (run.operations || []).map((operation) =>
        publicOrganizerOperation(operation, options),
      ),
      summary: {
        total: run.summary?.total || 0,
        ok: run.summary?.ok || 0,
        failed: run.summary?.failed || 0,
        skipped: run.summary?.skipped || 0,
      },
    },
  };
}
