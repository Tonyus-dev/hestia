import { describe, expect, it } from "vitest";
import { getStationUpdates, parseAptUpgradeOutput } from "./updates.js";

const APT_FIXTURE = `
Reading package lists... Done
Building dependency tree... Done
Reading state information... Done
Calculating upgrade... Done
The following packages will be upgraded:
  bind9-host bind9-libs openssl
Inst openssl [3.0.13-0ubuntu3] (3.0.13-0ubuntu3.4 Ubuntu:24.04/noble-updates, Ubuntu:24.04/noble-security [amd64])
Inst bind9-host [1:9.18.28-0ubuntu0.24.04.1] (1:9.18.28-0ubuntu0.24.04.2 Ubuntu:24.04/noble-updates [amd64])
Conf openssl (3.0.13-0ubuntu3.4 Ubuntu:24.04/noble-updates [amd64])
`;

describe("parseAptUpgradeOutput", () => {
  it("extrai pacotes, versões e classifica segurança determinística", () => {
    const updates = parseAptUpgradeOutput(APT_FIXTURE);
    expect(updates).toEqual([
      {
        package: "openssl",
        installedVersion: "3.0.13-0ubuntu3",
        candidateVersion: "3.0.13-0ubuntu3.4",
        security: true,
      },
      {
        package: "bind9-host",
        installedVersion: "1:9.18.28-0ubuntu0.24.04.1",
        candidateVersion: "1:9.18.28-0ubuntu0.24.04.2",
        security: null,
      },
    ]);
  });

  it("retorna array vazio para saída sem instalações ou texto inválido", () => {
    expect(parseAptUpgradeOutput("")).toEqual([]);
    expect(
      parseAptUpgradeOutput("Reading package lists... Done\n0 upgraded, 0 newly installed."),
    ).toEqual([]);
  });
});

describe("getStationUpdates", () => {
  it("retorna status unsupported se apt-get não estiver instalado (ENOENT)", async () => {
    const fakeExec = async () => {
      const err = new Error("spawn apt-get ENOENT");
      err.code = "ENOENT";
      throw err;
    };
    const result = await getStationUpdates({ execFileImpl: fakeExec });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("APT_NOT_AVAILABLE");
  });

  it("retorna status ok com contadores e flag de reboot quando apt-get é executado", async () => {
    const fakeExec = async () => ({ stdout: APT_FIXTURE });
    const fakeExists = (path) => path === "/var/run/reboot-required";
    const result = await getStationUpdates({
      execFileImpl: fakeExec,
      existsSyncImpl: fakeExists,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.totalUpdates).toBe(2);
    expect(result.securityUpdates).toBe(1);
    expect(result.rebootRequired).toBe(true);
    expect(result.updates).toHaveLength(2);
  });

  it("retorna rebootRequired: false quando os arquivos de reboot não existem", async () => {
    const fakeExec = async () => ({ stdout: APT_FIXTURE });
    const fakeExists = () => false;
    const result = await getStationUpdates({
      execFileImpl: fakeExec,
      existsSyncImpl: fakeExists,
    });
    expect(result.ok).toBe(true);
    expect(result.rebootRequired).toBe(false);
  });

  it("retorna status error com razão APT_EXEC_FAILED em falhas genéricas de execução", async () => {
    const fakeExec = async () => {
      const err = new Error("EACCES: permission denied");
      err.code = "EACCES";
      throw err;
    };
    const result = await getStationUpdates({ execFileImpl: fakeExec });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.status).not.toBe("unsupported");
    expect(result.reason).toBe("APT_EXEC_FAILED");
  });
});
