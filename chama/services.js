// Chama Local — systemctl is-active para lista FIXA.
// Nunca aceita nome de serviço vindo de fora.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const pExecFile = promisify(execFile);

async function check(name) {
  const now = new Date().toISOString();
  try {
    const { stdout } = await pExecFile("systemctl", ["is-active", name], { timeout: 2500 });
    const raw = stdout.trim();
    return { name, active: raw === "active", status: mapStatus(raw), checkedAt: now };
  } catch (err) {
    const raw = (err.stdout || "").toString().trim();
    if (raw) return { name, active: false, status: mapStatus(raw), checkedAt: now };
    if (err.code === "ENOENT") {
      return { name, active: false, status: "unavailable", checkedAt: now };
    }
    return { name, active: false, status: "unknown", checkedAt: now };
  }
}

function mapStatus(raw) {
  if (raw === "active") return "active";
  if (raw === "inactive") return "inactive";
  if (raw === "failed") return "failed";
  if (raw === "unknown") return "not-installed";
  return "unknown";
}

export async function getServicesStatus() {
  const items = await Promise.all(config.services.map(check));
  return { items };
}
