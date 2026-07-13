// Chama Local — snapshots periódicos do estado (server/services).
// Escreve atomicamente; emite eventos apenas quando um serviço muda de estado.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { getServerStatus } from "./system.js";
import { getServicesStatus } from "./services.js";
import { appendEvent } from "./events.js";

export const SNAPSHOT_INTERVAL_MS = 60_000; // 60 segundos

// Compara serviços anterior/atual, retorna lista de transições
export function diffServiceTransitions(prevSnapshot, currSnapshot) {
  if (!prevSnapshot?.services) return [];

  const transitions = [];
  const prevByName = Object.fromEntries(prevSnapshot.services.items.map((s) => [s.name, s]));
  const currByName = Object.fromEntries(currSnapshot.services.items.map((s) => [s.name, s]));

  // Detecta mudanças de estado
  for (const curr of currSnapshot.services.items) {
    const prev = prevByName[curr.name];
    if (!prev) continue; // Novo serviço: ignora (não é transição)

    if (prev.active && !curr.active) {
      transitions.push({ name: curr.name, from: "active", to: "inactive" });
    } else if (!prev.active && curr.active) {
      transitions.push({ name: curr.name, from: "inactive", to: "active" });
    }
  }

  return transitions;
}

export async function generateSnapshot() {
  const server = getServerStatus();
  const services = await getServicesStatus();
  return {
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SNAPSHOT_INTERVAL_MS * 2).toISOString(),
    server,
    services,
  };
}

export async function writeSnapshot(snapshot, dataDir) {
  const snapshotPath = join(dataDir, "snapshots", "latest.json");
  const tmpPath = `${snapshotPath}.tmp`;

  try {
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
    // Rename atômico (POSIX)
    await fs.rename(tmpPath, snapshotPath);
    return snapshot;
  } catch (err) {
    // Falha ao gravar: ignora (graceful degradation)
    console.error(`[Héstia] erro ao gravar snapshot: ${err.message}`);
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignora erro ao limpar .tmp
    }
    return null;
  }
}

export async function getLatestSnapshot(dataDir) {
  const snapshotPath = join(dataDir, "snapshots", "latest.json");
  try {
    const content = await fs.readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(content);
    const now = new Date();
    const expiresAt = new Date(snapshot.expiresAt);
    return {
      ...snapshot,
      stale: now > expiresAt,
    };
  } catch {
    // Nenhum snapshot gravado ainda
    return {
      status: "unavailable",
      reason: "Nenhum snapshot disponível ainda",
      timestamp: new Date().toISOString(),
    };
  }
}

let lastSnapshot = null;

export async function runSnapshotCycle(dataDir, identityData) {
  try {
    const snapshot = await generateSnapshot();
    await writeSnapshot(snapshot, dataDir);

    // Emite evento apenas se um serviço mudou de estado
    if (lastSnapshot) {
      const transitions = diffServiceTransitions(lastSnapshot, snapshot);
      for (const transition of transitions) {
        const eventType = transition.to === "active" ? "service.up" : "service.down";
        await appendEvent(
          {
            type: eventType,
            data: {
              service: transition.name,
              from: transition.from,
              to: transition.to,
            },
          },
          dataDir,
        );
      }
    }

    lastSnapshot = snapshot;
  } catch (err) {
    console.error(`[Héstia] erro no ciclo de snapshot: ${err.message}`);
  }
}
