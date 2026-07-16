#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const HOST = "127.0.0.1";
const MAX_LOG_BYTES = 64 * 1024;
const READY_TIMEOUT_MS = 15_000;
const CONTENT = "teste operacional PR39\n";
const processes = [];
let root;
let token;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanEnvironment(extra) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("HESTIA_") && key !== "STATE_DIRECTORY" && key !== "NODE_ENV",
    ),
  );
  return { ...env, ...extra };
}

function appendLimited(current, chunk) {
  const combined = Buffer.concat([current, Buffer.from(chunk)]);
  return combined.length <= MAX_LOG_BYTES
    ? combined
    : combined.subarray(combined.length - MAX_LOG_BYTES);
}

function startProcess(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tracked = { name, child, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exited: false };
  child.stdout.on("data", (chunk) => {
    tracked.stdout = appendLimited(tracked.stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    tracked.stderr = appendLimited(tracked.stderr, chunk);
  });
  tracked.exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      tracked.exited = true;
      tracked.code = code;
      tracked.signal = signal;
      resolve({ code, signal });
    });
  });
  processes.push(tracked);
  return tracked;
}

function sanitized(text) {
  let value = String(text || "");
  for (const secret of [token, root]) {
    if (secret) value = value.split(secret).join("[redacted]");
  }
  return value;
}

function logTail(processInfo) {
  const output = `${processInfo.stdout.toString("utf8")}\n${processInfo.stderr.toString("utf8")}`;
  return sanitized(output).trim().split("\n").slice(-12).join("\n");
}

async function stopProcess(processInfo, strict = true) {
  if (!processInfo || processInfo.exited) return;
  processInfo.child.kill("SIGTERM");
  const result = await Promise.race([
    processInfo.exit.then((exit) => ({ ...exit, timeout: false })),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 5000)),
  ]);
  if (result.timeout) {
    processInfo.child.kill("SIGKILL");
    await processInfo.exit;
    if (strict) throw new Error(`${processInfo.name} ignorou SIGTERM`);
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function distinctPorts() {
  const first = await freePort();
  let second = await freePort();
  while (second === first) second = await freePort();
  return [first, second];
}

async function waitForHttp(url, options = {}) {
  const deadline = Date.now() + (options.timeoutMs || READY_TIMEOUT_MS);
  let lastError;
  while (Date.now() < deadline) {
    if (options.process?.exited) {
      throw new Error(`${options.process.name} encerrou antes do readiness`);
    }
    try {
      const response = await fetch(url, {
        headers: options.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        const body = await response.json();
        if (!options.validate || options.validate(body)) return body;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`readiness expirou${lastError ? ` (${lastError.name})` : ""}`);
}

async function requestJson(baseUrl, path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`${options.label || path} não retornou JSON`);
  }
  return { response, body, raw };
}

function assertSanitized(value, secrets, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    ...secrets.filter(Boolean),
    "/KALINE",
    "/home/",
    "sourcePath",
    "targetPath",
    '"from"',
    '"to"',
    "Authorization",
    "stack",
  ];
  for (const secret of forbidden) {
    ensure(!serialized.includes(secret), `${label} não está sanitizado`);
  }
}

async function assertMissing(path, message) {
  try {
    await access(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(message);
}

async function runCommand(name, args, env) {
  const processInfo = startProcess(name, args, env);
  const result = await processInfo.exit;
  ensure(result.code === 0, `${name} terminou com código ${result.code}`);
  return processInfo;
}

async function assertPortsReusable(ports) {
  for (const port of ports) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, HOST, resolve);
    });
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function main() {
  root = await mkdtemp(join(tmpdir(), "hestia-station-smoke-"));
  token = randomBytes(32).toString("hex");
  const stationStorage = join(root, "station", "KALINE");
  const stationData = join(root, "station", "data");
  const source = join(stationStorage, "entrada", "manual", "exemplo.txt");
  const consoleTrap = join(root, "console", "KALINE-TRAP");
  const consoleData = join(root, "console", "data");
  const sentinel = join(consoleTrap, "sentinel.txt");
  const envFile = join(root, "station.env");
  await mkdir(dirname(source), { recursive: true });
  await mkdir(stationData, { recursive: true });
  await mkdir(consoleTrap, { recursive: true });
  await mkdir(consoleData, { recursive: true });
  await writeFile(source, CONTENT);
  const old = new Date(Date.now() - 120_000);
  await utimes(source, old, old);
  await writeFile(sentinel, "sentinel PR39\n");

  const monitorPort = await freePort();
  const monitorBase = `http://${HOST}:${monitorPort}`;
  const monitorAgent = startProcess(
    "Station Agent monitor-only",
    ["station.js"],
    cleanEnvironment({
      NODE_ENV: "test",
      HOME: join(root, "station"),
      HESTIA_STATION_HOST: HOST,
      HESTIA_STATION_PORT: String(monitorPort),
      HESTIA_STATION_TOKEN: token,
      HESTIA_STORAGE_PATH: stationStorage,
      HESTIA_DATA_DIR: stationData,
    }),
  );
  const monitorAuth = { Authorization: `Bearer ${token}` };
  await waitForHttp(`${monitorBase}/api/station/health`, {
    headers: monitorAuth,
    process: monitorAgent,
    validate: (body) => body?.ok === true && body.service === "hestia-station-agent",
  });
  const monitorPlansBefore = await readdir(join(stationData, "organizer", "plans"));
  const monitorRunsBefore = await readdir(join(stationData, "organizer", "runs"));
  for (const path of [
    "/api/station/health",
    "/api/station/storage/status",
    "/api/station/services/status",
  ]) {
    const result = await requestJson(monitorBase, path, { bearer: token, label: path });
    ensure(result.response.status === 200, `${path} monitor-only falhou`);
    assertSanitized(result.raw, [token, root, stationStorage, stationData], path);
  }
  for (const [method, path] of [
    ["POST", "/api/station/organizer/plan"],
    ["POST", "/api/station/organizer/apply"],
    ["GET", "/api/station/organizer/runs"],
    ["GET", "/api/station/organizer/runs/run_1_deadbeef"],
    ["POST", "/api/station/organizer/runs/run_1_deadbeef/undo"],
    ["POST", "/api/station/organizer/runs/undo_1_deadbeef/redo"],
  ]) {
    const result = await requestJson(monitorBase, path, {
      method,
      bearer: token,
      headers: { "X-Hestia-Local-Confirm": "organize" },
      ...(method === "POST" ? { body: {} } : {}),
    });
    ensure(result.response.status === 404, `${path} monitor-only não retornou 404`);
    ensure(
      JSON.stringify(result.body) === JSON.stringify({ ok: false, error: "not_found" }),
      `${path} monitor-only retornou body inesperado`,
    );
    assertSanitized(result.raw, [token, root, stationStorage, stationData], path);
  }
  for (const [method, path] of [
    ["GET", "/api/codice/health"],
    ["GET", "/api/codice/library"],
    ["POST", "/api/codice/import"],
  ]) {
    const result = await requestJson(monitorBase, path, { method });
    ensure(result.response.status === 404, `${path} desativado não retornou 404`);
    ensure(
      JSON.stringify(result.body) === JSON.stringify({ ok: false, error: "not_found" }),
      `${path} desativado retornou body inesperado`,
    );
  }
  ensure((await readFile(source, "utf8")) === CONTENT, "monitor-only alterou o arquivo fonte");
  ensure((await readFile(sentinel, "utf8")) === "sentinel PR39\n", "monitor-only alterou sentinel");
  ensure(
    JSON.stringify(await readdir(join(stationData, "organizer", "plans"))) ===
      JSON.stringify(monitorPlansBefore),
    "monitor-only criou plano do Organizer",
  );
  ensure(
    JSON.stringify(await readdir(join(stationData, "organizer", "runs"))) ===
      JSON.stringify(monitorRunsBefore),
    "monitor-only criou run do Organizer",
  );
  await stopProcess(monitorAgent);
  await assertPortsReusable([monitorPort]);
  console.log("ok: modo monitor-only sem rotas ou escrita do Organizer");

  const codiceStorage = join(root, "codice-station", "KALINE");
  const codiceData = join(root, "codice-station", "data");
  const epubPath = join(codiceStorage, "codice", "epub", "teste.epub");
  const pdfPath = join(codiceStorage, "codice", "pdf", "teste.pdf");
  const epubBytes = Buffer.from("bytes epub do smoke\n");
  const pdfBytes = Buffer.from("%PDF-bytes-smoke\n");
  await mkdir(dirname(epubPath), { recursive: true });
  await mkdir(dirname(pdfPath), { recursive: true });
  await mkdir(codiceData, { recursive: true });
  await writeFile(epubPath, epubBytes);
  await writeFile(pdfPath, pdfBytes);
  const codicePort = await freePort();
  const codiceBase = `http://${HOST}:${codicePort}`;
  const codiceOrigin = "https://codice.example.test";
  const codiceEnvFile = join(root, "codice-station.env");
  await writeFile(
    codiceEnvFile,
    `HESTIA_STATION_HOST=${HOST}\nHESTIA_STATION_PORT=${codicePort}\nHESTIA_STATION_TOKEN=${token}\nHESTIA_STATION_ORGANIZER_ENABLED=0\nHESTIA_STATION_CODICE_ENABLED=1\nHESTIA_CODICE_CORS_ORIGIN=${codiceOrigin}\nHESTIA_STORAGE_PATH=${codiceStorage}\nHESTIA_DATA_DIR=${codiceData}\n`,
    { mode: 0o600 },
  );
  const codiceAgent = startProcess(
    "Station Agent Códice read-only",
    ["station.js"],
    cleanEnvironment({
      NODE_ENV: "production",
      HOME: join(root, "codice-station"),
      HESTIA_STATION_HOST: HOST,
      HESTIA_STATION_PORT: String(codicePort),
      HESTIA_STATION_TOKEN: token,
      HESTIA_STATION_ORGANIZER_ENABLED: "0",
      HESTIA_STATION_CODICE_ENABLED: "1",
      HESTIA_CODICE_CORS_ORIGIN: codiceOrigin,
      HESTIA_STORAGE_PATH: codiceStorage,
      HESTIA_DATA_DIR: codiceData,
    }),
  );
  await waitForHttp(`${codiceBase}/api/station/health`, {
    headers: monitorAuth,
    process: codiceAgent,
    validate: (body) => body?.ok === true && body.service === "hestia-station-agent",
  });
  const codiceHealth = await requestJson(codiceBase, "/api/codice/health", {
    headers: { Origin: codiceOrigin },
  });
  ensure(codiceHealth.response.status === 200, "health do Códice falhou");
  ensure(codiceHealth.body.libraryAvailable === true, "biblioteca do Códice indisponível");
  ensure(
    codiceHealth.response.headers.get("access-control-allow-origin") === codiceOrigin,
    "CORS do health do Códice inválido",
  );
  const codiceDoctor = await runCommand(
    "Station Doctor Códice",
    ["scripts/station-doctor.mjs", "--env-file", codiceEnvFile, "--timeout-ms", "10000"],
    cleanEnvironment({ NODE_ENV: "production", HOME: join(root, "codice-station") }),
  );
  ensure(
    codiceDoctor.stdout.toString("utf8").includes("ok: formatos epub,pdf"),
    "Doctor não validou formatos do Códice",
  );
  assertSanitized(codiceDoctor.stdout.toString("utf8"), [token, root], "Doctor Códice");
  const codiceLibrary = await requestJson(codiceBase, "/api/codice/library");
  ensure(codiceLibrary.response.status === 200, "library do Códice falhou");
  ensure(codiceLibrary.body.books?.length === 2, "library do Códice não listou EPUB/PDF");
  assertSanitized(codiceLibrary.raw, [token, root, codiceStorage, codiceData], "library Códice");
  const epubBook = codiceLibrary.body.books.find((book) => book.format === "epub");
  ensure(epubBook, "EPUB ausente da library");
  const head = await fetch(`${codiceBase}${epubBook.url}`, { method: "HEAD" });
  ensure(head.status === 200, "HEAD do EPUB falhou");
  ensure(
    head.headers.get("content-length") === String(epubBytes.length),
    "HEAD com tamanho errado",
  );
  ensure((await head.text()) === "", "HEAD devolveu body");
  const get = await fetch(`${codiceBase}${epubBook.url}`);
  ensure(get.status === 200, "GET do EPUB falhou");
  ensure(Buffer.from(await get.arrayBuffer()).equals(epubBytes), "GET alterou bytes do EPUB");
  const wrongOrigin = await requestJson(codiceBase, "/api/codice/health", {
    headers: { Origin: "https://wrong.example.test" },
  });
  ensure(wrongOrigin.response.status === 403, "origem incorreta não foi bloqueada");
  const preflight = await fetch(`${codiceBase}/api/codice/library`, {
    method: "OPTIONS",
    headers: { Origin: codiceOrigin },
  });
  ensure(preflight.status === 204, "preflight correto não retornou 204");
  const importResult = await requestJson(codiceBase, "/api/codice/import", {
    method: "POST",
    headers: { Origin: codiceOrigin },
  });
  ensure(importResult.response.status === 404, "POST import não retornou 404");
  const organizerDisabled = await requestJson(codiceBase, "/api/station/organizer/runs", {
    bearer: token,
  });
  ensure(organizerDisabled.response.status === 404, "Organizer não permaneceu desativado");
  ensure((await readFile(epubPath)).equals(epubBytes), "smoke alterou EPUB");
  ensure((await readFile(pdfPath)).equals(pdfBytes), "smoke alterou PDF");
  ensure(
    JSON.stringify((await readdir(dirname(epubPath))).sort()) === JSON.stringify(["teste.epub"]),
    "smoke criou arquivo inesperado em codice/epub",
  );
  ensure(
    JSON.stringify((await readdir(dirname(pdfPath))).sort()) === JSON.stringify(["teste.pdf"]),
    "smoke criou arquivo inesperado em codice/pdf",
  );
  await stopProcess(codiceAgent);
  await assertPortsReusable([codicePort]);
  console.log("ok: Códice read-only real sem autenticação administrativa ou escrita");

  let agent;
  let consoleProcess;
  let ports;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    ports = await distinctPorts();
    const [agentPort, consolePort] = ports;
    await writeFile(
      envFile,
      `HESTIA_STATION_HOST=${HOST}\nHESTIA_STATION_PORT=${agentPort}\nHESTIA_STATION_TOKEN=${token}\nHESTIA_STATION_ORGANIZER_ENABLED=1\nHESTIA_STORAGE_PATH=${stationStorage}\nHESTIA_DATA_DIR=${stationData}\n`,
      { mode: 0o600 },
    );
    agent = startProcess(
      "Station Agent",
      ["station.js"],
      cleanEnvironment({
        NODE_ENV: "test",
        HOME: join(root, "station"),
        HESTIA_STATION_HOST: HOST,
        HESTIA_STATION_PORT: String(agentPort),
        HESTIA_STATION_TOKEN: token,
        HESTIA_STATION_ORGANIZER_ENABLED: "1",
        HESTIA_STORAGE_PATH: stationStorage,
        HESTIA_DATA_DIR: stationData,
      }),
    );
    consoleProcess = startProcess(
      "Console",
      ["hestia.js"],
      cleanEnvironment({
        NODE_ENV: "test",
        HOME: join(root, "console"),
        HESTIA_HOST: HOST,
        HESTIA_PORT: String(consolePort),
        HESTIA_STATION_BASE_URL: `http://${HOST}:${agentPort}`,
        HESTIA_STATION_TOKEN: token,
        HESTIA_STORAGE_PATH: consoleTrap,
        HESTIA_DATA_DIR: consoleData,
      }),
    );
    const auth = { Authorization: `Bearer ${token}` };
    try {
      await waitForHttp(`http://${HOST}:${agentPort}/api/station/health`, {
        headers: auth,
        process: agent,
        validate: (body) =>
          body?.ok === true && body.schemaVersion === 1 && body.service === "hestia-station-agent",
      });
      await waitForHttp(`http://${HOST}:${consolePort}/api/health`, {
        process: consoleProcess,
        validate: (body) => body?.ok === true,
      });
      break;
    } catch (error) {
      const collision = `${logTail(agent)}\n${logTail(consoleProcess)}`.includes("EADDRINUSE");
      await stopProcess(agent, false);
      await stopProcess(consoleProcess, false);
      if (!collision || attempt === 3) throw error;
    }
  }

  const [agentPort, consolePort] = ports;
  const agentBase = `http://${HOST}:${agentPort}`;
  const consoleBase = `http://${HOST}:${consolePort}`;
  const secrets = [token, root, stationStorage, stationData, consoleTrap, consoleData];

  console.log("ok: processos reais prontos");
  for (const path of [
    "/api/station/health",
    "/api/station/storage/status",
    "/api/station/services/status",
  ]) {
    const result = await requestJson(agentBase, path, { bearer: token, label: path });
    ensure(result.response.status === 200, `${path} direto falhou`);
    ensure(!result.response.headers.has("access-control-allow-origin"), `${path} expôs CORS`);
    assertSanitized(result.raw, secrets, path);
  }

  const doctor = await runCommand(
    "Station Doctor",
    ["scripts/station-doctor.mjs", "--env-file", envFile, "--timeout-ms", "10000"],
    cleanEnvironment({ NODE_ENV: "production", HOME: join(root, "station") }),
  );
  assertSanitized(doctor.stdout.toString("utf8"), secrets, "Station Doctor stdout");
  assertSanitized(doctor.stderr.toString("utf8"), secrets, "Station Doctor stderr");
  console.log("ok: Agent direto e Station Doctor");

  for (const path of [
    "/api/station/connection",
    "/api/station/storage/status",
    "/api/station/services/status",
  ]) {
    const result = await requestJson(consoleBase, path);
    ensure(result.response.status === 200, `${path} via Console falhou`);
    if (path === "/api/station/connection")
      ensure(result.body.state === "available", "Station indisponível");
    assertSanitized(result.raw, secrets, path);
  }

  const confirm = { "X-Hestia-Local-Confirm": "organize" };
  const planResult = await requestJson(consoleBase, "/api/station/organizer/plan", {
    method: "POST",
    headers: confirm,
    body: {},
  });
  ensure(planResult.response.status === 200, "plan falhou");
  const plan = planResult.body.plan;
  ensure(plan?.dryRun === true && plan.planned === 1 && plan.items?.length === 1, "plan inválido");
  ensure(plan.items[0].source.relativePath === "exemplo.txt", "source não é relativo");
  ensure(!plan.items[0].target.relativePath.startsWith("/"), "target não é relativo");
  ensure((await readFile(source, "utf8")) === CONTENT, "plan alterou filesystem");
  assertSanitized(planResult.raw, secrets, "plan");

  const applyResult = await requestJson(consoleBase, "/api/station/organizer/apply", {
    method: "POST",
    headers: confirm,
    body: { planId: plan.planId, mode: "apply" },
  });
  ensure(applyResult.response.status === 200, "apply falhou");
  ensure(applyResult.body.run?.kind === "apply", "run de apply inválido");
  const target = join(stationStorage, applyResult.body.run.operations[0].target.relativePath);
  await assertMissing(source, "apply não removeu origem");
  ensure((await readFile(target, "utf8")) === CONTENT, "apply alterou conteúdo");
  assertSanitized(applyResult.raw, secrets, "apply");

  const duplicate = await requestJson(consoleBase, "/api/station/organizer/apply", {
    method: "POST",
    headers: confirm,
    body: { planId: plan.planId, mode: "apply" },
  });
  ensure(duplicate.response.status === 409, "apply duplicado não retornou 409");
  ensure(duplicate.body.code === "PLAN_ALREADY_APPLIED", "código do apply duplicado inválido");
  ensure((await readFile(target, "utf8")) === CONTENT, "apply duplicado alterou destino");
  assertSanitized(duplicate.raw, secrets, "apply duplicado");

  const runId = applyResult.body.run.runId;
  const runs = await requestJson(consoleBase, "/api/station/organizer/runs");
  ensure(
    runs.body.items?.some((item) => item.runId === runId),
    "run ausente do histórico",
  );
  assertSanitized(runs.raw, secrets, "runs");
  const detail = await requestJson(consoleBase, `/api/station/organizer/runs/${runId}`);
  ensure(detail.body.run?.runId === runId && detail.body.run.kind === "apply", "detail inválido");
  assertSanitized(detail.raw, secrets, "run detail");

  const undo = await requestJson(consoleBase, `/api/station/organizer/runs/${runId}/undo`, {
    method: "POST",
    headers: confirm,
    body: {},
  });
  ensure(undo.response.status === 200 && undo.body.run?.kind === "undo", "undo falhou");
  ensure((await readFile(source, "utf8")) === CONTENT, "undo não restaurou origem");
  await assertMissing(target, "undo não removeu destino");
  assertSanitized(undo.raw, secrets, "undo");

  const redo = await requestJson(
    consoleBase,
    `/api/station/organizer/runs/${undo.body.run.runId}/redo`,
    { method: "POST", headers: confirm, body: {} },
  );
  ensure(redo.response.status === 200 && redo.body.run?.kind === "redo", "redo falhou");
  await assertMissing(source, "redo não removeu origem");
  ensure((await readFile(target, "utf8")) === CONTENT, "redo alterou conteúdo");
  assertSanitized(redo.raw, secrets, "redo");
  console.log("ok: plan, apply, histórico, undo e redo reais");

  for (const [method, path] of [
    ["POST", "/api/local/organizer/plan"],
    ["POST", "/api/local/organizer/apply"],
    ["GET", "/api/local/organizer/runs"],
    ["POST", "/api/storage/organizer/plan"],
    ["GET", "/api/storage/organizer/plan"],
  ]) {
    const result = await requestJson(consoleBase, path, {
      method,
      ...(method === "POST" ? { body: {} } : {}),
    });
    ensure(
      [404, 405].includes(result.response.status),
      `${path} antiga retornou ${result.response.status}`,
    );
    assertSanitized(result.raw, secrets, path);
  }
  ensure((await readFile(sentinel, "utf8")) === "sentinel PR39\n", "sentinel foi alterado");

  await stopProcess(agent);
  const unavailable = await requestJson(consoleBase, "/api/station/organizer/plan", {
    method: "POST",
    headers: confirm,
    body: {},
  });
  ensure(unavailable.response.status === 503, "Console não retornou 503 sem Agent");
  ensure(unavailable.body.code === "STATION_UNAVAILABLE", "erro sem Agent inválido");
  assertSanitized(unavailable.raw, secrets, "Agent indisponível");
  ensure((await readFile(sentinel, "utf8")) === "sentinel PR39\n", "fallback tocou sentinel");
  ensure(
    (await readdir(join(consoleData, "organizer", "plans"))).length === 0,
    "fallback criou plano",
  );
  ensure(
    (await readdir(join(consoleData, "organizer", "runs"))).length === 0,
    "fallback criou run",
  );
  console.log("ok: rotas antigas mortas e sem fallback local");

  await stopProcess(consoleProcess);
  await assertPortsReusable(ports);
  ensure(!agent.stderr.length, "Agent escreveu erro inesperado");
  ensure(!consoleProcess.stderr.length, "Console escreveu erro inesperado");
  await rm(root, { recursive: true, force: true });
  root = undefined;
  console.log("Station Smoke: OK");
}

try {
  await main();
} catch (error) {
  console.error(`Station Smoke: FALHOU: ${sanitized(error.message)}`);
  for (const processInfo of processes) {
    const tail = logTail(processInfo);
    if (tail) console.error(`[${processInfo.name}] últimas linhas:\n${tail}`);
  }
  process.exitCode = 1;
} finally {
  for (const processInfo of processes) await stopProcess(processInfo, false);
  if (root) await rm(root, { recursive: true, force: true });
}
