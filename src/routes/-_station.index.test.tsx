import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hestiaApi } from "@/lib/hestia/api";
import { StationCard } from "./_station.index";

vi.mock("@/lib/hestia/api", async (original) => {
  const actual = await original<typeof import("@/lib/hestia/api")>();
  return {
    ...actual,
    hestiaApi: {
      ...actual.hestiaApi,
      stationConnection: vi.fn(),
      stationStorage: vi.fn(),
      stationServices: vi.fn(),
      tvboxCodiceHealth: vi.fn(),
    },
  };
});

const at = "2026-07-16T12:00:00.000Z";
const ok = <T,>(data: T) => ({ status: "ok" as const, data, fetchedAt: at });

afterEach(() => vi.clearAllMocks());

function prepare(id: "desktop" | "tvbox", state: "available" | "unavailable" = "available") {
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
}

describe("monitoramento visual dual", () => {
  it("usa endpoints do Servidor sem consultar Códice", async () => {
    prepare("desktop");
    render(<StationCard id="desktop" title="Servidor" />);
    expect(await screen.findByText("Servidor")).toBeTruthy();
    await waitFor(() => expect(hestiaApi.stationConnection).toHaveBeenCalledWith("desktop"));
    expect(hestiaApi.tvboxCodiceHealth).not.toHaveBeenCalled();
    expect(screen.queryByText("Biblioteca Códice")).toBeNull();
  });

  it("mantém TV Box e Códice independentes da falha do Servidor", async () => {
    prepare("tvbox");
    render(<StationCard id="tvbox" title="TV Box" codice />);
    expect(await screen.findByText("TV Box")).toBeTruthy();
    expect(await screen.findByText("Biblioteca Códice")).toBeTruthy();
    expect(await screen.findByText("epub, pdf")).toBeTruthy();
  });
});
