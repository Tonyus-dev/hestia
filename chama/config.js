// Chama Local — configuração central, somente leitura.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

export const config = {
  appName: "Héstia Console",
  serverName: "Héstia",
  agentName: "Chama Local",
  version: pkg.version || "0.1.0",
  host: process.env.HESTIA_HOST || "127.0.0.1",
  port: Number(process.env.HESTIA_PORT || 4517),
  mode: "local-readonly",
  readonly: true,
  lanEnabled: false,
  storagePaths: ["/", process.env.HESTIA_STORAGE_PATH || "/KALINE"],
  services: ["jellyfin", "syncthing", "smbd", "tailscaled"],
};
