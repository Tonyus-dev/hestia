// Chama Local — plano dry-run de organização. Só cálculo: nunca move, copia ou apaga nada.
// O plano é sempre gerado pela própria Héstia (nunca aceito do cliente) e persistido em disco
// para que o apply (chama/organizerApply.js) sempre aplique exatamente o que foi aprovado, e
// não um recálculo potencialmente diferente feito no momento do apply.
import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getStorageModel } from "./storageModel.js";
import { listFiles, DEFAULT_INDEX_LIMITS } from "./storageScanner.js";
import { config } from "./config.js";
import { isValidOrganizerId } from "./organizerIds.js";

const ROOT = "/KALINE";

const RECENTLY_MODIFIED_MS = 60_000;
const QUARANTINE_RELATIVE_PATH = "ash/quarentena";

const EXTENSION_RULES = [
  { extensions: [".pdf"], relativePath: "codice/pdf" },
  { extensions: [".epub"], relativePath: "codice/epub" },
  { extensions: [".md", ".txt"], relativePath: "codice/fichamentos" },
  { extensions: [".doc", ".docx", ".odt"], relativePath: "documentos/textos" },
  { extensions: [".xls", ".xlsx", ".csv", ".ods"], relativePath: "documentos/planilhas" },
  { extensions: [".ppt", ".pptx", ".odp"], relativePath: "documentos/apresentacoes" },
  { extensions: [".mp4", ".mkv", ".avi", ".mov"], relativePath: "midia/videos" },
  { extensions: [".mp3", ".flac", ".wav", ".m4a"], relativePath: "midia/audio" },
  { extensions: [".eps", ".svg", ".ai", ".cdr"], relativePath: "design/vetores" },
  {
    extensions: [".psd", ".fig", ".sketch", ".xd", ".afdesign", ".indd"],
    relativePath: "design/projetos",
  },
  { extensions: [".jpg", ".jpeg", ".png", ".webp", ".heic"], relativePath: "midia/imagens" },
  { extensions: [".zip", ".rar", ".7z", ".tar", ".gz"], relativePath: "arquivos/compactados" },
  {
    extensions: [".exe", ".msi", ".bat", ".cmd", ".scr", ".apk", ".deb", ".sh"],
    relativePath: QUARANTINE_RELATIVE_PATH,
  },
];
const FALLBACK_RELATIVE_PATH = "entrada/revisar";

export function targetRelativePathFor(ext) {
  const rule = EXTENSION_RULES.find((r) => r.extensions.includes(ext));
  return rule ? rule.relativePath : FALLBACK_RELATIVE_PATH;
}

function datePartsFor(file) {
  const ms = file.mtimeMs || file.birthtimeMs || Date.now();
  const date = new Date(ms);
  return { yyyy: String(date.getFullYear()), mm: String(date.getMonth() + 1).padStart(2, "0") };
}

function ignoredItem(file, action, source, reason, ignoredReason) {
  return {
    id: randomUUID(),
    sourceKind: source.kind,
    sourceLabel: sourceLabelFor(file, source),
    sourcePath: file.path,
    targetPath: file.path,
    action,
    reason,
    risk: "low",
    status: "ignored",
    size: file.size,
    mtimeMs: file.mtimeMs,
    mtimeIso: file.mtimeIso,
    ignoredReason,
  };
}

function sourceLabelFor(file, source) {
  if (
    source.kind !== "dispositivo" ||
    !source.rootPath ||
    !file.path.startsWith(`${source.rootPath}/`)
  ) {
    return source.label;
  }
  const parts = file.path.slice(source.rootPath.length + 1).split(/[\/]/);
  return parts.length > 1 ? parts[0] : source.label;
}

async function targetExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function planItemsForFiles(files, action, source = { kind: "unknown", label: "unknown" }) {
  const items = [];
  for (const file of files) {
    const targetBaseRelativePath = targetRelativePathFor(file.ext);
    const { yyyy, mm } = datePartsFor(file);
    const targetRelativePath = join(targetBaseRelativePath, yyyy, mm);
    const targetPath = join(ROOT, targetRelativePath, basename(file.path));
    // Cinto e suspensório: EXTENSION_RULES é uma tabela fixa e basename() já corta qualquer
    // ".." do nome do arquivo, então isso nunca deveria disparar — mas se um dia essa tabela
    // vier a ser configurável, isso barra o plano de escapar de /KALINE.
    if (!targetPath.startsWith(`${ROOT}/`)) {
      throw new Error(`targetPath calculado fora de ${ROOT}: ${targetPath}`);
    }
    if (file.path === targetPath) {
      items.push(ignoredItem(file, action, source, "arquivo já organizado", "already_organized"));
      continue;
    }
    if (file.mtimeMs && Date.now() - file.mtimeMs < RECENTLY_MODIFIED_MS) {
      items.push(
        ignoredItem(
          file,
          action,
          source,
          "arquivo recém-modificado; aguardando estabilidade",
          "recently_modified",
        ),
      );
      continue;
    }
    const conflict = await targetExists(targetPath);
    items.push({
      id: randomUUID(),
      sourceKind: source.kind,
      sourceLabel: sourceLabelFor(file, source),
      sourcePath: file.path,
      targetPath,
      action,
      reason: `${file.ext || "(sem extensão)"} → ${targetRelativePath}`,
      risk: conflict ? "medium" : "low",
      status: conflict ? "conflict" : "planned",
      size: file.size,
      mtimeMs: file.mtimeMs,
      mtimeIso: file.mtimeIso,
    });
  }
  return items;
}

// entrada já está dentro de /KALINE: reorganizar é um "move" no mesmo volume.
// Fontes externas (mode: "external-readonly") nunca perdem o arquivo original: é sempre "copy".
export async function generateOrganizerPlan(limits = DEFAULT_INDEX_LIMITS) {
  const model = getStorageModel();
  const inboxFolders = ["entrada-uploads", "entrada-dispositivos", "entrada-manual"]
    .map((id) => model.folders.find((f) => f.id === id))
    .filter(Boolean);
  const entradaFolders = inboxFolders.length
    ? inboxFolders
    : model.folders.filter((f) => f.id === "entrada");

  let ignoredFromScanner = 0;
  let entradaItems = [];
  for (const folder of entradaFolders) {
    const listing = await listFiles(folder.absolutePath, limits);
    ignoredFromScanner += listing.ignored || 0;
    entradaItems = entradaItems.concat(
      await planItemsForFiles(listing.files, "move", {
        kind:
          folder.id === "entrada-uploads"
            ? "upload"
            : folder.id === "entrada-dispositivos"
              ? "dispositivo"
              : folder.id === "entrada-manual"
                ? "manual"
                : "entrada",
        label: folder.id === "entrada-dispositivos" ? "dispositivos" : folder.label || folder.id,
        rootPath: folder.absolutePath,
      }),
    );
  }

  const sources = config.storageSources || [];
  let sourceItems = [];
  for (const source of sources) {
    const listing = await listFiles(source.path, limits);
    ignoredFromScanner += listing.ignored || 0;
    sourceItems = sourceItems.concat(
      await planItemsForFiles(listing.files, "copy", {
        kind: "external",
        label: source.label || source.id,
      }),
    );
  }

  const items = [...entradaItems, ...sourceItems];
  const summary = {
    total: items.length + ignoredFromScanner,
    planned: items.filter((i) => i.status === "planned").length,
    conflicts: items.filter((i) => i.status === "conflict").length,
    ignored: items.filter((i) => i.status === "ignored").length + ignoredFromScanner,
    quarantined: items.filter((i) => i.targetPath.includes("/ash/quarentena/")).length,
  };

  return {
    planId: `plan_${Date.now()}_${randomUUID().slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    items,
    summary,
  };
}

function planPath(planId, dataDir) {
  return join(dataDir, "organizer", "plans", `${planId}.json`);
}

export async function writePlan(plan, dataDir) {
  const dir = join(dataDir, "organizer", "plans");
  await fs.mkdir(dir, { recursive: true });
  const finalPath = planPath(plan.planId, dataDir);
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(plan, null, 2), "utf8");
  await fs.rename(tmpPath, finalPath);
  return plan;
}

export async function getPlan(planId, dataDir) {
  // planId vem do body do POST — mesma defesa contra path traversal que getOrganizerRun.
  if (!isValidOrganizerId(planId)) return null;
  try {
    const raw = await fs.readFile(planPath(planId, dataDir), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
