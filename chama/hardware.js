import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { getStorageStatus } from "./storage.js";
import { getServicesStatus } from "./services.js";

const pExecFile = promisify(execFile);
const rank = { ok: 0, warn: 1, critical: 2, unavailable: -1 };
export const classifyPercent = (n, warn, critical) =>
  n > critical ? "critical" : n > warn ? "warn" : "ok";
export const worstSeverity = (items) =>
  items.filter((s) => s !== "unavailable").sort((a, b) => rank[b] - rank[a])[0] || "ok";

export function classifyCpu(loadRatio) {
  return loadRatio == null
    ? "unavailable"
    : loadRatio > 1.5
      ? "critical"
      : loadRatio > 0.8
        ? "warn"
        : "ok";
}
export function classifyMemory(usedPercent) {
  return classifyPercent(usedPercent, 75, 90);
}
export function classifySwap(usedPercent) {
  return usedPercent == null ? "ok" : classifyPercent(usedPercent, 50, 80);
}
export function classifyDisk(path, exists, percentUsed) {
  if (!exists) return path === "/KALINE" ? "critical" : "warn";
  return percentUsed == null ? "unavailable" : classifyPercent(percentUsed, 80, 92);
}
export function classifyTemperature(tempC) {
  return tempC > 85 ? "critical" : tempC > 70 ? "warn" : "ok";
}

function firstMountedPartition(disk) {
  return (disk.children || []).find((child) => child.mountpoint);
}

async function readProcStat() {
  try {
    const line = (await readFile("/proc/stat", "utf8")).split("\n")[0];
    const [, ...nums] = line.trim().split(/\s+/).map(Number);
    const idle = nums[3] + (nums[4] || 0);
    const total = nums.reduce((a, b) => a + b, 0);
    return total > 0 ? Math.round(((total - idle) / total) * 1000) / 10 : null;
  } catch {
    return null;
  }
}

async function readMeminfo() {
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const values = Object.fromEntries(
      text
        .split("\n")
        .map((l) => {
          const m = l.match(/^(\w+):\s+(\d+)/);
          return m ? [m[1], Number(m[2]) * 1024] : [];
        })
        .filter((x) => x.length),
    );
    const total = values.MemTotal || os.totalmem();
    const free = values.MemAvailable || os.freemem();
    const swapTotal = values.SwapTotal || 0;
    const swapFree = values.SwapFree || 0;
    return { total, free, swapTotal, swapFree };
  } catch {
    return { total: os.totalmem(), free: os.freemem(), swapTotal: 0, swapFree: 0 };
  }
}

async function readTemperature() {
  try {
    const dirs = await readdir("/sys/class/thermal", { withFileTypes: true });
    const sensors = [];
    for (const d of dirs.filter((x) => x.isDirectory() && x.name.startsWith("thermal_zone"))) {
      try {
        const raw = Number(
          (await readFile(join("/sys/class/thermal", d.name, "temp"), "utf8")).trim(),
        );
        if (!Number.isFinite(raw)) continue;
        let label = d.name;
        try {
          label =
            (await readFile(join("/sys/class/thermal", d.name, "type"), "utf8")).trim() || label;
        } catch {}
        const tempC = raw > 1000 ? raw / 1000 : raw;
        sensors.push({ label, tempC, status: classifyTemperature(tempC) });
      } catch {}
    }
    const maxC = sensors.length ? Math.max(...sensors.map((s) => s.tempC)) : null;
    return {
      status: sensors.length ? worstSeverity(sensors.map((s) => s.status)) : "unavailable",
      available: sensors.length > 0,
      maxC,
      sensors,
    };
  } catch {
    return { status: "unavailable", available: false, maxC: null, sensors: [] };
  }
}

export async function getHardwareStatus() {
  const cpus = os.cpus();
  const cores = Math.max(1, cpus.length);
  const loadAverage = os.loadavg();
  const loadRatio1m = Math.round((loadAverage[0] / cores) * 100) / 100;
  const mem = await readMeminfo();
  const used = mem.total - mem.free;
  const usedPercent = mem.total > 0 ? Math.round((used / mem.total) * 100) : 0;
  const swapUsed = mem.swapTotal - mem.swapFree;
  const swapPercent = mem.swapTotal > 0 ? Math.round((swapUsed / mem.swapTotal) * 100) : null;
  const [temperature, storage, services, usagePercent] = await Promise.all([
    readTemperature(),
    getStorageStatus(),
    getServicesStatus(),
    readProcStat(),
  ]);
  const storageItems = storage.items.map((it) => ({
    ...it,
    status: classifyDisk(it.path, it.exists, it.percentUsed),
  }));
  const serviceActive = services.items.filter((s) => s.active).length;
  const serviceStatus =
    services.items.length === 0 || serviceActive === 0
      ? "critical"
      : serviceActive === services.items.length
        ? "ok"
        : "warn";
  const cpuStatus = classifyCpu(loadRatio1m),
    memoryStatus = classifyMemory(usedPercent),
    swapStatus = classifySwap(swapPercent),
    storageStatus = worstSeverity(storageItems.map((s) => s.status));
  const reasons = [];
  if (cpuStatus !== "ok")
    reasons.push(loadRatio1m > 1.5 ? "load médio crítico" : "load médio alto");
  if (memoryStatus !== "ok")
    reasons.push(usedPercent > 90 ? "memória acima de 90%" : "memória acima de 75%");
  for (const it of storageItems)
    if (it.status !== "ok" && it.status !== "unavailable")
      reasons.push(
        !it.exists ? `${it.path} não montado` : `disco ${it.path} acima de ${it.percentUsed}%`,
      );
  if (serviceStatus !== "ok")
    reasons.push(`${serviceActive}/${services.items.length} serviços ativos`);
  return {
    generatedAt: new Date().toISOString(),
    overall: {
      status: worstSeverity([cpuStatus, memoryStatus, swapStatus, storageStatus, serviceStatus]),
      reasons,
    },
    cpu: {
      status: cpuStatus,
      model: cpus[0]?.model,
      cores,
      threads: cpus.length,
      loadAverage,
      loadRatio1m,
      usagePercent,
    },
    memory: { status: memoryStatus, total: mem.total, free: mem.free, used, usedPercent },
    swap: {
      status: swapStatus,
      total: mem.swapTotal,
      free: mem.swapFree,
      used: swapUsed,
      usedPercent: swapPercent,
    },
    temperature,
    storage: { status: storageStatus, items: storageItems },
    services: {
      status: serviceStatus,
      active: serviceActive,
      total: services.items.length,
      items: services.items,
    },
  };
}

export async function getHardwareConfig(execFileImpl = pExecFile) {
  let disks;
  try {
    const { stdout } = await execFileImpl(
      "lsblk",
      ["-J", "-o", "NAME,TYPE,SIZE,MODEL,MOUNTPOINT,FSTYPE,ROTA"],
      { timeout: 2500 },
    );
    const parsed = JSON.parse(stdout);
    disks = {
      available: true,
      items: (parsed.blockdevices || []).map((d) => {
        const mountedPartition = !d.mountpoint && firstMountedPartition(d);
        return {
          name: d.name,
          type: d.type,
          size: d.size,
          model: d.model,
          mountpoint: d.mountpoint,
          fstype: d.fstype,
          rota: d.rota == null ? null : Boolean(d.rota),
          mountedPartition: mountedPartition
            ? {
                name: mountedPartition.name,
                mountpoint: mountedPartition.mountpoint,
                fstype: mountedPartition.fstype,
              }
            : null,
        };
      }),
    };
  } catch (err) {
    disks = {
      available: false,
      items: [],
      error: err?.code === "ENOENT" ? "lsblk indisponível" : "lsblk indisponível",
    };
  }
  const cpus = os.cpus();
  return {
    generatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptime: os.uptime(),
    cpu: {
      model: cpus[0]?.model || "não disponível",
      cores: Math.max(1, cpus.length),
      threads: cpus.length,
    },
    memory: { total: os.totalmem() },
    disks,
    hestia: {
      host: config.host,
      port: config.port,
      mode: config.mode,
      lanEnabled: config.lanEnabled,
      storagePaths: config.storagePaths,
      services: config.services,
    },
  };
}
