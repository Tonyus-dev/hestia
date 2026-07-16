import { describe, expect, it } from "vitest";
import { hasLegacyConsoleStationConfig } from "./consoleDoctor.js";

describe("Console Doctor", () => {
  it("detecta as variáveis legadas sem depender de seus valores", () => {
    expect(hasLegacyConsoleStationConfig("HESTIA_STATION_BASE_URL=https://legacy.example")).toBe(
      true,
    );
    expect(hasLegacyConsoleStationConfig("HESTIA_STATION_TOKEN=super-secret")).toBe(true);
    expect(hasLegacyConsoleStationConfig("# HESTIA_STATION_TOKEN=comentada")).toBe(false);
    expect(hasLegacyConsoleStationConfig("HESTIA_DESKTOP_TOKEN=atual")).toBe(false);
  });
});
