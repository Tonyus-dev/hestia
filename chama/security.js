// Chama Local — validações de segurança na borda HTTP.
// Host allowlist (mitiga DNS rebinding contra a API local) + rate limit
// simples em memória para /api/*. Nada aqui depende de rede ou de Fastify,
// para ficar testável isoladamente.

export function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

// Host headers aceitos para host:port configurados. Quando o bind é loopback,
// aceitamos também os aliases usuais (127.0.0.1, localhost, [::1]) no mesmo
// porto, já que todos apontam para a própria máquina.
export function buildAllowedHosts(host, port) {
  const allowed = new Set([`${host}:${port}`]);
  if (isLoopbackHost(host)) {
    allowed.add(`127.0.0.1:${port}`);
    allowed.add(`localhost:${port}`);
    allowed.add(`[::1]:${port}`);
  }
  return allowed;
}

export function isAllowedHostHeader(hostHeader, allowedHosts) {
  return typeof hostHeader === "string" && allowedHosts.has(hostHeader);
}

// Janela fixa por chave (IP). Suficiente para uma API local somente leitura
// que só precisa impedir martelamento acidental ou abusivo.
export class RateLimiter {
  constructor({ windowMs = 10_000, max = 60 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  check(key, now = Date.now()) {
    let entry = this.hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    const allowed = entry.count <= this.max;
    return { allowed, retryAfterMs: allowed ? 0 : entry.resetAt - now };
  }

  // Remove entradas expiradas para não crescer sem limite em processos de longa duração.
  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) {
      if (now > entry.resetAt) this.hits.delete(key);
    }
  }
}
