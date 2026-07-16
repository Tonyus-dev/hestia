import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startStationAgent } from "./stationAgent.js";
import {
  mergeStationEnv,
  parseStationDoctorArgs,
  parseStationEnv,
  runStationDoctor,
} from "./stationDoctor.js";

const cleanup = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

describe("Station Doctor config", () => {
  it("faz parse estrito sem expansão nem execução e ignora chaves desconhecidas", () => {
    expect(
      parseStationEnv(`
# comentário
HESTIA_STATION_HOST='127.0.0.1'
HESTIA_STATION_PORT="4518"
HESTIA_STATION_TOKEN=$(id)
HESTIA_STATION_ORGANIZER_ENABLED=1
UNKNOWN=value
`),
    ).toEqual({
      HESTIA_STATION_HOST: "127.0.0.1",
      HESTIA_STATION_PORT: "4518",
      HESTIA_STATION_TOKEN: "$(id)",
      HESTIA_STATION_ORGANIZER_ENABLED: "1",
    });
    expect(() => parseStationEnv("INVALID")).toThrow(/linha 1 inválida/);
    expect(() => parseStationEnv("HESTIA_STATION_PORT=1\nHESTIA_STATION_PORT=2")).toThrow(
      /duplicada/,
    );
    expect(() => parseStationEnv('HESTIA_STATION_TOKEN="ab"cd')).toThrow(/aspas inválidas/);
  });

  it("dá precedência ao process.env e não reconhece a flag interna", () => {
    expect(
      mergeStationEnv(
        { HESTIA_STATION_PORT: "9000", HESTIA_STATION_ALLOW_HTTP_LOOPBACK: "1" },
        { HESTIA_STATION_PORT: "4518", HESTIA_STATION_TOKEN: "file" },
      ),
    ).toEqual({ HESTIA_STATION_PORT: "9000", HESTIA_STATION_TOKEN: "file" });
    expect(parseStationEnv("HESTIA_STATION_ALLOW_HTTP_LOOPBACK=1")).toEqual({});
  });

  it("rejeita argumentos desconhecidos", () => {
    expect(() => parseStationDoctorArgs(["--unknown"])).toThrow(/desconhecido/);
    const result = spawnSync(process.execPath, ["scripts/station-doctor.mjs", "--unknown"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
  });
});

describe("Station Doctor operacional", () => {
  it("consulta um Agent real em produção com opt-in somente interno", async () => {
    const root = await mkdtemp(join(tmpdir(), "hestia-station-doctor-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const storagePath = join(root, "KALINE");
    const dataDir = join(root, "data");
    await mkdir(storagePath, { recursive: true });
    const token = "doctor-test-secret";
    const app = await startStationAgent({
      host: "127.0.0.1",
      port: 0,
      token,
      allowedHosts: "",
      storagePath,
      dataDir,
      storageSources: [],
      services: [],
    });
    cleanup.unshift(() => app.close());
    const port = app.server.address().port;
    const envFile = join(root, "station.env");
    await writeFile(
      envFile,
      `HESTIA_STATION_HOST=127.0.0.1\nHESTIA_STATION_PORT=${port}\nHESTIA_STATION_TOKEN=${token}\nHESTIA_STORAGE_PATH=${storagePath}\nHESTIA_DATA_DIR=${dataDir}\n`,
    );
    const missingSystemctl = async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    };
    const result = await runStationDoctor(
      { envFile, timeoutMs: 5000 },
      { processEnv: {}, execFile: missingSystemctl },
    );
    expect(result.exitCode).toBe(0);
    expect(result.lines).toContain("ok: health respondeu");
    expect(result.lines.at(-1)).toBe("Station Doctor: OK COM AVISOS");
    expect(result.lines.join("\n")).not.toContain(token);
  });
});
