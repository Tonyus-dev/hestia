#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="hestia-console"
RUNTIME_DIR="${HESTIA_INSTALL_ROOT:-/opt/hestia-console}"
ENV_FILE="${HESTIA_ENV_FILE:-/etc/default/hestia-console}"
UNIT_FILE="${HESTIA_UNIT_FILE:-/etc/systemd/system/hestia-console.service}"
SYSTEMCTL_BIN="${HESTIA_SYSTEMCTL_BIN:-systemctl}"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$#" -le 1 ] && { [ "${1:-}" = "" ] || [ "${1:-}" = "--purge" ]; } || { echo "Uso: $0 [--purge]" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "execute como root" >&2; exit 1; }
[[ "$RUNTIME_DIR" = /* && "$RUNTIME_DIR" != "/" && "$RUNTIME_DIR" != "/opt" && "$RUNTIME_DIR" != "/tmp" ]] || { echo "runtime inseguro" >&2; exit 1; }

"$SYSTEMCTL_BIN" disable --now "$SERVICE_NAME.service" 2>/dev/null || true
rm -f -- "$UNIT_FILE"
"$SYSTEMCTL_BIN" daemon-reload
rm -rf -- "$RUNTIME_DIR"
if [ "$PURGE" -eq 1 ]; then
  rm -f -- "$ENV_FILE"
  echo "[uninstall] serviço, runtime e configuração removidos"
else
  echo "[uninstall] serviço e runtime removidos; configuração preservada em $ENV_FILE"
fi
