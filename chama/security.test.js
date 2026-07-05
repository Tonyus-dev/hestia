import { describe, it, expect } from "vitest";
import {
  isLoopbackHost,
  buildAllowedHosts,
  isAllowedHostHeader,
  RateLimiter,
  resolvePresenceCorsOrigins,
  isOriginAllowed,
} from "./security.js";

describe("isLoopbackHost", () => {
  it("reconhece os aliases de loopback", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
  });

  it("rejeita hosts de LAN/externos", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
    expect(isLoopbackHost("meuhost.example.com")).toBe(false);
  });
});

describe("buildAllowedHosts / isAllowedHostHeader", () => {
  it("aceita apenas o host:port configurado quando não é loopback", () => {
    const allowed = buildAllowedHosts("192.168.1.10", 4517);
    expect(isAllowedHostHeader("192.168.1.10:4517", allowed)).toBe(true);
    expect(isAllowedHostHeader("localhost:4517", allowed)).toBe(false);
    expect(isAllowedHostHeader("evil.com:4517", allowed)).toBe(false);
  });

  it("aceita aliases de loopback quando o bind é 127.0.0.1", () => {
    const allowed = buildAllowedHosts("127.0.0.1", 4517);
    expect(isAllowedHostHeader("127.0.0.1:4517", allowed)).toBe(true);
    expect(isAllowedHostHeader("localhost:4517", allowed)).toBe(true);
    expect(isAllowedHostHeader("[::1]:4517", allowed)).toBe(true);
    expect(isAllowedHostHeader("evil.com:4517", allowed)).toBe(false);
  });

  it("rejeita Host header rebindado (DNS rebinding) para outro nome", () => {
    const allowed = buildAllowedHosts("127.0.0.1", 4517);
    // Um atacante que rebindou evil.com para 127.0.0.1 ainda envia Host: evil.com:4517
    expect(isAllowedHostHeader("evil.com:4517", allowed)).toBe(false);
  });

  it("rejeita Host ausente ou de porta diferente", () => {
    const allowed = buildAllowedHosts("127.0.0.1", 4517);
    expect(isAllowedHostHeader(undefined, allowed)).toBe(false);
    expect(isAllowedHostHeader("127.0.0.1:9999", allowed)).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("permite até `max` requisições na janela e bloqueia a seguinte", () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 3 });
    const now = 0;
    expect(rl.check("ip1", now).allowed).toBe(true);
    expect(rl.check("ip1", now).allowed).toBe(true);
    expect(rl.check("ip1", now).allowed).toBe(true);
    const fourth = rl.check("ip1", now);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("reseta a janela depois de windowMs e isola por chave", () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.check("ip1", 0).allowed).toBe(true);
    expect(rl.check("ip1", 500).allowed).toBe(false);
    expect(rl.check("ip1", 1001).allowed).toBe(true);
    expect(rl.check("ip2", 500).allowed).toBe(true);
  });

  it("sweep remove entradas expiradas", () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 1 });
    rl.check("ip1", 0);
    expect(rl.hits.has("ip1")).toBe(true);
    rl.sweep(2000);
    expect(rl.hits.has("ip1")).toBe(false);
  });
});

describe("resolvePresenceCorsOrigins", () => {
  it("retorna [] quando a env var não está setada (comportamento restritivo por padrão)", () => {
    expect(resolvePresenceCorsOrigins({})).toEqual([]);
  });

  it("faz parse de uma lista separada por vírgula, com espaços", () => {
    expect(
      resolvePresenceCorsOrigins({
        HESTIA_PRESENCE_CORS_ORIGIN: "https://presence.example, https://outra.com",
      }),
    ).toEqual(["https://presence.example", "https://outra.com"]);
  });

  it("aceita '*' literal", () => {
    expect(resolvePresenceCorsOrigins({ HESTIA_PRESENCE_CORS_ORIGIN: "*" })).toEqual(["*"]);
  });
});

describe("isOriginAllowed", () => {
  it("rejeita sempre que a lista está vazia", () => {
    expect(isOriginAllowed("https://presence.example", [])).toBe(false);
  });

  it("aceita origem exata na lista", () => {
    const allowed = ["https://presence.example"];
    expect(isOriginAllowed("https://presence.example", allowed)).toBe(true);
    expect(isOriginAllowed("https://evil.com", allowed)).toBe(false);
  });

  it("'*' na lista aceita qualquer origem", () => {
    expect(isOriginAllowed("https://qualquer-coisa.com", ["*"])).toBe(true);
  });

  it("rejeita origin ausente/vazio mesmo com '*' configurado", () => {
    expect(isOriginAllowed(undefined, ["*"])).toBe(false);
    expect(isOriginAllowed("", ["*"])).toBe(false);
  });
});
