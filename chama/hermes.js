import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { generateLocalChat } from "./llm.js";

export const HERMES_FOLDERS = ["inbox", "outbox", "archive", "errors"];
export const ALLOWED_HERMES_TYPES = ["station.status", "llm.chat"];
const MAX_COMMANDS = 10;
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/;

export function safeResolve(root, ...parts) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...parts);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path fora da raiz Hermes.");
  }
  return resolvedPath;
}

function now() {
  return new Date().toISOString();
}

function folderPaths(root) {
  return Object.fromEntries(HERMES_FOLDERS.map((name) => [name, safeResolve(root, name)]));
}

async function assertNoEscapingSymlink(root, filePath) {
  const realRoot = await realpath(root);
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink()) throw new Error("Symlink não permitido em comando Hermes.");
  const realParent = await realpath(path.dirname(filePath));
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("Path real fora da raiz Hermes.");
  }
}

export async function ensureHermesFolders(config) {
  const root = path.resolve(config.hermesRoot);
  await mkdir(root, { recursive: true });
  const folders = {};
  for (const [name, dir] of Object.entries(folderPaths(root))) {
    await mkdir(dir, { recursive: true });
    folders[name] = true;
  }
  return { root, folders };
}

function isTemporaryName(name) {
  return (
    name === ".stversions" ||
    name.endsWith(".tmp") ||
    name.endsWith(".sync") ||
    name.endsWith(".part") ||
    name.endsWith(".crdownload") ||
    name.endsWith(".swp") ||
    name.endsWith(".swx")
  );
}

async function countMatching(dir, predicate) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter(
      (entry) => entry.isFile() && predicate(entry.name),
    ).length;
  } catch {
    return 0;
  }
}

export async function getHermesStatus(config) {
  const checkedAt = now();
  try {
    const { root, folders } = await ensureHermesFolders(config);
    const paths = folderPaths(root);
    return {
      ok: true,
      root,
      folders,
      pending: await countMatching(
        paths.inbox,
        (name) => name.endsWith(".json") && !isTemporaryName(name),
      ),
      processed: await countMatching(paths.outbox, (name) => name.endsWith(".result.json")),
      failed: await countMatching(paths.errors, (name) => name.endsWith(".error.json")),
      checkedAt,
    };
  } catch {
    return {
      ok: false,
      root: path.resolve(config.hermesRoot),
      error: "Hermes root indisponível ou sem permissão.",
      checkedAt,
    };
  }
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command))
    throw new Error("Comando Hermes inválido.");
  if (!SAFE_ID.test(command.id || "") || command.id.includes(".."))
    throw new Error("id Hermes inválido.");
  if (typeof command.source !== "string" || !command.source.trim())
    throw new Error("source Hermes inválido.");
  if (command.target !== "hestia") throw new Error("target Hermes inválido.");
  if (!ALLOWED_HERMES_TYPES.includes(command.type)) {
    const err = new Error("Tipo de comando Hermes não permitido.");
    err.allowedTypes = ALLOWED_HERMES_TYPES;
    throw err;
  }
  if (typeof command.createdAt !== "string" || !command.createdAt.trim())
    throw new Error("createdAt Hermes inválido.");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload))
    throw new Error("payload Hermes inválido.");
}

async function uniquePath(dir, basename) {
  let candidate = safeResolve(dir, basename);
  for (let i = 0; ; i++) {
    try {
      await lstat(candidate);
      const parsed = path.parse(basename);
      candidate = safeResolve(dir, `${parsed.name}.${Date.now()}.${i}${parsed.ext}`);
    } catch (err) {
      if (err.code === "ENOENT") return candidate;
      throw err;
    }
  }
}

async function writeJsonAtomic(dir, basename, data) {
  const target = await uniquePath(dir, basename);
  const tmp = safeResolve(dir, `.${path.basename(target)}.${randomUUID()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, target);
  return target;
}

async function moveOriginal(filePath, dir) {
  const target = await uniquePath(dir, path.basename(filePath));
  await rename(filePath, target);
  return target;
}

async function stationStatus() {
  return { uptime: process.uptime(), hostname: os.hostname(), checkedAt: now() };
}

async function execute(command) {
  if (command.type === "station.status") {
    return {
      id: command.id,
      ok: true,
      type: "station.status.result",
      processedAt: now(),
      result: await stationStatus(),
    };
  }
  try {
    const chat = await generateLocalChat(command.payload);
    return {
      id: command.id,
      ok: true,
      type: "llm.chat.result",
      processedAt: now(),
      result: { text: chat.text, model: chat.model, runtime: chat.runtime },
    };
  } catch (err) {
    if (err.code === "ELLMUNAVAILABLE")
      return {
        id: command.id,
        ok: false,
        type: "llm.chat.result",
        processedAt: now(),
        error: "Runtime local indisponível.",
        result: null,
      };
    throw err;
  }
}

async function failCommand(filePath, errorsDir, fallbackId, err) {
  const id = SAFE_ID.test(fallbackId || "")
    ? fallbackId
    : path.basename(filePath, ".json").replace(/[^A-Za-z0-9._-]/g, "_");
  const body = { id, ok: false, error: err.message || "Erro Hermes.", processedAt: now() };
  if (err.allowedTypes) body.allowedTypes = err.allowedTypes;
  await writeJsonAtomic(errorsDir, `${id}.error.json`, body);
  await moveOriginal(filePath, errorsDir);
  return { id, ok: false, type: "unknown", error: body.error };
}

export async function processHermesOnce(config) {
  const checkedAt = now();
  const { root } = await ensureHermesFolders(config);
  const paths = folderPaths(root);
  const entries = (await readdir(paths.inbox, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const summary = { ok: true, processed: 0, failed: 0, skipped: 0, results: [], checkedAt };
  for (const entry of entries) {
    if (summary.processed + summary.failed >= MAX_COMMANDS) break;
    if (!entry.isFile() || isTemporaryName(entry.name)) {
      summary.skipped++;
      continue;
    }
    if (!entry.name.endsWith(".json")) {
      summary.skipped++;
      continue;
    }
    const filePath = safeResolve(paths.inbox, entry.name);
    let command;
    try {
      await assertNoEscapingSymlink(root, filePath);
      command = JSON.parse(await readFile(filePath, "utf8"));
      validateCommand(command);
      const result = await execute(command);
      await writeJsonAtomic(paths.outbox, `${command.id}.result.json`, result);
      await moveOriginal(filePath, paths.archive);
      summary.processed++;
      summary.results.push({ id: command.id, ok: result.ok, type: command.type });
    } catch (err) {
      summary.failed++;
      summary.results.push(await failCommand(filePath, paths.errors, command?.id, err));
    }
  }
  return summary;
}
