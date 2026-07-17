#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import net from "node:net";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const HOST = "127.0.0.1";
const processes = [];
const servers = [];
let root;

function ensure(value, message) {
  if (!value) throw new Error(message);
}
function cleanEnvironment(extra) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("HESTIA_") && key !== "NODE_ENV" && key !== "STATE_DIRECTORY",
      ),
    ),
    ...extra,
  };
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function start(name, file, env) {
  const child = spawn(process.execPath, [file], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const item = { name, child, stdout: "", stderr: "", exited: false };
  child.stdout.on("data", (chunk) => {
    item.stdout = (item.stdout + chunk).slice(-65536);
  });
  child.stderr.on("data", (chunk) => {
    item.stderr = (item.stderr + chunk).slice(-65536);
  });
  item.exit = new Promise((resolve) =>
    child.once("exit", (code, signal) => {
      item.exited = true;
      resolve({ code, signal });
    }),
  );
  processes.push(item);
  return item;
}
async function stop(item) {
  if (!item || item.exited) return;
  item.child.kill("SIGTERM");
  const result = await Promise.race([
    item.exit,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (!result) {
    item.child.kill("SIGKILL");
    await item.exit;
  }
}
async function json(base, path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} não retornou JSON`);
  }
  return { response, body, text };
}
async function wait(base, path, options = {}) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (options.process?.exited)
      throw new Error(`${options.process.name} encerrou durante readiness`);
    try {
      const result = await json(base, path, options);
      if (result.response.status === 200) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`readiness expirou para ${path}`);
}
function sanitized(value, secrets, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of [...secrets, "/KALINE", "/home/", "Authorization", "stack"]) {
    ensure(!secret || !text.includes(secret), `${label} vazou dado privado`);
  }
}
async function reusable(ports) {
  for (const port of ports) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, HOST, resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  }
}

async function startAuthServer(port, allowedUserId, deniedUserId) {
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/auth/v1/user") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.apikey !== "sb_publishable_synthetic_smoke_key") {
      response.writeHead(401).end();
      return;
    }
    const authorization = request.headers.authorization;
    if (authorization === "Bearer unavailable-token") {
      request.socket.destroy();
      return;
    }
    if (authorization === "Bearer allowed-user-token") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: allowedUserId }));
      return;
    }
    if (authorization === "Bearer denied-user-token") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: deniedUserId }));
      return;
    }
    response.writeHead(401).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
  servers.push(server);
  return server;
}

async function main() {
  root = await mkdtemp(join(tmpdir(), "hestia-dual-smoke-"));
  const desktopToken = randomBytes(32).toString("hex");
  const tvboxToken = randomBytes(32).toString("hex");
  const [consolePort, desktopPort, tvboxPort, authPort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  const ports = [consolePort, desktopPort, tvboxPort, authPort];
  ensure(new Set(ports).size === 4, "portas do smoke colidiram");
  const allowedUserId = "11111111-1111-4111-8111-111111111111";
  const deniedUserId = "22222222-2222-4222-8222-222222222222";
  const codiceOrigin = "https://codice-web.example.test";
  await startAuthServer(authPort, allowedUserId, deniedUserId);
  const desktopRoot = join(root, "desktop", "KALINE");
  const tvboxRoot = join(root, "tvbox", "KALINE");
  const epubPath = join(tvboxRoot, "codice", "epub", "fixture.epub");
  const pdfPath = join(tvboxRoot, "codice", "pdf", "fixture.pdf");
  const txtPath = join(tvboxRoot, "codice", "txt", "fixture.txt");
  const organizerSource = join(desktopRoot, "entrada", "manual", "organizar.txt");
  const epub = Buffer.from("EPUB sintético PR42\n");
  const pdf = Buffer.from("%PDF sintético PR42\n");
  const txt = Buffer.from("TXT sintético PR42\n");
  await mkdir(desktopRoot, { recursive: true });
  await mkdir(dirname(organizerSource), { recursive: true });
  await mkdir(dirname(epubPath), { recursive: true });
  await mkdir(dirname(pdfPath), { recursive: true });
  await mkdir(dirname(txtPath), { recursive: true });
  await writeFile(epubPath, epub);
  await writeFile(pdfPath, pdf);
  await writeFile(txtPath, txt);
  await writeFile(organizerSource, "Organizer dry-run\n");
  const old = new Date(Date.now() - 120_000);
  await utimes(organizerSource, old, old);

  const desktopEnv = cleanEnvironment({
    NODE_ENV: "test",
    HESTIA_STATION_HOST: HOST,
    HESTIA_STATION_PORT: String(desktopPort),
    HESTIA_STATION_TOKEN: desktopToken,
    HESTIA_STATION_ORGANIZER_ENABLED: "1",
    HESTIA_STATION_CODICE_ENABLED: "0",
    HESTIA_STORAGE_PATH: desktopRoot,
    HESTIA_DATA_DIR: join(root, "desktop", "data"),
  });
  const tvboxEnv = (storage = tvboxRoot) =>
    cleanEnvironment({
      NODE_ENV: "test",
      HESTIA_STATION_HOST: HOST,
      HESTIA_STATION_PORT: String(tvboxPort),
      HESTIA_STATION_TOKEN: tvboxToken,
      HESTIA_STATION_ORGANIZER_ENABLED: "0",
      HESTIA_STATION_CODICE_ENABLED: "1",
      HESTIA_CODICE_CORS_ORIGIN: codiceOrigin,
      HESTIA_CODICE_SUPABASE_URL: `http://${HOST}:${authPort}`,
      HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_smoke_key",
      HESTIA_CODICE_ALLOWED_USER_IDS: allowedUserId,
      HESTIA_STORAGE_PATH: storage,
      HESTIA_DATA_DIR: join(root, "tvbox", "data"),
    });
  let desktop = start("desktop Station", "station.js", desktopEnv);
  let tvbox = start("TV Box Station", "station.js", tvboxEnv());
  const consoleProcess = start(
    "Console",
    "hestia.js",
    cleanEnvironment({
      NODE_ENV: "test",
      HESTIA_HOST: HOST,
      HESTIA_PORT: String(consolePort),
      HESTIA_DATA_DIR: join(root, "console", "data"),
      HESTIA_DESKTOP_BASE_URL: `http://${HOST}:${desktopPort}`,
      HESTIA_DESKTOP_TOKEN: desktopToken,
      HESTIA_TVBOX_BASE_URL: `http://${HOST}:${tvboxPort}`,
      HESTIA_TVBOX_TOKEN: tvboxToken,
      HESTIA_STATION_TIMEOUT_MS: "1000",
    }),
  );
  const desktopBase = `http://${HOST}:${desktopPort}`;
  const tvboxBase = `http://${HOST}:${tvboxPort}`;
  const consoleBase = `http://${HOST}:${consolePort}`;
  await wait(desktopBase, "/api/station/health", { token: desktopToken, process: desktop });
  await wait(tvboxBase, "/api/station/health", { token: tvboxToken, process: tvbox });
  await wait(consoleBase, "/api/health", { process: consoleProcess });
  ensure((await fetch(`${consoleBase}/`)).status === 200, "interface da Console não abriu");
  for (const path of ["/codice", "/organizador", "/config", "/manifest.webmanifest", "/rede/"]) {
    ensure((await fetch(`${consoleBase}${path}`)).status === 200, `${path} não abriu`);
  }

  const secrets = [root, desktopToken, tvboxToken, desktopBase, tvboxBase];
  for (const id of ["desktop", "tvbox"]) {
    for (const suffix of ["connection", "health", "storage/status", "services/status"]) {
      const result = await json(consoleBase, `/api/stations/${id}/${suffix}`);
      ensure(result.response.status === 200, `${id}/${suffix} falhou`);
      sanitized(result.text, secrets, `${id}/${suffix}`);
    }
  }
  const codiceHealth = await json(consoleBase, "/api/stations/tvbox/codice/health");
  ensure(
    codiceHealth.response.status === 200 && codiceHealth.body.formats.join(",") === "epub,pdf,txt",
    "Códice health falhou",
  );
  sanitized(codiceHealth.text, secrets, "Códice health");
  for (const path of [
    "/api/stations/desktop/codice/health",
    "/api/stations/tvbox/codice/library",
    "/api/stations/tvbox/codice/books/inexistente",
    "/api/stations/outro/health",
    "/api/station/health",
    "/api/station/organizer/runs",
  ]) {
    ensure((await json(consoleBase, path)).response.status === 404, `${path} deveria ser 404`);
  }
  ensure(
    (await json(tvboxBase, "/api/station/organizer/runs", { token: tvboxToken })).response
      .status === 404,
    "Organizer existe na TV Box",
  );
  const organizerPlan = await json(consoleBase, "/api/stations/desktop/organizer/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  ensure(
    organizerPlan.response.status === 200 && organizerPlan.body.plan.dryRun === true,
    `Organizer plan pela Console falhou (${organizerPlan.response.status} ${organizerPlan.body.code || organizerPlan.body.error || "sem código"})`,
  );
  ensure(organizerPlan.body.plan.summary.planned > 0, "Organizer não propôs ação real");
  sanitized(organizerPlan.text, secrets, "Organizer plan");
  ensure(
    (await readFile(organizerSource, "utf8")) === "Organizer dry-run\n",
    "Organizer dry-run alterou arquivo",
  );
  const organizerRuns = await json(consoleBase, "/api/stations/desktop/organizer/runs");
  ensure(
    organizerRuns.response.status === 200 && Array.isArray(organizerRuns.body.items),
    "Organizer runs pela Console falhou",
  );
  ensure(
    (await json(desktopBase, "/api/codice/health")).response.status === 404,
    "Códice existe no desktop",
  );
  ensure(
    (await json(desktopBase, "/api/station/health", { token: tvboxToken })).response.status === 403,
    "token da TV Box autenticou no desktop",
  );
  ensure(
    (await json(tvboxBase, "/api/station/health", { token: desktopToken })).response.status === 403,
    "token do desktop autenticou na TV Box",
  );

  const codiceHeaders = { Origin: codiceOrigin, Authorization: "Bearer allowed-user-token" };
  const preflight = await fetch(`${tvboxBase}/api/codice/health`, {
    method: "OPTIONS",
    headers: {
      Origin: codiceOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  ensure(preflight.status === 204, "preflight do Códice falhou");
  ensure(
    preflight.headers.get("access-control-allow-origin") === codiceOrigin &&
      preflight.headers.get("access-control-allow-headers") === "Authorization, Content-Type" &&
      !preflight.headers.has("access-control-allow-credentials") &&
      !preflight.headers.has("accept-ranges") &&
      !preflight.headers.has("content-range"),
    "preflight anunciou CORS ou Range inseguro",
  );
  for (const [authorization, status, error] of [
    [undefined, 401, "authentication_required"],
    ["Bearer invalid-user-token", 401, "authentication_failed"],
    ["Bearer denied-user-token", 403, "authorization_failed"],
    ["Bearer unavailable-token", 503, "authentication_unavailable"],
    [`Bearer ${tvboxToken}`, 401, "authentication_failed"],
  ]) {
    const headers = { Origin: codiceOrigin };
    if (authorization) headers.Authorization = authorization;
    const result = await json(tvboxBase, "/api/codice/health", { headers });
    ensure(
      result.response.status === status && result.body.error === error,
      `matriz Auth falhou: ${error}`,
    );
  }
  ensure(
    (await json(tvboxBase, "/api/station/codice/health", { token: tvboxToken })).response.status ===
      200,
    "health interno do Códice falhou",
  );
  ensure(
    (await json(tvboxBase, "/api/station/codice/health", { token: "allowed-user-token" })).response
      .status === 403,
    "Bearer Supabase abriu rota administrativa",
  );
  const library = await json(tvboxBase, "/api/codice/library", { headers: codiceHeaders });
  ensure(library.response.status === 200, "Códice library na Station falhou");
  sanitized(library.text, secrets, "Códice library");
  for (const [format, bytes] of [
    ["epub", epub],
    ["pdf", pdf],
  ]) {
    const book = library.body.books.find((item) => item.format === format);
    const head = await fetch(`${tvboxBase}${book.url}`, { method: "HEAD", headers: codiceHeaders });
    ensure(
      head.status === 200 && (await head.arrayBuffer()).byteLength === 0,
      `${format} HEAD falhou`,
    );
    ensure(
      Number(head.headers.get("content-length")) === bytes.length,
      `${format} HEAD perdeu tamanho`,
    );
    const response = await fetch(`${tvboxBase}${book.url}`, { headers: codiceHeaders });
    ensure(Buffer.from(await response.arrayBuffer()).equals(bytes), `${format} foi alterado`);
  }
  ensure(
    (await readFile(epubPath)).equals(epub) && (await readFile(pdfPath)).equals(pdf),
    "fixtures foram modificadas",
  );
  const removedBook = library.body.books.find((item) => item.format === "txt");
  await unlink(txtPath);
  ensure(
    (
      await fetch(`${tvboxBase}/api/codice/books/${removedBook.id}`, {
        redirect: "manual",
        headers: codiceHeaders,
      })
    ).status === 404,
    "livro removido entre listagem e abertura não retornou 404",
  );

  await stop(desktop);
  ensure(
    (await json(consoleBase, "/api/stations/desktop/connection")).body.state === "unavailable",
    "desktop desligado não degradou",
  );
  ensure(
    (await json(consoleBase, "/api/stations/tvbox/connection")).body.state === "available",
    "TV Box caiu junto com desktop",
  );
  desktop = start("desktop Station reiniciada", "station.js", desktopEnv);
  await wait(desktopBase, "/api/station/health", { token: desktopToken, process: desktop });

  await stop(tvbox);
  ensure(
    (await json(consoleBase, "/api/stations/tvbox/connection")).body.state === "unavailable",
    "TV Box desligada não degradou",
  );
  ensure(
    (await json(consoleBase, "/api/stations/desktop/connection")).body.state === "available",
    "desktop caiu junto com TV Box",
  );
  tvbox = start(
    "TV Box sem biblioteca",
    "station.js",
    tvboxEnv(join(root, "tvbox", "sem-biblioteca")),
  );
  await wait(tvboxBase, "/api/station/health", { token: tvboxToken, process: tvbox });
  ensure(
    (await json(consoleBase, "/api/stations/tvbox/connection")).body.state === "available",
    "Station da TV Box indisponível sem biblioteca",
  );
  ensure(
    (await json(consoleBase, "/api/stations/tvbox/codice/health")).response.status === 503,
    "Códice não degradou sem biblioteca",
  );

  await stop(desktop);
  await stop(tvbox);
  await stop(consoleProcess);
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
  await reusable(ports);
  for (const item of processes)
    ensure(!item.stderr, `${item.name} escreveu em stderr: ${item.stderr}`);
  await rm(root, { recursive: true, force: true });
  root = undefined;
  console.log(
    "Station Smoke: OK — Console + desktop + TV Box, Organizer dry-run e Códice autenticado com health interno",
  );
}

try {
  await main();
} catch (error) {
  console.error(`Station Smoke: FALHOU: ${error.message}`);
  for (const item of processes)
    if (item.stderr || item.stdout) console.error(`[${item.name}]\n${item.stdout}\n${item.stderr}`);
  process.exitCode = 1;
} finally {
  for (const item of processes) await stop(item);
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
  if (root) await rm(root, { recursive: true, force: true });
}
