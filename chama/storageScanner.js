// Chama Local — varredura read-only de /KALINE e das fontes externas configuradas.
// Nunca aceita path vindo de fora (só de storageModel.js ou de config.storageSources, que só
// vem do whitelist de ~/.chama/config.json — nunca de query/body/header).
// Nunca segue symlink recursivamente nesta PR. Nunca devolve lista de arquivos, só resumo
// agregado (contagem/bytes/extensões) — mesmo em endpoints locais, não só na Presence.
import { readdir, stat, lstat } from "node:fs/promises";
import { extname, join } from "node:path";
import { getStorageModel } from "./storageModel.js";
import { config } from "./config.js";

export const DEFAULT_INDEX_LIMITS = {
  maxDepth: 4,
  maxFiles: 5000,
};

async function walk(rootPath, limits, state) {
  async function walkDir(dirPath, depth) {
    if (state.truncated) return;
    if (depth > limits.maxDepth) {
      state.truncated = true;
      state.truncatedReason = "maxDepth";
      return;
    }
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      state.safeErrors.push({ path: dirPath, code: err.code || "EUNKNOWN" });
      return;
    }
    for (const entry of entries) {
      if (state.truncated) return;
      if (entry.isSymbolicLink()) continue; // não segue symlink recursivamente nesta PR
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walkDir(entryPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue; // ignora sockets/fifos/devices
      if (state.files >= limits.maxFiles) {
        state.truncated = true;
        state.truncatedReason = "maxFiles";
        return;
      }
      try {
        const st = await stat(entryPath);
        state.files += 1;
        state.bytes += st.size;
        const ext = extname(entry.name).toLowerCase() || "(sem extensão)";
        state.extensions.set(ext, (state.extensions.get(ext) || 0) + 1);
      } catch (err) {
        state.safeErrors.push({ path: entryPath, code: err.code || "EUNKNOWN" });
      }
    }
  }
  await walkDir(rootPath, 0);
}

export async function scanPath(targetPath, limits = DEFAULT_INDEX_LIMITS) {
  const generatedAt = new Date().toISOString();
  let rootStat;
  try {
    rootStat = await lstat(targetPath);
  } catch (err) {
    return {
      path: targetPath,
      exists: false,
      files: 0,
      bytes: 0,
      extensions: {},
      truncated: false,
      safeErrors: [{ path: targetPath, code: err.code || "ENOENT" }],
      generatedAt,
    };
  }
  if (!rootStat.isDirectory()) {
    return {
      path: targetPath,
      exists: true,
      files: 0,
      bytes: 0,
      extensions: {},
      truncated: false,
      safeErrors: [{ path: targetPath, code: "ENOTDIR" }],
      generatedAt,
    };
  }

  const state = {
    files: 0,
    bytes: 0,
    extensions: new Map(),
    safeErrors: [],
    truncated: false,
    truncatedReason: null,
  };
  await walk(targetPath, limits, state);

  return {
    path: targetPath,
    exists: true,
    files: state.files,
    bytes: state.bytes,
    extensions: Object.fromEntries(state.extensions),
    truncated: state.truncated,
    ...(state.truncated ? { reason: state.truncatedReason } : {}),
    safeErrors: state.safeErrors,
    generatedAt,
  };
}

export async function scanStorageModel(limits = DEFAULT_INDEX_LIMITS) {
  const model = getStorageModel();
  const folders = await Promise.all(
    model.folders.map(async (folder) => {
      const scan = await scanPath(folder.absolutePath, limits);
      return { id: folder.id, label: folder.label, category: folder.category, ...scan };
    }),
  );
  return { root: model.root, folders, generatedAt: new Date().toISOString() };
}

export async function scanConfiguredSources(limits = DEFAULT_INDEX_LIMITS) {
  const sources = config.storageSources || [];
  const items = await Promise.all(
    sources.map(async (source) => {
      const scan = await scanPath(source.path, limits);
      return {
        id: source.id,
        label: source.label,
        category: source.category,
        mode: source.mode,
        ...scan,
      };
    }),
  );
  return { items, generatedAt: new Date().toISOString() };
}
