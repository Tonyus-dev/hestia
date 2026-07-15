#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="hestia-station-agent"
ENV_FILE="/etc/default/$SERVICE_NAME"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$#" -le 1 ] || { echo "Uso: $0 [--purge]" >&2; exit 2; }
[ "${1:-}" = "" ] || [ "${1:-}" = "--purge" ] || { echo "Uso: $0 [--purge]" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "execute como root" >&2; exit 1; }

systemctl disable --now "$SERVICE_NAME.service" 2>/dev/null || true
rm -f "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
[ ! -e "/etc/systemd/system/$SERVICE_NAME.service" ] || { echo "falha ao remover unit" >&2; exit 1; }
if systemctl is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
  echo "serviço continua ativo" >&2
  exit 1
fi
if [ "$PURGE" -eq 1 ]; then
  rm -f "$ENV_FILE"
  echo "[station-uninstall] serviço e configuração removidos"
else
  echo "[station-uninstall] serviço removido; configuração preservada em $ENV_FILE"
fi
