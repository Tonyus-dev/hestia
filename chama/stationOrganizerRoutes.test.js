import Fastify from "fastify";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startStationAgent } from "./stationAgent.js";
import { registerStationRoutes } from "./stationRoutes.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";

const token = "organizer-station-test-token";
const apps = [];
const directories = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close().catch(() => {})));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(providers) {
  const root = await mkdtemp(join(tmpdir(), "hestia-station-organizer-"));
  directories.push(root);
  const storagePath = join(root, "KALINE");
  const dataDir = join(root, "data");
  const inbox = join(storagePath, "entrada", "manual");
  await mkdir(inbox, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const sourcePath = join(inbox, "exemplo.txt");
  await writeFile(sourcePath, "teste PR38\n");
  const old = new Date(Date.now() - 120_000);
  await utimes(sourcePath, old, old);

  const agent = await startStationAgent(
    {
      host: "127.0.0.1",
      port: 0,
      token,
      allowedHosts: "",
      storagePath,
      dataDir,
      storageSources: [],
      services: [],
    },
    providers,
  );
  apps.push(agent);
  const agentPort = agent.server.address().port;
  const agentBaseUrl = `http://127.0.0.1:${agentPort}`;
  const consoleApp = Fastify({ logger: false });
  registerStationRoutes(consoleApp, {
    NODE_ENV: "test",
    HESTIA_STATION_BASE_URL: agentBaseUrl,
    HESTIA_STATION_TOKEN: token,
  });
  await consoleApp.listen({ host: "127.0.0.1", port: 0 });
  apps.push(consoleApp);
  const consolePort = consoleApp.server.address().port;
  return {
    agent,
    agentBaseUrl,
    consoleBaseUrl: `http://127.0.0.1:${consolePort}`,
    storagePath,
    dataDir,
    sourcePath,
  };
}

function post(baseUrl, path, body = {}, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hestia-local-confirm": "organize",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function assertSanitized(body, fixtureData) {
  const serialized = JSON.stringify(body);
  for (const secret of [
    fixtureData.storagePath,
    fixtureData.dataDir,
    "/KALINE",
    "/home/",
    "sourcePath",
    "targetPath",
    '"from"',
    '"to"',
    token,
    "stack",
  ]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("Station Organizer HTTP real", () => {
  it("executa Console → Client → Agent → filesystem com apply, undo e redo sanitizados", async () => {
    const f = await fixture();
    const planResponse = await post(f.consoleBaseUrl, "/api/station/organizer/plan");
    expect(planResponse.status).toBe(200);
    const planBody = await planResponse.json();
    expect(planBody.plan.items).toHaveLength(1);
    expect(planBody.plan.items[0]).toMatchObject({
      source: { kind: "entrada", label: "Entrada manual", relativePath: "exemplo.txt" },
      target: { relativePath: expect.stringMatching(/^codice\/fichamentos\//) },
      action: "move",
    });
    assertSanitized(planBody, f);

    const applyResponse = await post(f.consoleBaseUrl, "/api/station/organizer/apply", {
      planId: planBody.plan.planId,
      mode: "apply",
    });
    expect(applyResponse.status).toBe(200);
    const applyBody = await applyResponse.json();
    assertSanitized(applyBody, f);
    const targetPath = join(f.storagePath, applyBody.run.operations[0].target.relativePath);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("teste PR38\n");
    await expect(stat(f.sourcePath)).rejects.toMatchObject({ code: "ENOENT" });

    const duplicate = await post(f.consoleBaseUrl, "/api/station/organizer/apply", {
      planId: planBody.plan.planId,
      mode: "apply",
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("PLAN_ALREADY_APPLIED");

    const runsResponse = await fetch(`${f.consoleBaseUrl}/api/station/organizer/runs`);
    const runsBody = await runsResponse.json();
    expect(runsBody.items[0].runId).toBe(applyBody.run.runId);
    assertSanitized(runsBody, f);

    const detailResponse = await fetch(
      `${f.consoleBaseUrl}/api/station/organizer/runs/${applyBody.run.runId}`,
    );
    assertSanitized(await detailResponse.json(), f);

    const undoResponse = await post(
      f.consoleBaseUrl,
      `/api/station/organizer/runs/${applyBody.run.runId}/undo`,
    );
    expect(undoResponse.status).toBe(200);
    const undoBody = await undoResponse.json();
    assertSanitized(undoBody, f);
    await expect(readFile(f.sourcePath, "utf8")).resolves.toBe("teste PR38\n");
    await expect(stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });

    const redoResponse = await post(
      f.consoleBaseUrl,
      `/api/station/organizer/runs/${undoBody.run.runId}/redo`,
    );
    expect(redoResponse.status).toBe(200);
    assertSanitized(await redoResponse.json(), f);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("teste PR38\n");
    await expect(stat(f.sourcePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("protege autenticação, confirmação, extensões, bodies e rotas antigas", async () => {
    const f = await fixture();
    expect((await post(f.agentBaseUrl, "/api/station/organizer/plan")).status).toBe(401);
    const auth = { authorization: `Bearer ${token}` };
    expect(
      (
        await fetch(`${f.agentBaseUrl}/api/station/organizer/plan`, {
          method: "POST",
          headers: { "content-type": "application/json", ...auth },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(f.agentBaseUrl, "/api/station/organizer/plan?extensions=../txt", {}, auth))
        .status,
    ).toBe(400);
    expect(
      (
        await post(
          f.agentBaseUrl,
          "/api/station/organizer/apply",
          { planId: "plan_x", mode: "apply", sourcePath: "/tmp/x" },
          auth,
        )
      ).status,
    ).toBe(400);
    for (const [method, path] of [
      ["POST", "/api/local/organizer/plan"],
      ["POST", "/api/local/organizer/apply"],
      ["GET", "/api/local/organizer/runs"],
      ["POST", "/api/storage/organizer/plan"],
      ["GET", "/api/storage/organizer/plan"],
    ]) {
      const response = await fetch(`${f.consoleBaseUrl}${path}`, { method });
      expect([404, 405]).toContain(response.status);
    }
    await expect(readFile(f.sourcePath, "utf8")).resolves.toBe("teste PR38\n");
  });

  it("não faz fallback local quando o Agent fica indisponível", async () => {
    const f = await fixture();
    await f.agent.close();
    apps.splice(apps.indexOf(f.agent), 1);
    const response = await post(f.consoleBaseUrl, "/api/station/organizer/plan");
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("STATION_UNAVAILABLE");
    await expect(readFile(f.sourcePath, "utf8")).resolves.toBe("teste PR38\n");
  });

  it("retorna ERUNBUSY para undo e redo concorrentes via HTTP real", async () => {
    let enterUndo;
    let releaseUndo;
    let enterRedo;
    let releaseRedo;
    const undoEntered = new Promise((resolve) => (enterUndo = resolve));
    const undoReleased = new Promise((resolve) => (releaseUndo = resolve));
    const redoEntered = new Promise((resolve) => (enterRedo = resolve));
    const redoReleased = new Promise((resolve) => (releaseRedo = resolve));
    const f = await fixture({
      undoOrganizerRun: (runId, dataDir, options) =>
        undoOrganizerRun(runId, dataDir, {
          ...options,
          beforeOperations: async () => {
            enterUndo();
            await undoReleased;
          },
        }),
      redoOrganizerRun: (runId, dataDir, options) =>
        redoOrganizerRun(runId, dataDir, {
          ...options,
          beforeOperations: async () => {
            enterRedo();
            await redoReleased;
          },
        }),
    });
    const plan = await (await post(f.consoleBaseUrl, "/api/station/organizer/plan")).json();
    const applied = await (
      await post(f.consoleBaseUrl, "/api/station/organizer/apply", {
        planId: plan.plan.planId,
        mode: "apply",
      })
    ).json();

    const firstUndo = post(
      f.consoleBaseUrl,
      `/api/station/organizer/runs/${applied.run.runId}/undo`,
    );
    await undoEntered;
    const busyUndo = await post(
      f.consoleBaseUrl,
      `/api/station/organizer/runs/${applied.run.runId}/undo`,
    );
    expect(busyUndo.status).toBe(409);
    expect((await busyUndo.json()).code).toBe("ERUNBUSY");
    releaseUndo();
    const undo = await (await firstUndo).json();

    const firstRedo = post(f.consoleBaseUrl, `/api/station/organizer/runs/${undo.run.runId}/redo`);
    await redoEntered;
    const busyRedo = await post(
      f.consoleBaseUrl,
      `/api/station/organizer/runs/${undo.run.runId}/redo`,
    );
    expect(busyRedo.status).toBe(409);
    expect((await busyRedo.json()).code).toBe("ERUNBUSY");
    releaseRedo();
    expect((await firstRedo).status).toBe(200);
  });

  it("não consome plano grande sem o planId exato e permite corrigir", async () => {
    const now = new Date().toISOString();
    const f = await fixture({
      generateOrganizerPlan: async () => ({
        planId: "plan_1_deadbeef",
        generatedAt: now,
        dryRun: true,
        requiresExtraConfirmation: true,
        largePlanThreshold: 5000,
        planned: 5001,
        items: [],
        summary: {
          total: 5001,
          planned: 5001,
          conflicts: 0,
          ignored: 0,
          quarantined: 0,
          byExtension: {},
          byTargetArea: {},
          rules: { extensionRules: [], fallback: "entrada/revisar" },
        },
      }),
    });
    const auth = { authorization: `Bearer ${token}` };
    const plan = await (await post(f.agentBaseUrl, "/api/station/organizer/plan", {}, auth)).json();
    const body = { planId: plan.plan.planId, mode: "apply" };
    const missing = await post(f.agentBaseUrl, "/api/station/organizer/apply", body, auth);
    expect(missing.status).toBe(412);
    expect((await missing.json()).code).toBe("ELARGEPLANCONFIRM");
    const wrong = await post(f.agentBaseUrl, "/api/station/organizer/apply", body, {
      ...auth,
      "x-hestia-large-plan-confirm": "true",
    });
    expect(wrong.status).toBe(412);
    const correct = await post(f.agentBaseUrl, "/api/station/organizer/apply", body, {
      ...auth,
      "x-hestia-large-plan-confirm": plan.plan.planId,
    });
    expect(correct.status).toBe(200);
  });
});
