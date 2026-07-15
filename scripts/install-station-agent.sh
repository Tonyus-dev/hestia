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
NODE_BIN="$(command -v node)"
[ -x "$NODE_BIN" ] || fail "node não é executável: $NODE_BIN"

SERVICE_USER="${HESTIA_STATION_SERVICE_USER:-${SUDO_USER:-}}"
[ -n "$SERVICE_USER" ] || fail "defina HESTIA_STATION_SERVICE_USER; o serviço nunca roda como root."
id "$SERVICE_USER" >/dev/null 2>&1 || fail "usuário $SERVICE_USER não existe."
[ "$(id -u "$SERVICE_USER")" -ne 0 ] || fail "o usuário do serviço não pode ser root."
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
[ -n "$SERVICE_GROUP" ] || fail "não foi possível resolver o grupo primário de $SERVICE_USER."

if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$($NODE_BIN -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  install -m 0600 -o root -g root /dev/null "$ENV_FILE"
  {
    echo "HESTIA_STATION_HOST=127.0.0.1"
    echo "HESTIA_STATION_PORT=4518"
    echo "HESTIA_STATION_TOKEN=$TOKEN"
    echo "# HESTIA_STATION_ALLOWED_HOSTS=station.example.ts.net"
  } > "$ENV_FILE"
  log "configuração criada em $ENV_FILE"
else
  log "configuração existente preservada em $ENV_FILE"
fi

chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

escape_sed_replacement() {
  printf "%s" "$1" | sed 's/[\\&#]/\\&/g'
}
NODE_BIN_SED="$(escape_sed_replacement "$NODE_BIN")"
ROOT_DIR_SED="$(escape_sed_replacement "$ROOT_DIR")"
SERVICE_USER_SED="$(escape_sed_replacement "$SERVICE_USER")"
SERVICE_GROUP_SED="$(escape_sed_replacement "$SERVICE_GROUP")"

sed -e "s#__NODE_BIN__#$NODE_BIN_SED#g" \
  -e "s#__WORKDIR__#$ROOT_DIR_SED#g" \
  -e "s#__SERVICE_USER__#$SERVICE_USER_SED#g" \
  -e "s#__SERVICE_GROUP__#$SERVICE_GROUP_SED#g" \
  "$ROOT_DIR/packaging/$SERVICE_NAME.service.in" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME.service"
systemctl restart "$SERVICE_NAME.service"
ACTIVE=0
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if systemctl is-active --quiet "$SERVICE_NAME.service"; then
    ACTIVE=1
    break
  fi
  sleep 1
done
[ "$ACTIVE" -eq 1 ] || fail "serviço não ficou ativo em até 10 segundos."

DOCTOR_OK=0
DOCTOR_OUTPUT=""
for _attempt in 1 2 3 4 5; do
  if DOCTOR_OUTPUT="$(
    "$NODE_BIN" "$ROOT_DIR/scripts/station-doctor.mjs" \
      --env-file "$ENV_FILE" \
      --require-systemd \
      --timeout-ms 10000 2>&1
  )"; then
    DOCTOR_OK=1
    break
  fi
  [ "$_attempt" -eq 5 ] || sleep 1
done

printf '%s\n' "$DOCTOR_OUTPUT"
[ "$DOCTOR_OK" -eq 1 ] ||
  fail "serviço ficou ativo, mas o Station Doctor não passou após 5 tentativas."

log "serviço instalado e verificado"
