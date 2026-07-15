#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hestia-station-agent"
ENV_FILE="/etc/default/$SERVICE_NAME"
UNIT_FILE="/etc/systemd/system/$SERVICE_NAME.service"

log() { echo "[station-install] $*"; }
fail() { echo "[station-install] ERRO: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "execute como root (por exemplo, sudo npm run station:install)."
command -v node >/dev/null 2>&1 || fail "node não encontrado."
command -v systemctl >/dev/null 2>&1 || fail "systemctl não encontrado."

SERVICE_USER="${HESTIA_STATION_SERVICE_USER:-${SUDO_USER:-}}"
[ -n "$SERVICE_USER" ] || fail "defina HESTIA_STATION_SERVICE_USER; o serviço nunca roda como root."
id "$SERVICE_USER" >/dev/null 2>&1 || fail "usuário $SERVICE_USER não existe."
[ "$(id -u "$SERVICE_USER")" -ne 0 ] || fail "o usuário do serviço não pode ser root."

if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  install -m 0600 -o root -g root /dev/null "$ENV_FILE"
  {
    echo "HESTIA_STATION_HOST=127.0.0.1"
    echo "HESTIA_STATION_PORT=4518"
    echo "HESTIA_STATION_TOKEN=$TOKEN"
    echo "# HESTIA_STATION_ALLOWED_HOSTS=station.example.ts.net"
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  log "configuração criada em $ENV_FILE"
else
  log "configuração existente preservada em $ENV_FILE"
fi

sed -e "s#__WORKDIR__#$ROOT_DIR#g" -e "s#__SERVICE_USER__#$SERVICE_USER#g" \
  "$ROOT_DIR/packaging/$SERVICE_NAME.service.in" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME.service"
systemctl restart "$SERVICE_NAME.service"
log "serviço instalado e iniciado"
