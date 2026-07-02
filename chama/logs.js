// Chama Local — ring buffer em memória, apenas para eventos da própria Chama.
const MAX = 200;
const buffer = [];

export function log(level, message) {
  buffer.push({ timestamp: new Date().toISOString(), level, message });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
}

export function getLogs() {
  return { items: buffer.slice(-100) };
}
