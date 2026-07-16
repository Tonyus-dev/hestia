import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startStationAgent } from "./stationAgent.js";
import { redoOrganizerRun } from "./organizerRedo.js";
import { undoOrganizerRun } from "./organizerUndo.js";

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
  await writeFile(sourcePath, "teste Organizer opt-in\n");
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
      organizerEnabled: true,
    },
    providers,
  );
  apps.push(agent);
  const port = agent.server.address().port;
  return { agentBaseUrl: `http://127.0.0.1:${port}`, storagePath, dataDir, sourcePath };
}

function post(f, path, body = {}, headers = {}) {
  return fetch(`${f.agentBaseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-hestia-local-confirm": "organize",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function get(f, path, bearer = token) {
  return fetch(`${f.agentBaseUrl}${path}`, {
    headers: bearer == null ? {} : { authorization: `Bearer ${bearer}` },
  });
}

function assertSanitized(body, f) {
  const serialized = JSON.stringify(body);
  for (const secret of [
    f.storagePath,
    f.dataDir,
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

describe("Station Organizer opt-in direto no Agent", () => {
  it("exige Bearer válido e confirmação local", async () => {
    const f = await fixture();
    const noBearer = await fetch(`${f.agentBaseUrl}/api/station/organizer/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(noBearer.status).toBe(401);
    expect(
      (
        await fetch(`${f.agentBaseUrl}/api/station/organizer/plan`, {
          method: "POST",
          headers: { authorization: "Bearer incorreto", "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${f.agentBaseUrl}/api/station/organizer/plan`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  });

  it("executa plan, apply, runs, detalhe, undo e redo sem vazar campos internos", async () => {
    const f = await fixture();
    const planResponse = await post(f, "/api/station/organizer/plan");
    expect(planResponse.status).toBe(200);
    const planBody = await planResponse.json();
    expect(planBody.plan.items).toHaveLength(1);
    assertSanitized(planBody, f);

    const applyResponse = await post(f, "/api/station/organizer/apply", {
      planId: planBody.plan.planId,
      mode: "apply",
    });
    expect(applyResponse.status).toBe(200);
    const applyBody = await applyResponse.json();
    assertSanitized(applyBody, f);
    const targetPath = join(f.storagePath, applyBody.run.operations[0].target.relativePath);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("teste Organizer opt-in\n");
    await expect(stat(f.sourcePath)).rejects.toMatchObject({ code: "ENOENT" });

    const duplicate = await post(f, "/api/station/organizer/apply", {
      planId: planBody.plan.planId,
      mode: "apply",
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("PLAN_ALREADY_APPLIED");

    const runs = await (await get(f, "/api/station/organizer/runs")).json();
    expect(runs.items[0].runId).toBe(applyBody.run.runId);
    assertSanitized(runs, f);
    const detail = await (
      await get(f, `/api/station/organizer/runs/${applyBody.run.runId}`)
    ).json();
    assertSanitized(detail, f);

    const undo = await (
      await post(f, `/api/station/organizer/runs/${applyBody.run.runId}/undo`)
    ).json();
    assertSanitized(undo, f);
    await expect(readFile(f.sourcePath, "utf8")).resolves.toBe("teste Organizer opt-in\n");
    const redoResponse = await post(f, `/api/station/organizer/runs/${undo.run.runId}/redo`);
    expect(redoResponse.status).toBe(200);
    assertSanitized(await redoResponse.json(), f);
    await expect(readFile(targetPath, "utf8")).resolves.toBe("teste Organizer opt-in\n");
  });

  it("rejeita paths, extensões e rotas legadas sem alterar o arquivo", async () => {
    const f = await fixture();
    expect((await post(f, "/api/station/organizer/plan?extensions=../txt")).status).toBe(400);
    expect(
      (
        await post(f, "/api/station/organizer/apply", {
          planId: "plan_x",
          mode: "apply",
          sourcePath: "/tmp/x",
        })
      ).status,
    ).toBe(400);
    for (const [method, path] of [
      ["POST", "/api/local/organizer/plan"],
      ["POST", "/api/local/organizer/apply"],
      ["GET", "/api/local/organizer/runs"],
      ["POST", "/api/storage/organizer/plan"],
      ["GET", "/api/storage/organizer/plan"],
    ]) {
      const response = await fetch(`${f.agentBaseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(404);
    }
    await expect(readFile(f.sourcePath, "utf8")).resolves.toBe("teste Organizer opt-in\n");
  });

  it("retorna ERUNBUSY para undo e redo concorrentes", async () => {
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
    const plan = await (await post(f, "/api/station/organizer/plan")).json();
    const applied = await (
      await post(f, "/api/station/organizer/apply", { planId: plan.plan.planId, mode: "apply" })
    ).json();
    const firstUndo = post(f, `/api/station/organizer/runs/${applied.run.runId}/undo`);
    await undoEntered;
    const busyUndo = await post(f, `/api/station/organizer/runs/${applied.run.runId}/undo`);
    expect(busyUndo.status).toBe(409);
    expect((await busyUndo.json()).code).toBe("ERUNBUSY");
    releaseUndo();
    const undo = await (await firstUndo).json();
    const firstRedo = post(f, `/api/station/organizer/runs/${undo.run.runId}/redo`);
    await redoEntered;
    const busyRedo = await post(f, `/api/station/organizer/runs/${undo.run.runId}/redo`);
    expect(busyRedo.status).toBe(409);
    expect((await busyRedo.json()).code).toBe("ERUNBUSY");
    releaseRedo();
    expect((await firstRedo).status).toBe(200);
  });

  it("exige o planId exato para confirmar plano grande", async () => {
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
    const plan = await (await post(f, "/api/station/organizer/plan")).json();
    const body = { planId: plan.plan.planId, mode: "apply" };
    expect((await post(f, "/api/station/organizer/apply", body)).status).toBe(412);
    expect(
      (
        await post(f, "/api/station/organizer/apply", body, {
          "x-hestia-large-plan-confirm": "true",
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await post(f, "/api/station/organizer/apply", body, {
          "x-hestia-large-plan-confirm": plan.plan.planId,
        })
      ).status,
    ).toBe(200);
  });
});
