// Héstia Console — servidor local Fastify que embute a Chama Local
// e serve o frontend buildado. Somente leitura.
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { config } from "./chama/config.js";
import { getHealth } from "./chama/health.js";
import { getServerStatus } from "./chama/system.js";
import { getStorageStatus } from "./chama/storage.js";
import { getServicesStatus } from "./chama/services.js";
import { getLogs, log } from "./chama/logs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

// Nunca vazar stack traces para o usuário.
app.setErrorHandler((err, _req, reply) => {
  log("error", `handler: ${err.message}`);
  reply.code(500).send({ ok: false, error: "Erro interno da Chama Local" });
});

app.get("/api/health", async () => getHealth());
app.get("/api/server/status", async () => getServerStatus());
app.get("/api/storage/status", async () => await getStorageStatus());
app.get("/api/services/status", async () => await getServicesStatus());
app.get("/api/logs", async () => getLogs());
app.get("/api/config", async () => ({
  appName: config.appName,
  serverName: config.serverName,
  agentName: config.agentName,
  version: config.version,
  host: config.host,
  port: config.port,
  mode: config.mode,
  readonly: config.readonly,
  lanEnabled: config.lanEnabled,
  storagePaths: config.storagePaths,
  services: config.services,
}));

// Servir o frontend buildado quando existir (build output do TanStack Start).
const candidates = [
  join(__dirname, "dist", "client"),
  join(__dirname, "dist"),
  join(__dirname, ".output", "public"),
];
const staticRoot = candidates.find((p) => existsSync(p));
if (staticRoot) {
  await app.register(fastifyStatic, { root: staticRoot, prefix: "/" });
  app.setNotFoundHandler((_req, reply) => {
    const indexPath = join(staticRoot, "index.html");
    if (existsSync(indexPath)) return reply.type("text/html").sendFile("index.html");
    reply.code(404).send({ ok: false, error: "não encontrado" });
  });
} else {
  log("warn", "frontend buildado não encontrado — rode `npm run build` antes de `npm run start`");
}

log("info", `Chama Local iniciando em ${config.host}:${config.port}`);
try {
  await app.listen({ host: config.host, port: config.port });
  log("info", `Héstia Console disponível em http://${config.host}:${config.port}`);
  console.log(`[Héstia] pronto em http://${config.host}:${config.port}`);
} catch (err) {
  log("error", `falha ao iniciar: ${err.message}`);
  console.error(err);
  process.exit(1);
}
