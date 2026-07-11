import { describe, it, expect, vi, beforeEach } from "vitest";

const execFile = vi.fn();

vi.mock("node:child_process", () => ({ default: { execFile }, execFile }));

const { getServicesStatus, mapSystemctlShow } = await import("./services.js");

describe("mapSystemctlShow", () => {
  it.each([
    ["loaded\nactive\n", "active"],
    ["loaded\ninactive\n", "inactive"],
    ["loaded\nfailed\n", "failed"],
    ["not-found\ninactive\n", "not-installed"],
  ])("maps %j to %s", (raw, status) => {
    expect(mapSystemctlShow(raw)).toBe(status);
  });
});

describe("getServicesStatus", () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it("maps systemctl show output without shell", async () => {
    execFile
      .mockImplementationOnce((command, args, options, callback) => {
        callback(null, "not-found\ninactive\n", "");
      })
      .mockImplementationOnce((command, args, options, callback) => {
        callback(null, "loaded\ninactive\n", "");
      })
      .mockImplementationOnce((command, args, options, callback) => {
        callback(null, "loaded\nactive\n", "");
      });

    const { items } = await getServicesStatus();

    expect(execFile).toHaveBeenCalledWith(
      "systemctl",
      ["show", expect.any(String), "--property=LoadState", "--property=ActiveState", "--value"],
      { timeout: 2500 },
      expect.any(Function),
    );
    expect(items.map(({ name, active, status }) => ({ name, active, status }))).toEqual([
      { name: "jellyfin", active: false, status: "not-installed" },
      { name: "smbd", active: false, status: "inactive" },
      { name: "tailscaled", active: true, status: "active" },
    ]);
  });

  it("maps missing systemctl binary to unavailable", async () => {
    execFile.mockImplementation((command, args, options, callback) => {
      const err = new Error("spawn systemctl ENOENT");
      err.code = "ENOENT";
      callback(err, "", "");
    });

    const { items } = await getServicesStatus();

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.active === false && item.status === "unavailable")).toBe(
      true,
    );
  });
});
