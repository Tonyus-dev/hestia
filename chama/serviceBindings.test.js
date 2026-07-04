import { describe, it, expect } from "vitest";
import { getServiceBindings, getPresenceServiceBindings } from "./serviceBindings.js";

describe("getServiceBindings", () => {
  it("retorna exatamente os 4 serviços já existentes reconhecidos", () => {
    const bindings = getServiceBindings();
    expect(bindings).toHaveLength(4);
    expect(bindings.map((b) => b.id)).toEqual(["samba", "syncthing", "tailscale", "jellyfin"]);
  });

  it("usa os mesmos serviceName da allowlist existente (smbd/syncthing/tailscaled/jellyfin)", () => {
    const bindings = getServiceBindings();
    const byId = Object.fromEntries(bindings.map((b) => [b.id, b.serviceName]));
    expect(byId).toEqual({
      samba: "smbd",
      syncthing: "syncthing",
      tailscale: "tailscaled",
      jellyfin: "jellyfin",
    });
  });

  it("nunca inclui campos de comando/escrita", () => {
    const bindings = getServiceBindings();
    const forbiddenFields = ["start", "stop", "restart", "configure", "write", "delete"];
    for (const binding of bindings) {
      for (const field of forbiddenFields) {
        expect(binding).not.toHaveProperty(field);
      }
    }
  });
});

describe("getPresenceServiceBindings", () => {
  it("retorna só id/label/role, sem relatedStorage nem serviceName", () => {
    const bindings = getPresenceServiceBindings();
    expect(bindings).toHaveLength(4);
    for (const binding of bindings) {
      expect(Object.keys(binding).sort()).toEqual(["id", "label", "role"]);
    }
  });
});
