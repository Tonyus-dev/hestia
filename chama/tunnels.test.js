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

describe("getStationTunnelStatus", () => {
  it("retorna status completo combinando conector e rota pública", async () => {
    const fakeFetch = async (url) => {
      if (url.includes("20242")) {
        return new Response(METRICS_FIXTURE_HEALTHY, { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const res = await getStationTunnelStatus({
      metricsUrl: "http://127.0.0.1:20242/metrics",
      publicRouteUrl: "https://hestia.nomosludens.ia.br/api/health",
      tunnelName: "hestia-kaline-box",
      fetchImpl: fakeFetch,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    expect(res.tunnel.name).toBe("hestia-kaline-box");
    expect(res.tunnel.haConnections).toBe(4);
    expect(res.publicRoute.hostname).toBe("hestia.nomosludens.ia.br");
    expect(res.publicRoute.httpStatus).toBe(200);
  });
});
