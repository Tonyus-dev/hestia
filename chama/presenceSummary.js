// Chama Local — sumário de presence agregando identidade + services + storage.
import { getIdentity } from "./identity.js";
import { getServicesStatus } from "./services.js";
import { getStorageStatus } from "./storage.js";
import { getServerStatus } from "./system.js";
import { getPresenceServiceBindings } from "./serviceBindings.js";

export async function getPresenceSummary(dataDir) {
  const identity = await getIdentity(dataDir);
  const services = await getServicesStatus();
  const storage = await getStorageStatus();
  const server = getServerStatus();

  const activeServices = services.items.filter(s => s.active).length;
  const okStorage = storage.items.filter(s => s.status === "ok").length;

  return {
    timestamp: new Date().toISOString(),
    identity: {
      id: identity.id,
      createdAt: identity.createdAt,
      hostname: identity.machine.hostname,
      platform: identity.machine.platform,
    },
    server: {
      uptime: server.uptime,
      loadAverage: server.loadAverage,
      freeMemory: server.freeMemory,
    },
    servicesSummary: {
      total: services.items.length,
      active: activeServices,
    },
    storageSummary: {
      total: storage.items.length,
      ok: okStorage,
    },
    services: getPresenceServiceBindings(),
  };
}
