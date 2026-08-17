import { describe, expect, it } from "vitest";
import { buildMagicPacket, executeWakeServerAction, sendWakeOnLanPacket } from "./wakeServer.js";

describe("wakeServer", () => {
  it("constrói o Magic Packet WoL corretamente (6x 0xFF + 16x MAC)", () => {
    const macBytes = Buffer.from("001122334455", "hex");
    const packet = buildMagicPacket(macBytes);
    expect(packet.length).toBe(102);
    expect(packet.subarray(0, 6).toString("hex")).toBe("ffffffffffff");
    expect(packet.subarray(6, 12).toString("hex")).toBe("001122334455");
    expect(packet.subarray(96, 102).toString("hex")).toBe("001122334455");
  });

  it("retorna erro quando MAC de despertar não está configurado", async () => {
    const res = await executeWakeServerAction({});
    expect(res.ok).toBe(false);
    expect(res.code).toBe("WAKE_NOT_CONFIGURED");
  });

  it("retorna erro quando o formato do MAC é inválido", async () => {
    const res = await sendWakeOnLanPacket({ macAddress: "invalid-mac" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("WAKE_MISCONFIGURED");
  });

  it("transmite Magic Packet WoL via UDP broadcast quando configurado", async () => {
    const res = await executeWakeServerAction({
      HESTIA_WAKE_SERVER_MAC: "00:11:22:33:44:55",
      HESTIA_WAKE_BROADCAST_IP: "127.0.0.1",
      HESTIA_WAKE_PORT: "9999",
    });
    expect(res.ok).toBe(true);
    expect(res.target).toBe("desktop");
    expect(res.macAddressSent).toBe(true);
  });
});
