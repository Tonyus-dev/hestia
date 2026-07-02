import { hostname } from "node:os";
import { config } from "./config.js";

export function getHealth() {
  return {
    ok: true,
    appName: config.appName,
    serverName: config.serverName,
    agentName: config.agentName,
    version: config.version,
    hostname: hostname(),
    timestamp: new Date().toISOString(),
    processUptime: process.uptime(),
    readonly: config.readonly,
  };
}
