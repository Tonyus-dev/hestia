#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hestia-station-agent"
ENV_FILE="${HESTIA_STATION_ENV_FILE:-/etc/default/$SERVICE_NAME}"
UNIT_FILE="${HESTIA_STATION_UNIT_FILE:-/etc/systemd/system/$SERVICE_NAME.service}"
RUNTIME_DIR="${HESTIA_STATION_INSTALL_ROOT:-${HESTIA_INSTALL_ROOT:-/opt/hestia-station}}"
SYSTEMCTL_BIN="${HESTIA_SYSTEMCTL_BIN:-systemctl}"

log() { echo "[station-install] $*"; }
fail() { echo "[station-install] ERRO: $*" >&2; exit 1; }
valid_station_port() {
  local value="$1" normalized
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  normalized="$value"
  while [[ ${#normalized} -gt 1 && "$normalized" == 0* ]]; do normalized="${normalized#0}"; done
  [ ${#normalized} -le 5 ] && [ "$normalized" -ge 1 ] && [ "$normalized" -le 65535 ]
}
safe_runtime_path() {
  [[ "$1" = /* && "$1" != "/" && "$1" != "/opt" && "$1" != "/tmp" ]]
}

[ "$(id -u)" -eq 0 ] || fail "execute como root (por exemplo, sudo npm run station:install)."
command -v node >/dev/null 2>&1 || fail "node não encontrado."
command -v npm >/dev/null 2>&1 || fail "npm não encontrado."
command -v "$SYSTEMCTL_BIN" >/dev/null 2>&1 || fail "systemctl não encontrado."
node "$SOURCE_DIR/scripts/require-node.mjs" || fail "versão do Node incompatível."
safe_runtime_path "$RUNTIME_DIR" || fail "diretório de runtime inseguro."
NODE_BIN="$(command -v node)"

PORT_EXPLICIT=0
if [[ -v HESTIA_STATION_PORT ]]; then PORT_EXPLICIT=1; STATION_PORT="$HESTIA_STATION_PORT"; else STATION_PORT=4518; fi
valid_station_port "$STATION_PORT" || fail "HESTIA_STATION_PORT deve ser um inteiro entre 1 e 65535."

SERVICE_USER="${HESTIA_STATION_SERVICE_USER:-${SUDO_USER:-}}"
[ -n "$SERVICE_USER" ] || fail "defina HESTIA_STATION_SERVICE_USER; o serviço nunca roda como root."
id "$SERVICE_USER" >/dev/null 2>&1 || fail "usuário $SERVICE_USER não existe."
[ "$(id -u "$SERVICE_USER")" -ne 0 ] || fail "o usuário do serviço não pode ser root."
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

STAGING="$(mktemp -d)"
trap 'rm -rf -- "$STAGING"' EXIT
cp "$SOURCE_DIR/packaging/station-runtime/package.json" "$STAGING/package.json"
cp "$SOURCE_DIR/packaging/station-runtime/package-lock.json" "$STAGING/package-lock.json"
cp "$SOURCE_DIR/station.js" "$STAGING/station.js"
mkdir -p "$STAGING/chama" "$STAGING/scripts"
for file in codice.js codiceReadOnlyRoutes.js config.js dataDir.js events.js legacyStorageConfig.js organizerApply.js organizerIds.js organizerOperationLock.js organizerPlan.js organizerPublic.js organizerRedo.js organizerUndo.js retention.js security.js services.js stationAgent.js stationClient.js stationDoctor.js stationOrganizerRoutes.js storage.js storageModel.js storageScanner.js storageSources.js; do
  cp "$SOURCE_DIR/chama/$file" "$STAGING/chama/$file"
done
cp "$SOURCE_DIR/scripts/station-doctor.mjs" "$SOURCE_DIR/scripts/require-node.mjs" "$STAGING/scripts/"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$STAGING"
log "instalando dependências mínimas reproduzivelmente"
runuser -u "$SERVICE_USER" -- env HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)" npm --prefix "$STAGING" ci --omit=dev --ignore-scripts --no-audit --no-fund

rm -rf -- "$RUNTIME_DIR"
install -d -m 0755 -o root -g root "$RUNTIME_DIR"
cp -a "$STAGING/." "$RUNTIME_DIR/"
chown -R root:root "$RUNTIME_DIR"

if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$($NODE_BIN -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  install -m 0600 -o root -g root /dev/null "$ENV_FILE"
  {
    echo "HESTIA_STATION_HOST=127.0.0.1"
    echo "HESTIA_STATION_PORT=$STATION_PORT"
    echo "HESTIA_STATION_TOKEN=$TOKEN"
    echo "HESTIA_STATION_ORGANIZER_ENABLED=0"
    echo "HESTIA_STATION_CODICE_ENABLED=0"
    echo "# HESTIA_CODICE_CORS_ORIGIN=https://<ORIGEM_CONSOLE_PRIVADA>"
    echo "# HESTIA_STATION_ALLOWED_HOSTS=<HOST_PRIVADO>"
  } > "$ENV_FILE"
  log "configuração criada em $ENV_FILE"
else
  if [ "$PORT_EXPLICIT" -eq 1 ]; then
    CURRENT_PORT="$(awk -F= '$1 == "HESTIA_STATION_PORT" { count += 1; value = substr($0, index($0, "=") + 1) } END { if (count == 1) print value; else exit 1 }' "$ENV_FILE")" || fail "não foi possível ler HESTIA_STATION_PORT da configuração existente."
    valid_station_port "$CURRENT_PORT" || fail "HESTIA_STATION_PORT da configuração existente é inválida."
    [ "$((10#$CURRENT_PORT))" -eq "$((10#$STATION_PORT))" ] || fail "Configuração existente usa a porta $CURRENT_PORT. Edite $ENV_FILE explicitamente para mudar para $STATION_PORT."
  fi
  log "configuração existente preservada em $ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

escape() { printf '%s' "$1" | sed 's/[\&#]/\\&/g'; }
sed -e "s#__NODE_BIN__#$(escape "$NODE_BIN")#g" \
  -e "s#__RUNTIME_DIR__#$(escape "$RUNTIME_DIR")#g" \
  -e "s#__SERVICE_USER__#$(escape "$SERVICE_USER")#g" \
  -e "s#__SERVICE_GROUP__#$(escape "$SERVICE_GROUP")#g" \
  "$SOURCE_DIR/packaging/$SERVICE_NAME.service.in" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"
"$SYSTEMCTL_BIN" daemon-reload
"$SYSTEMCTL_BIN" enable --now "$SERVICE_NAME.service"
"$SYSTEMCTL_BIN" restart "$SERVICE_NAME.service"
ACTIVE=0
for _attempt in 1 2 3 4 5 6 7 8 9 10; do "$SYSTEMCTL_BIN" is-active --quiet "$SERVICE_NAME.service" && { ACTIVE=1; break; }; sleep 1; done
[ "$ACTIVE" -eq 1 ] || fail "serviço não ficou ativo em até 10 segundos."

DOCTOR_OK=0
DOCTOR_OUTPUT=""
for _attempt in 1 2 3 4 5; do
  if DOCTOR_OUTPUT="$("$NODE_BIN" "$RUNTIME_DIR/scripts/station-doctor.mjs" --env-file "$ENV_FILE" --require-systemd --timeout-ms 10000 2>&1)"; then DOCTOR_OK=1; break; fi
  [ "$_attempt" -eq 5 ] || sleep 1
done
printf '%s\n' "$DOCTOR_OUTPUT"
[ "$DOCTOR_OK" -eq 1 ] || fail "serviço ficou ativo, mas o Station Doctor não passou após 5 tentativas."
log "runtime instalado em $RUNTIME_DIR e verificado"
