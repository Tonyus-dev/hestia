import { describe, expect, it } from "vitest";
import { checkPublicRoute, getStationTunnelStatus, parseCloudflaredMetrics } from "./tunnels.js";

const METRICS_FIXTURE_HEALTHY = `
# HELP cloudflared_tunnel_ha_connections The number of active HA connections
# TYPE cloudflared_tunnel_ha_connections gauge
cloudflared_tunnel_ha_connections{user_colo="GRU"} 4
# HELP cloudflared_tunnel_user_connections The number of active user connections
# TYPE cloudflared_tunnel_user_connections gauge
cloudflared_tunnel_user_connections{conn_type="quic",protocol="quic",user_colo="GRU"} 4
`;

const METRICS_FIXTURE_DEGRADED = `
cloudflared_tunnel_ha_connections 2
cloudflared_tunnel_user_connections{protocol="http2"} 2
`;

const METRICS_FIXTURE_ZERO = `
cloudflared_tunnel_ha_connections 0
cloudflared_tunnel_connected 0
`;

describe("parseCloudflaredMetrics", () => {
  it("extrai conexões HA, protocolo e colo de métricas válidas", () => {
    const res = parseCloudflaredMetrics(METRICS_FIXTURE_HEALTHY);
    expect(res.haConnections).toBe(4);
    expect(res.connected).toBe(true);
    expect(res.protocol).toBe("quic");
    expect(res.edgeColo).toBe("GRU");
  });

  it("identifica degradação em conexões parciais", () => {
    const res = parseCloudflaredMetrics(METRICS_FIXTURE_DEGRADED);
    expect(res.haConnections).toBe(2);
    expect(res.connected).toBe(true);
    expect(res.protocol).toBe("http2");
  });

  it("retorna estado desconectado para texto vazio ou sem métricas", () => {
    const res = parseCloudflaredMetrics("");
    expect(res.connected).toBe(false);
    expect(res.haConnections).toBe(0);
  });
});

describe("checkPublicRoute", () => {
  it("retorna not_configured para URL vazia ou inválida", async () => {
    const res = await checkPublicRoute("");
    expect(res.status).toBe("not_configured");
    expect(res.hostname).toBeNull();
  });

  it("retorna ok para resposta HTTP 200 e calcula latência", async () => {
    const fakeFetch = async () => new Response("OK", { status: 200 });
    const res = await checkPublicRoute("https://hestia.nomosludens.ia.br/api/health", {
      fetchImpl: fakeFetch,
    });
    expect(res.status).toBe("ok");
    expect(res.hostname).toBe("hestia.nomosludens.ia.br");
    expect(res.httpStatus).toBe(200);
    expect(typeof res.latencyMs).toBe("number");
  });

  it("retorna unavailable para falhas de rede / exceção de fetch", async () => {
    const fakeFetch = async () => {
      throw new Error("Network error");
    };
    const res = await checkPublicRoute("https://cauldron.nomosludens.ia.br/health", {
      fetchImpl: fakeFetch,
    });
    expect(res.status).toBe("unavailable");
    expect(res.hostname).toBe("cauldron.nomosludens.ia.br");
  });
});

describe("getStationTunnelStatus — Requisitos Específicos", () => {
  it("ONLY_TVBOX_MAX_TUNNEL: limita suporte de Tunnel a TV Box e MAX", async () => {
    const tvbox = await getStationTunnelStatus({
      stationId: "tvbox",
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    expect(tvbox.tunnel.name).toBe("hestia-kaline-box");
    expect(tvbox.publicRoute.hostname).toBe("hestia.nomosludens.ia.br");

    const max = await getStationTunnelStatus({
      stationId: "max",
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    expect(max.tunnel.name).toBe("kallistis-max");
    expect(max.publicRoute.hostname).toBe("cauldron.nomosludens.ia.br");

    for (const otherId of ["desktop", "pocket", "baby", "mini", "note"]) {
      const res = await getStationTunnelStatus({
        stationId: otherId,
        fetchImpl: async () => new Response("", { status: 500 }),
      });
      expect(res.status).toBe("unsupported");
      expect(res.tunnel.name).toBe("");
    }
  });

  it("TUNNEL_ZERO_CONNECTIONS_DOWN: retorna status down quando haConnections === 0 e rota pública falha", async () => {
    const fakeFetch = async (url) => {
      if (url.includes("20242")) return new Response(METRICS_FIXTURE_ZERO, { status: 200 });
      throw new Error("Public route down");
    };

    const res = await getStationTunnelStatus({
      stationId: "tvbox",
      fetchImpl: fakeFetch,
    });
    expect(res.tunnel.haConnections).toBe(0);
    expect(res.tunnel.connected).toBe(false);
    expect(res.status).toBe("down");
  });

  it("PUBLIC_ROUTE_FAILURE_PROPAGATES: degrada status geral quando a rota pública cai", async () => {
    const fakeFetch = async (url) => {
      if (url.includes("20242")) return new Response(METRICS_FIXTURE_HEALTHY, { status: 200 });
      return new Response("502 Bad Gateway", { status: 502 });
    };

    const res = await getStationTunnelStatus({
      stationId: "tvbox",
      fetchImpl: fakeFetch,
    });
    expect(res.tunnel.haConnections).toBe(4);
    expect(res.publicRoute.status).toBe("degraded");
    expect(res.status).toBe("degraded");
  });

  it("TUNNEL_METRICS_UNAVAILABLE: trata métricas indisponíveis propagando estado da rota pública", async () => {
    const fakeFetch = async (url) => {
      if (url.includes("20242")) throw new Error("Metrics port unreachable");
      return new Response("OK", { status: 200 });
    };

    const res = await getStationTunnelStatus({
      stationId: "tvbox",
      fetchImpl: fakeFetch,
    });
    expect(res.tunnel.connected).toBe(false);
    expect(res.tunnel.haConnections).toBe(0);
    expect(res.publicRoute.status).toBe("ok");
    expect(res.status).toBe("degraded");
  });

  it("TUNNEL_METRICS_EXPLICIT_CONFIG: aceita variáveis de ambiente e parâmetros explícitos", async () => {
    const env = {
      HESTIA_STATION_TUNNEL_METRICS_URL: "http://127.0.0.1:29999/metrics",
      HESTIA_STATION_PUBLIC_HEALTH_URL: "https://custom.example.test/health",
      HESTIA_STATION_TUNNEL_NAME: "custom-tunnel",
    };

    const fakeFetch = async (url) => {
      if (url.includes("29999")) return new Response(METRICS_FIXTURE_HEALTHY, { status: 200 });
      return new Response("OK", { status: 200 });
    };

    const res = await getStationTunnelStatus({
      stationId: "tvbox",
      env,
      fetchImpl: fakeFetch,
    });

    expect(res.tunnel.name).toBe("custom-tunnel");
    expect(res.publicRoute.hostname).toBe("custom.example.test");
    expect(res.status).toBe("ok");
  });
});
