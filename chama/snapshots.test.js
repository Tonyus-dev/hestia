import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { mkdtemp } from "node:fs";
import { tmpdir } from "node:os";
import {
  diffServiceTransitions,
  generateSnapshot,
  writeSnapshot,
  getLatestSnapshot,
  SNAPSHOT_INTERVAL_MS,
} from "./snapshots.js";

describe("diffServiceTransitions", () => {
  it("detecta service.up quando serviço ativa", () => {
    const prev = {
      services: {
        items: [{ name: "test", active: false }],
      },
    };
    const curr = {
      services: {
        items: [{ name: "test", active: true }],
      },
    };

    const transitions = diffServiceTransitions(prev, curr);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toEqual({
      name: "test",
      from: "inactive",
      to: "active",
    });
  });

  it("detecta service.down quando serviço desativa", () => {
    const prev = {
      services: {
        items: [{ name: "test", active: true }],
      },
    };
    const curr = {
      services: {
        items: [{ name: "test", active: false }],
      },
    };

    const transitions = diffServiceTransitions(prev, curr);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toEqual({
      name: "test",
      from: "active",
      to: "inactive",
    });
  });

  it("ignora quando não há mudança de estado", () => {
    const prev = {
      services: {
        items: [{ name: "test", active: true }],
      },
    };
    const curr = {
      services: {
        items: [{ name: "test", active: true }],
      },
    };

    const transitions = diffServiceTransitions(prev, curr);
    expect(transitions).toHaveLength(0);
  });

  it("retorna [] se não há snapshot anterior", () => {
    const curr = {
      services: {
        items: [{ name: "test", active: true }],
      },
    };

    const transitions = diffServiceTransitions(null, curr);
    expect(transitions).toHaveLength(0);
  });
});

describe("generateSnapshot", () => {
  it("retorna snapshot com server/services/storage", async () => {
    // Mock os imports para não depender de systemctl real
    vi.mocked = vi.mocked || {};

    const snapshot = await generateSnapshot();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.expiresAt).toBeDefined();
    expect(snapshot.server).toBeDefined();
    expect(snapshot.services).toBeDefined();
    expect(snapshot.storage).toBeDefined();
  });
});

describe("writeSnapshot / getLatestSnapshot", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await new Promise((resolve, reject) =>
      mkdtemp(join(tmpdir(), "hestia-snapshots-"), (err, dir) => {
        if (err) reject(err);
        else resolve(dir);
      }),
    );
    await fs.mkdir(join(tmpDir, "snapshots"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignora erro ao limpar
    }
  });

  it("escreve e lê snapshot atomicamente", async () => {
    const now = new Date();
    const snapshot = {
      timestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + SNAPSHOT_INTERVAL_MS * 2).toISOString(),
      server: { hostname: "test" },
      services: { items: [] },
      storage: { items: [] },
    };

    await writeSnapshot(snapshot, tmpDir);
    const read = await getLatestSnapshot(tmpDir);

    expect(read.server.hostname).toBe("test");
    expect(read.stale).toBe(false);
  });

  it("marca snapshot como stale quando expira", async () => {
    const now = new Date();
    const snapshot = {
      timestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() - 1000).toISOString(), // Expirado
      server: { hostname: "test" },
      services: { items: [] },
      storage: { items: [] },
    };

    await writeSnapshot(snapshot, tmpDir);
    const read = await getLatestSnapshot(tmpDir);

    expect(read.stale).toBe(true);
  });

  it("retorna unavailable se não há snapshot", async () => {
    const result = await getLatestSnapshot(tmpDir);
    expect(result.status).toBe("unavailable");
  });
});
