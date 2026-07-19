import os from "node:os";
import { readFile, statfs } from "node:fs/promises";

function percent(used, total) {
  return total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
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
        .map((line) => {
          const match = line.match(/^(\w+):\s+(\d+)/);
          return match ? [match[1], Number(match[2]) * 1024] : [];
        })
        .filter((entry) => entry.length),
    );
    const totalBytes = values.MemTotal || os.totalmem();
    const freeBytes = values.MemAvailable || os.freemem();
    const swapTotalBytes = values.SwapTotal || 0;
    const swapFreeBytes = values.SwapFree || 0;
    return { totalBytes, freeBytes, swapTotalBytes, swapFreeBytes };
  } catch {
    return {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      swapTotalBytes: 0,
      swapFreeBytes: 0,
    };
  }
}

async function readRootDisk() {
  const stats = await statfs("/");
  const totalBytes = stats.blocks * stats.bsize;
  const freeBytes = stats.bavail * stats.bsize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return { totalBytes, usedBytes, freeBytes, usedPercent: percent(usedBytes, totalBytes) };
}

export async function getStationSystemStatus() {
  const cpus = os.cpus();
  const mem = await readMeminfo();
  const usedBytes = Math.max(0, mem.totalBytes - mem.freeBytes);
  const swapUsedBytes = Math.max(0, mem.swapTotalBytes - mem.swapFreeBytes);
  const [usagePercent, rootDisk] = await Promise.all([readProcStat(), readRootDisk()]);
  return {
    ok: true,
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSeconds: Math.max(0, os.uptime()),
      cpu: {
        model: cpus[0]?.model || "não disponível",
        cores: Math.max(1, cpus.length),
        threads: Math.max(1, cpus.length),
        loadAverage: os.loadavg(),
        usagePercent,
      },
      memory: {
        totalBytes: mem.totalBytes,
        usedBytes,
        freeBytes: mem.freeBytes,
        usedPercent: percent(usedBytes, mem.totalBytes),
      },
      swap: {
        totalBytes: mem.swapTotalBytes,
        usedBytes: swapUsedBytes,
        freeBytes: mem.swapFreeBytes,
        usedPercent: percent(swapUsedBytes, mem.swapTotalBytes),
      },
      rootDisk,
    },
  };
}
