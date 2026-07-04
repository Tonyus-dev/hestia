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

const EXTENSION_RULES = [
  { extensions: [".pdf"], relativePath: "codice/pdf" },
  { extensions: [".epub"], relativePath: "codice/epub" },
  { extensions: [".md", ".txt"], relativePath: "codice/fichamentos" },
  { extensions: [".doc", ".docx"], relativePath: "arquivos" },
  { extensions: [".mp4", ".mkv", ".avi"], relativePath: "midia/videos" },
  { extensions: [".mp3", ".flac", ".wav"], relativePath: "midia/audio" },
  { extensions: [".jpg", ".jpeg", ".png", ".webp"], relativePath: "midia/imagens" },
  { extensions: [".zip", ".rar", ".7z"], relativePath: "arquivos/compactados" },
];
const FALLBACK_RELATIVE_PATH = "entrada/revisar";

export function targetRelativePathFor(ext) {
  const rule = EXTENSION_RULES.find((r) => r.extensions.includes(ext));
  return rule ? rule.relativePath : FALLBACK_RELATIVE_PATH;
}

async function targetExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function planItemsForFiles(files, action) {
  const items = [];
  for (const file of files) {
    const targetRelativePath = targetRelativePathFor(file.ext);
    const targetPath = join(ROOT, targetRelativePath, basename(file.path));
    // Cinto e suspensório: EXTENSION_RULES é uma tabela fixa e basename() já corta qualquer
    // ".." do nome do arquivo, então isso nunca deveria disparar — mas se um dia essa tabela
    // vier a ser configurável, isso barra o plano de escapar de /KALINE.
    if (!targetPath.startsWith(`${ROOT}/`)) {
      throw new Error(`targetPath calculado fora de ${ROOT}: ${targetPath}`);
    }
    const conflict = await targetExists(targetPath);
    items.push({
      id: randomUUID(),
      sourcePath: file.path,
      targetPath,
      action,
      reason: `${file.ext || "(sem extensão)"} → ${targetRelativePath}`,
      risk: conflict ? "medium" : "low",
      status: conflict ? "conflict" : "planned",
    });
  }
  return items;
}

// entrada já está dentro de /KALINE: reorganizar é um "move" no mesmo volume.
// Fontes externas (mode: "external-readonly") nunca perdem o arquivo original: é sempre "copy".
export async function generateOrganizerPlan(limits = DEFAULT_INDEX_LIMITS) {
  const model = getStorageModel();
  const entradaFolder = model.folders.find((f) => f.id === "entrada");

  const entradaListing = await listFiles(entradaFolder.absolutePath, limits);
  const entradaItems = await planItemsForFiles(entradaListing.files, "move");

  const sources = config.storageSources || [];
  let sourceItems = [];
  for (const source of sources) {
    const listing = await listFiles(source.path, limits);
    sourceItems = sourceItems.concat(await planItemsForFiles(listing.files, "copy"));
  }

  const items = [...entradaItems, ...sourceItems];
  const summary = {
    total: items.length,
    planned: items.filter((i) => i.status === "planned").length,
    conflicts: items.filter((i) => i.status === "conflict").length,
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
