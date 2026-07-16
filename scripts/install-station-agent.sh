#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hestia-station-agent"
ENV_FILE="${HESTIA_STATION_ENV_FILE:-/etc/default/$SERVICE_NAME}"
UNIT_FILE="${HESTIA_STATION_UNIT_FILE:-/etc/systemd/system/$SERVICE_NAME.service}"

log() { echo "[station-install] $*"; }
fail() { echo "[station-install] ERRO: $*" >&2; exit 1; }

valid_station_port() {
  local value="$1"
  local normalized
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  normalized="$value"
  while [[ ${#normalized} -gt 1 && "$normalized" == 0* ]]; do
    normalized="${normalized#0}"
  done
  [ ${#normalized} -le 5 ] && [ "$normalized" -ge 1 ] && [ "$normalized" -le 65535 ]
}

[ "$(id -u)" -eq 0 ] || fail "execute como root (por exemplo, sudo npm run station:install)."
command -v node >/dev/null 2>&1 || fail "node não encontrado."
command -v systemctl >/dev/null 2>&1 || fail "systemctl não encontrado."
NODE_BIN="$(command -v node)"
[ -x "$NODE_BIN" ] || fail "node não é executável: $NODE_BIN"

PORT_EXPLICIT=0
if [[ -v HESTIA_STATION_PORT ]]; then
  PORT_EXPLICIT=1
  STATION_PORT="$HESTIA_STATION_PORT"
else
  STATION_PORT=4518
fi
if ! valid_station_port "$STATION_PORT"; then
  fail "HESTIA_STATION_PORT deve ser um inteiro entre 1 e 65535."
fi

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
    echo "HESTIA_STATION_PORT=$STATION_PORT"
    echo "HESTIA_STATION_TOKEN=$TOKEN"
    echo "HESTIA_STATION_ORGANIZER_ENABLED=0"
    echo "# HESTIA_STATION_ALLOWED_HOSTS=station.example.ts.net"
  } > "$ENV_FILE"
  log "configuração criada em $ENV_FILE"
else
  if [ "$PORT_EXPLICIT" -eq 1 ]; then
    if ! CURRENT_PORT="$(
      awk -F= '
        $1 == "HESTIA_STATION_PORT" { count += 1; value = substr($0, index($0, "=") + 1) }
        END { if (count == 1) print value; else exit 1 }
      ' "$ENV_FILE"
    )"; then
      fail "não foi possível ler HESTIA_STATION_PORT da configuração existente."
    fi
    if ! valid_station_port "$CURRENT_PORT"; then
      fail "HESTIA_STATION_PORT da configuração existente é inválida."
    fi
    if [ "$((10#$CURRENT_PORT))" -ne "$((10#$STATION_PORT))" ]; then
      fail "Configuração existente usa a porta $CURRENT_PORT. Edite $ENV_FILE explicitamente para mudar para $STATION_PORT."
    fi
  fi
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
