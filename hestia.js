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
import { isLoopbackHost, buildAllowedHosts, isAllowedHostHeader, RateLimiter } from "./chama/security.js";
import { createSsrFetcher, copyResponseHeaders } from "./chama/ssr.js";
import { ensureDataDir } from "./chama/dataDir.js";
import { runSnapshotCycle, SNAPSHOT_INTERVAL_MS } from "./chama/snapshots.js";

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

// Por padrão a Chama Local recusa expor a API fora do host local: evita que
// alguém acidentalmente vaze hostname/paths/serviços/logs para a LAN inteira
// sem autenticação. Quem quiser LAN de propósito (ex.: atrás de Tailscale)
// precisa admitir isso explicitamente via env.
if (!isLoopbackHost(config.host) && process.env.HESTIA_ALLOW_LAN !== "1") {
  console.error(
    `[Héstia] host "${config.host}" não é loopback (127.0.0.1/localhost).\n` +
      `Por padrão a Chama Local recusa iniciar fora do host local, pois a API não tem autenticação.\n` +
      `Se isso é intencional (ex.: rede já protegida por Tailscale/firewall), rode novamente com HESTIA_ALLOW_LAN=1.`,
  );
  process.exit(1);
}

// Diretório de dados persistentes (identidade, eventos, snapshots) — se não
// conseguir criar (ex.: permissão), segue no ar: saúde/storage/services
// continuam funcionando, só as rotas de presence que dependem de disco
// degradam graciosamente (ver chama/presence.js).
try {
  ensureDataDir(config.dataDir);
  // Snapshot cíclico: gravado a cada SNAPSHOT_INTERVAL_MS; evento só se houver transição de serviço
  setInterval(() => runSnapshotCycle(config.dataDir), SNAPSHOT_INTERVAL_MS).unref();
} catch (err) {
  log("warn", `Não foi possível preparar dataDir "${config.dataDir}": ${err.message}`);
}

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

// --- Anti DNS-rebinding: só aceita Host headers que apontem para este bind. -
const allowedHosts = buildAllowedHosts(config.host, config.port);
app.addHook("onRequest", async (req, reply) => {
  if (isAllowedHostHeader(req.headers.host, allowedHosts)) return;
  log("warn", `Host não permitido: "${req.headers.host ?? ""}" — ${req.method} ${req.url}`);
  reply.code(421).send({
    ok: false,
    error: "Host não permitido",
    code: "EBADHOST",
    detail: `Header Host "${req.headers.host ?? ""}" não corresponde a ${config.host}:${config.port}.`,
    hint: "Acesse pela URL local (ex.: http://localhost:4517). Proteção contra DNS rebinding.",
    at: new Date().toISOString(),
  });
});

// --- Rate limit simples para /api/* — evita martelamento acidental/abusivo. -
const apiRateLimiter = new RateLimiter({ windowMs: 10_000, max: 60 });
setInterval(() => apiRateLimiter.sweep(), 60_000).unref();
app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  const { allowed, retryAfterMs } = apiRateLimiter.check(req.ip);
  if (allowed) return;
  reply.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  reply.code(429).send({
    ok: false,
    error: "Muitas requisições",
    code: "ERATELIMIT",
    detail: `Limite de ${apiRateLimiter.max} requisições por ${apiRateLimiter.windowMs / 1000}s excedido.`,
    at: new Date().toISOString(),
  });
});

// --- Headers de segurança em toda resposta. --------------------------------
// script-src precisa de 'unsafe-inline': o bundle SSR do TanStack Start
// injeta um script inline de hidratação (sem isso o React nunca hidrata e a
// UI fica travada em "Invariant failed"). Aceitável aqui: não há dado de
// usuário renderizado sem escape em lugar nenhum do app (sem
// dangerouslySetInnerHTML com conteúdo externo, sem inputs persistidos).
const CSP =
  "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
app.addHook("onSend", async (_req, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  reply.header("Content-Security-Policy", CSP);
  return payload;
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
  lanEnabled: config.lanEnabled,
  storagePaths: config.storagePaths,
  services: config.services,
}));

// Servir o frontend buildado quando existir (build output do TanStack Start).
// O build é SSR (bundle Nitro no formato Cloudflare Workers module, não uma
// SPA estática com index.html) — estáticos vêm de `publicDir` via
// @fastify/static, e o que não bater em nenhum arquivo cai no bundle SSR
// (`serverEntry`), que roda sob Node puro (veja chama/ssr.js).
const buildTargets = [
  { publicDir: join(__dirname, "dist", "client"), serverEntry: join(__dirname, "dist", "server", "index.mjs") },
  { publicDir: join(__dirname, ".output", "public"), serverEntry: join(__dirname, ".output", "server", "index.mjs") },
];
const build = buildTargets.find((b) => existsSync(b.publicDir));
if (build) {
  await app.register(fastifyStatic, { root: build.publicDir, prefix: "/" });
  if (existsSync(build.serverEntry)) {
    const ssrFetch = createSsrFetcher(build.serverEntry);
    app.setNotFoundHandler(async (req, reply) => {
      try {
        const ssrRes = await ssrFetch(req);
        reply.code(ssrRes.status);
        copyResponseHeaders(ssrRes, reply);
        reply.send(Buffer.from(await ssrRes.arrayBuffer()));
      } catch (err) {
        log("error", `SSR fallback falhou em ${req.method} ${req.url}: ${err.message}`);
        reply.code(500).send({
          ok: false,
          error: "Erro ao renderizar a interface",
          code: err.code || "ESSR",
          detail: err.message,
        });
      }
    });
  } else {
    log("warn", "bundle SSR não encontrado — só estáticos serão servidos (rotas da SPA podem 404)");
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ ok: false, error: "não encontrado" }));
  }
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
