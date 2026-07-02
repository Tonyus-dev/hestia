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

// --- CLI flags: --port <n> / --host <h> / --help ----------------------------
function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--port" || a === "-p") out.port = Number(argv[++i]);
    else if (a === "--host") out.host = String(argv[++i]);
    else if (a.startsWith("--port=")) out.port = Number(a.slice(7));
    else if (a.startsWith("--host=")) out.host = a.slice(7);
  }
  return out;
}
const cli = parseCliArgs(process.argv.slice(2));
if (cli.help) {
  console.log(
    `Héstia Console\n\nUso: node hestia.js [--port <n>] [--host <h>]\n` +
      `Também aceita HESTIA_PORT / HESTIA_HOST via env.\nPadrão: 127.0.0.1:4517`,
  );
  process.exit(0);
}
if (cli.port && Number.isFinite(cli.port)) config.port = cli.port;
if (cli.host) config.host = cli.host;

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

// Nunca vazar stack traces, mas devolver contexto útil para diagnóstico rápido.
app.setErrorHandler((err, req, reply) => {
  const code = err.code || err.name || "InternalError";
  const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const detail = err.message || "erro sem mensagem";
  log("error", `${req.method} ${req.url} → ${code}: ${detail}`);
  reply.code(status).send({
    ok: false,
    error: "Erro na Chama Local",
    code,
    detail,
    route: `${req.method} ${req.url}`,
    hint:
      code === "ENOENT"
        ? "Caminho/binário ausente no host (ex.: df, systemctl, storagePath)."
        : code === "EACCES" || code === "EPERM"
          ? "Permissão negada — verifique se o usuário tem acesso ao recurso."
          : code === "ETIMEDOUT"
            ? "Tempo esgotado ao consultar o SO."
            : "Consulte o /logs do Héstia para o traço completo.",
    at: new Date().toISOString(),
  });
});

app.get("/api/health", async () => getHealth());
app.get("/api/server/status", async () => getServerStatus());
app.get("/api/storage/status", async () => await getStorageStatus());
app.get("/api/services/status", async () => await getServicesStatus());
app.get("/api/logs", async (req) => {
  const raw = Number(req.query?.tail);
  const tail = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 100;
  return getLogs(tail);
});
app.get("/api/config", async () => ({
  appName: config.appName,
  serverName: config.serverName,
  agentName: config.agentName,
  version: config.version,
  host: config.host,
  port: config.port,
  mode: config.mode,
  readonly: config.readonly,
  lanEnabled: config.host !== "127.0.0.1" && config.host !== "localhost",
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
