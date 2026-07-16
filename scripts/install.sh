#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${HESTIA_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="hestia-console"
RUNTIME_DIR="${HESTIA_INSTALL_ROOT:-/opt/hestia-console}"
ENV_FILE="${HESTIA_ENV_FILE:-/etc/default/hestia-console}"
UNIT_FILE="${HESTIA_UNIT_FILE:-/etc/systemd/system/hestia-console.service}"
SYSTEMCTL_BIN="${HESTIA_SYSTEMCTL_BIN:-systemctl}"
SERVICE_USER="${HESTIA_SERVICE_USER:-hestia-console}"
SERVICE_GROUP="${HESTIA_SERVICE_GROUP:-$SERVICE_USER}"

log() { echo "[install] $*"; }
fail() { echo "[install] ERRO: $*" >&2; exit 1; }
safe_runtime_path() { [[ "$1" = /* && "$1" != "/" && "$1" != "/opt" && "$1" != "/tmp" ]]; }

[ "$(id -u)" -eq 0 ] || fail "execute com sudo para instalar a Console."
command -v node >/dev/null 2>&1 || fail "node não encontrado."
command -v npm >/dev/null 2>&1 || fail "npm não encontrado."
command -v "$SYSTEMCTL_BIN" >/dev/null 2>&1 || fail "systemctl não encontrado."
node "$SOURCE_DIR/scripts/require-node.mjs" || fail "versão do Node incompatível."
safe_runtime_path "$RUNTIME_DIR" || fail "diretório de runtime inseguro."

BUILD_USER="${SUDO_USER:-}"
[ -n "$BUILD_USER" ] && [ "$(id -u "$BUILD_USER")" -ne 0 ] || fail "execute via sudo a partir de um usuário não-root."
BUILD_HOME="$(getent passwd "$BUILD_USER" | cut -d: -f6)"
run_as_builder() { runuser -u "$BUILD_USER" -- env HOME="$BUILD_HOME" "$@"; }

log "instalando dependências reproduzivelmente e buildando sem root"
run_as_builder npm --prefix "$SOURCE_DIR" ci --ignore-scripts --no-audit --no-fund
run_as_builder npm --prefix "$SOURCE_DIR" run build
[ -d "$SOURCE_DIR/dist/client" ] && [ -d "$SOURCE_DIR/dist/server" ] || fail "build SSR ausente."

STAGING="$(mktemp -d)"
trap 'rm -rf -- "$STAGING"' EXIT
cp "$SOURCE_DIR/hestia.js" "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$STAGING/"
cp -a "$SOURCE_DIR/chama" "$STAGING/chama"
find "$STAGING/chama" -name '*.test.js' -delete
cp -a "$SOURCE_DIR/dist" "$STAGING/dist"
mkdir -p "$STAGING/scripts"
cp "$SOURCE_DIR/scripts/console-doctor.mjs" "$SOURCE_DIR/scripts/require-node.mjs" "$STAGING/scripts/"
chown -R "$BUILD_USER:$(id -gn "$BUILD_USER")" "$STAGING"
run_as_builder npm --prefix "$STAGING" ci --omit=dev --ignore-scripts --no-audit --no-fund

rm -rf -- "$RUNTIME_DIR"
install -d -m 0755 -o root -g root "$RUNTIME_DIR"
cp -a "$STAGING/." "$RUNTIME_DIR/"
chown -R root:root "$RUNTIME_DIR"

if ! getent group "$SERVICE_GROUP" >/dev/null; then addgroup --system "$SERVICE_GROUP"; fi
if ! getent passwd "$SERVICE_USER" >/dev/null; then
  adduser --system --ingroup "$SERVICE_GROUP" --no-create-home --home "$RUNTIME_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if [ ! -f "$ENV_FILE" ]; then
  install -m 0600 -o root -g root /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
HESTIA_HOST=127.0.0.1
HESTIA_PORT=4517

# HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
# HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>

# HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
# HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>

HESTIA_STATION_TIMEOUT_MS=5000
EOF
  log "configuração criada em $ENV_FILE"
else
  log "configuração existente preservada em $ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"
if grep -Eq '^HESTIA_STATION_(BASE_URL|TOKEN)=' "$ENV_FILE"; then
  fail "Configuração legada detectada. Substitua HESTIA_STATION_BASE_URL/TOKEN pelas variáveis de desktop e TV Box."
fi

escape() { printf '%s' "$1" | sed 's/[\&#]/\\&/g'; }
sed -e "s#__RUNTIME_DIR__#$(escape "$RUNTIME_DIR")#g" \
  -e "s#__SERVICE_USER__#$(escape "$SERVICE_USER")#g" \
  -e "s#__SERVICE_GROUP__#$(escape "$SERVICE_GROUP")#g" \
  "$SOURCE_DIR/packaging/hestia-console.service.in" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"
"$SYSTEMCTL_BIN" daemon-reload
"$SYSTEMCTL_BIN" enable --now "$SERVICE_NAME.service"
"$SYSTEMCTL_BIN" restart "$SERVICE_NAME.service"

DOCTOR_OUTPUT=""
DOCTOR_OK=0
for _attempt in 1 2 3 4 5; do
  if DOCTOR_OUTPUT="$(HESTIA_INSTALL_ROOT="$RUNTIME_DIR" HESTIA_ENV_FILE="$ENV_FILE" node "$RUNTIME_DIR/scripts/console-doctor.mjs" --require-systemd 2>&1)"; then DOCTOR_OK=1; break; fi
  [ "$_attempt" -eq 5 ] || sleep 1
done
printf '%s\n' "$DOCTOR_OUTPUT"
[ "$DOCTOR_OK" -eq 1 ] || fail "serviço não passou no Console Doctor."
log "runtime instalado em $RUNTIME_DIR e verificado"
