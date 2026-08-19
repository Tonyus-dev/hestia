import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hestiaApi, type StationId } from "@/lib/hestia/api";
import { STATION_UI, StationCard } from "./_station.index";

vi.mock("@/lib/hestia/api", async (original) => {
  const actual = await original<typeof import("@/lib/hestia/api")>();
  return {
    ...actual,
    hestiaApi: {
      ...actual.hestiaApi,
      stationConnection: vi.fn(),
      stationStorage: vi.fn(),
      stationSystem: vi.fn(),
      stationServices: vi.fn(),
      tvboxCodiceHealth: vi.fn(),
      stationTunnelStatus: vi.fn(),
    },
  };
});

const at = "2026-07-16T12:00:00.000Z";
const ok = <T,>(data: T) => ({ status: "ok" as const, data, fetchedAt: at });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function system() {
  return ok({
    ok: true,
    schemaVersion: 1,
    checkedAt: at,
    system: {
      hostname: "station-host",
      platform: "linux",
      release: "6.8",
      arch: "x64",
      uptimeSeconds: 60,
      cpu: { model: "cpu", cores: 1, threads: 1, loadAverage: [0, 0, 0], usagePercent: null },
      memory: { totalBytes: 100, usedBytes: 50, freeBytes: 50, usedPercent: 50 },
      swap: { totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPercent: 0 },
      rootDisk: { totalBytes: 100, usedBytes: 10, freeBytes: 90, usedPercent: 10 },
    },
  });
}

function prepare(id: StationId, state: "available" | "unavailable" = "available") {
  vi.mocked(hestiaApi.stationConnection).mockImplementation(async (requested) =>
    ok({
      ok: true,
      configured: true,
      state: requested === id ? state : "unavailable",
      checkedAt: at,
      latencyMs: 2,
      station:
        state === "available"
          ? { service: "hestia-station-agent", schemaVersion: 1, version: "test" }
          : null,
    }),
  );
  vi.mocked(hestiaApi.stationSystem).mockResolvedValue(system());
  vi.mocked(hestiaApi.stationStorage).mockResolvedValue(
    ok({
      ok: true,
      schemaVersion: 1,
      checkedAt: at,
      storage: {
        id: "kaline",
        exists: true,
        status: "ok",
        totalBytes: 10,
        usedBytes: 5,
        freeBytes: 5,
        percentUsed: 50,
      },
    }),
  );
  vi.mocked(hestiaApi.stationServices).mockResolvedValue(
    ok({ ok: true, schemaVersion: 1, checkedAt: at, services: [] }),
  );
  vi.mocked(hestiaApi.tvboxCodiceHealth).mockResolvedValue(
    ok({
      ok: true,
      state: "available",
      libraryAvailable: true,
      formats: ["epub", "pdf"],
      checkedAt: at,
    }),
  );
  vi.mocked(hestiaApi.stationTunnelStatus).mockResolvedValue(
    ok({
      ok: true,
      schemaVersion: 1,
      status: "unsupported",
      checkedAt: at,
      tunnel: {
        name: "",
        connected: false,
        haConnections: 0,
        protocol: "unknown",
        edgeColo: null,
      },
      publicRoute: {
        hostname: null,
        status: "not_configured",
        httpStatus: null,
        latencyMs: null,
        checkedAt: at,
      },
    }),
  );
}

function renderCard(id: StationId) {
  const station = STATION_UI.find((item) => item.id === id)!;
  render(<StationCard {...station} />);
}

describe("monitoramento visual das sete Stations", () => {
  it("mantém registro visual com sete cards", () => {
    expect(STATION_UI.map((station) => station.id)).toEqual([
      "desktop",
      "tvbox",
      "pocket",
      "baby",
      "mini",
      "max",
      "note",
    ]);
    expect(STATION_UI.map((station) => station.title)).toEqual([
      "Servidor",
      "TV Box",
      "Pocket",
      "Baby",
      "Mini",
      "Max",
      "Notebook",
    ]);
  });

  it("usa endpoints do Servidor sem consultar Códice", async () => {
    prepare("desktop");
    renderCard("desktop");
    expect(await screen.findByText("Servidor")).toBeTruthy();
    await waitFor(() => expect(hestiaApi.stationConnection).toHaveBeenCalledWith("desktop"));
    expect(hestiaApi.tvboxCodiceHealth).not.toHaveBeenCalled();
  });

  it("mantém TV Box independente da falha do Servidor sem apresentar Códice", async () => {
    prepare("tvbox");
    renderCard("tvbox");
    expect(await screen.findByText("TV Box")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /TV Box/i }));
    expect(screen.queryByText("Biblioteca Códice")).toBeNull();
  });

  it("Pocket, Baby, Mini e Max não consultam Códice, Organizer nem /KALINE", async () => {
    prepare("pocket");
    renderCard("pocket");
    renderCard("baby");
    renderCard("mini");
    renderCard("max");
    expect((await screen.findAllByText("Pocket")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Baby")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Mini")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Max")).length).toBeGreaterThan(0);
    expect(hestiaApi.tvboxCodiceHealth).not.toHaveBeenCalled();
    expect(screen.queryByText("Organizer")).toBeNull();
    await waitFor(() => expect(hestiaApi.stationSystem).toHaveBeenCalledWith("pocket"));
    expect(hestiaApi.stationStorage).not.toHaveBeenCalledWith("pocket");
    expect(hestiaApi.stationStorage).not.toHaveBeenCalledWith("baby");
    expect(hestiaApi.stationStorage).not.toHaveBeenCalledWith("mini");
    expect(hestiaApi.stationStorage).not.toHaveBeenCalledWith("max");
    expect(hestiaApi.tvboxCodiceHealth).not.toHaveBeenCalled();
  });

  it("mantém indisponibilidade independente entre Pocket e Baby", async () => {
    vi.mocked(hestiaApi.stationConnection).mockImplementation(async (requested) =>
      ok({
        ok: true,
        configured: true,
        state: requested === "pocket" ? "unavailable" : "available",
        checkedAt: at,
        latencyMs: requested === "pocket" ? null : 3,
        station:
          requested === "pocket"
            ? null
            : { service: "hestia-station-agent", schemaVersion: 1, version: "test" },
      }),
    );
    vi.mocked(hestiaApi.stationSystem).mockResolvedValue(system());
    vi.mocked(hestiaApi.stationServices).mockResolvedValue(
      ok({ ok: true, schemaVersion: 1, checkedAt: at, services: [] }),
    );
    renderCard("pocket");
    renderCard("baby");
    expect((await screen.findAllByText("Pocket")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Baby")).length).toBeGreaterThan(0);
    await waitFor(() => expect(hestiaApi.stationConnection).toHaveBeenCalledWith("baby"));
    expect(screen.getAllByText("offline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("online").length).toBeGreaterThan(0);
  });

  it("somente tvbox e max consultam stationTunnelStatus", async () => {
    prepare("desktop");
    renderCard("desktop");
    renderCard("pocket");
    renderCard("baby");
    renderCard("mini");
    renderCard("note");
    expect(hestiaApi.stationTunnelStatus).not.toHaveBeenCalled();

    renderCard("tvbox");
    expect(hestiaApi.stationTunnelStatus).toHaveBeenCalledWith("tvbox");

    renderCard("max");
    expect(hestiaApi.stationTunnelStatus).toHaveBeenCalledWith("max");
  });

  it("valida papéis reais das 7 Stations", () => {
    const roles = Object.fromEntries(STATION_UI.map((item) => [item.id, item.role]));
    expect(roles.desktop).toBe(
      "/KALINE · backup · processamento · serviços pesados sob demanda · Ash Gate",
    );
    expect(roles.tvbox).toBe(
      "Héstia Console · Ash runtime · executor LAN/WoL · infraestrutura doméstica",
    );
    expect(roles.pocket).toBe("ZeroClaw · Khora");
    expect(roles.baby).toBe("Reserva cloud");
    expect(roles.mini).toBe("Kódice");
    expect(roles.max).toBe("Cauldron / Kallistis VTT");
    expect(roles.note).toBe("Workstation principal de desenvolvimento");
  });
});
