import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";

import { buildAllowedHosts, isAllowedHostHeader, isLoopbackHost } from "./security.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function configError(message) {
  throw new Error(`[Station Agent] ${message}`);
}

export function resolveStationAgentConfig(env = process.env) {
  const host = env.HESTIA_STATION_HOST?.trim() || "127.0.0.1";
  const portRaw = env.HESTIA_STATION_PORT?.trim() || "4518";
  const port = Number(portRaw);
  const token = env.HESTIA_STATION_TOKEN;
  const allowedHosts = env.HESTIA_STATION_ALLOWED_HOSTS?.trim() || "";

  if (!token?.trim()) configError("HESTIA_STATION_TOKEN é obrigatório.");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    configError("HESTIA_STATION_PORT deve ser uma porta válida.");
  }
  if (allowedHosts.split(",").some((entry) => entry.includes("*"))) {
    configError("HESTIA_STATION_ALLOWED_HOSTS não aceita wildcard.");
  }
  if (!isLoopbackHost(host) && !allowedHosts) {
    configError("bind não-loopback exige HESTIA_STATION_ALLOWED_HOSTS.");
  }
  return { host, port, token, allowedHosts };
}

function tokenMatches(actual, expected) {
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

export function createStationAgent(config) {
  if (!config?.token?.trim()) configError("HESTIA_STATION_TOKEN é obrigatório.");
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    const allowed = buildAllowedHosts(config.host, port, config.allowedHosts);
    if (!isAllowedHostHeader(request.headers.host, allowed)) {
      return reply.code(421).send({ ok: false, error: "host_not_allowed" });
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers.authorization;
    const match = typeof header === "string" ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match) return reply.code(401).send({ ok: false, error: "authentication_required" });
    if (!tokenMatches(match[1], config.token)) {
      return reply.code(403).send({ ok: false, error: "authentication_failed" });
    }
  });

  app.get("/api/station/health", async () => ({
    ok: true,
    schemaVersion: 1,
    service: "hestia-station-agent",
    version: pkg.version,
    checkedAt: new Date().toISOString(),
  }));

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ ok: false, error: "not_found" });
  });
  app.setErrorHandler((_error, _request, reply) => {
    reply.code(500).send({ ok: false, error: "internal_error" });
  });
  return app;
}

export async function startStationAgent(config) {
  const app = createStationAgent(config);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
