import dgram from "node:dgram";

function parseMacAddress(macStr) {
  if (typeof macStr !== "string") return null;
  const clean = macStr.replace(/[:-]/g, "").trim();
  if (clean.length !== 12 || !/^[0-9a-fA-F]{12}$/.test(clean)) return null;
  return Buffer.from(clean, "hex");
}

export function buildMagicPacket(macBytes) {
  if (!macBytes || macBytes.length !== 6) {
    throw new TypeError("MAC address bytes inválidos (esperado Buffer de 6 bytes)");
  }
  const prefix = Buffer.alloc(6, 0xff);
  const body = Buffer.concat(Array(16).fill(macBytes));
  return Buffer.concat([prefix, body]);
}

export async function sendWakeOnLanPacket({
  macAddress,
  broadcastAddress = "255.255.255.255",
  port = 9,
  timeoutMs = 3000,
} = {}) {
  const macBytes = parseMacAddress(macAddress);
  if (!macBytes) {
    return {
      ok: false,
      code: "WAKE_MISCONFIGURED",
      error: "MAC address de despertar inválido ou não configurado",
    };
  }

  const packet = buildMagicPacket(macBytes);

  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let resolved = false;

    const cleanup = () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignora erro se já fechado
      }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          ok: false,
          code: "WAKE_TIMEOUT",
          error: "Timeout ao transmitir Magic Packet WoL",
        });
      }
    }, timeoutMs);

    socket.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          ok: false,
          code: "WAKE_FAILED",
          error: `Falha no socket UDP WoL: ${err.message}`,
        });
      }
    });

    socket.bind(() => {
      try {
        socket.setBroadcast(true);
        socket.send(packet, 0, packet.length, port, broadcastAddress, (err) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            if (err) {
              resolve({
                ok: false,
                code: "WAKE_FAILED",
                error: `Falha ao transmitir Magic Packet: ${err.message}`,
              });
            } else {
              resolve({
                ok: true,
                target: "desktop",
                macAddressSent: true,
                sentAt: new Date().toISOString(),
              });
            }
          }
        });
      } catch (err) {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            ok: false,
            code: "WAKE_FAILED",
            error: `Erro de configuração do socket UDP: ${err.message}`,
          });
        }
      }
    });
  });
}

export async function executeWakeServerAction(env = process.env) {
  const mac = env.HESTIA_WAKE_SERVER_MAC?.trim();
  const broadcastAddress = env.HESTIA_WAKE_BROADCAST_IP?.trim() || "255.255.255.255";
  const port = Number(env.HESTIA_WAKE_PORT) || 9;

  if (!mac) {
    return {
      ok: false,
      code: "WAKE_NOT_CONFIGURED",
      error: "Despertar remoto não configurado (HESTIA_WAKE_SERVER_MAC ausente)",
    };
  }

  return sendWakeOnLanPacket({ macAddress: mac, broadcastAddress, port });
}
