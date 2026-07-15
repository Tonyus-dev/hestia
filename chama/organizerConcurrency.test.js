import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyOrganizerPlan } from "./organizerApply.js";
import { undoOrganizerRun } from "./organizerUndo.js";
import { redoOrganizerRun } from "./organizerRedo.js";

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function appliedRun() {
  const root = await mkdtemp(join(tmpdir(), "hestia-organizer-lock-"));
  directories.push(root);
  const storagePath = join(root, "KALINE");
  const dataDir = join(root, "data");
  const sourcePath = join(storagePath, "entrada", "manual", "x.txt");
  const targetPath = join(storagePath, "codice", "fichamentos", "x.txt");
  await mkdir(join(storagePath, "entrada", "manual"), { recursive: true });
  await writeFile(sourcePath, "x");
  const run = await applyOrganizerPlan(
    {
      planId: "plan_lock",
      generatedAt: new Date().toISOString(),
      items: [{ id: "x", sourcePath, targetPath, action: "move", status: "planned" }],
    },
    dataDir,
    { storagePath },
  );
  return { run, dataDir, storagePath };
}

function gate() {
  let entered;
  let release;
  return {
    entered: new Promise((resolve) => (entered = resolve)),
    wait: () => new Promise((resolve) => (release = resolve)).finally(() => {}),
    markEntered: () => entered(),
    release: () => release(),
  };
}

describe("Organizer operation lock", () => {
  it("bloqueia dois undos simultâneos para o mesmo runId", async () => {
    const { run, dataDir } = await appliedRun();
    const hold = gate();
    const first = undoOrganizerRun(run.runId, dataDir, {
      beforeOperations: async () => {
        hold.markEntered();
        await hold.wait();
      },
    });
    await hold.entered;
    await expect(undoOrganizerRun(run.runId, dataDir)).rejects.toMatchObject({ code: "ERUNBUSY" });
    hold.release();
    await expect(first).resolves.toMatchObject({ undoOf: run.runId });
  });

  it("bloqueia dois redos simultâneos para o mesmo undoRunId", async () => {
    const { run, dataDir, storagePath } = await appliedRun();
    const undo = await undoOrganizerRun(run.runId, dataDir);
    const hold = gate();
    const first = redoOrganizerRun(undo.runId, dataDir, {
      storagePath,
      beforeOperations: async () => {
        hold.markEntered();
        await hold.wait();
      },
    });
    await hold.entered;
    await expect(redoOrganizerRun(undo.runId, dataDir, { storagePath })).rejects.toMatchObject({
      code: "ERUNBUSY",
    });
    hold.release();
    await expect(first).resolves.toMatchObject({ redoOf: undo.runId });
  });
});
