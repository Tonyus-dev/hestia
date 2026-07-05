#!/usr/bin/env bash
set -u -o pipefail
SERVICE_NAME="${HESTIA_SERVICE_NAME:-hestia-console}"
BASE_URL="${HESTIA_URL:-http://127.0.0.1:4517}"
KALINE_ROOT="${KALINE_ROOT:-/KALINE}"
fail=0
ok(){ echo "ok: $*"; }
warn(){ echo "warn: $*"; }
bad(){ echo "erro: $*"; fail=1; }
check_path(){ [ -e "$1" ] && ok "$1 existe" || bad "$1 ausente"; }
if command -v node >/dev/null 2>&1; then major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; [ "$major" -ge 20 ] && ok "Node $(node -v)" || bad "Node >=20 necessário (detectado $(node -v 2>/dev/null || echo n/a))"; else bad "node ausente"; fi
command -v npm >/dev/null 2>&1 && ok "npm $(npm -v)" || bad "npm ausente"
[ -d dist/client ] && ok "dist/client existe" || bad "dist/client ausente; rode npm run build"
if [ -f dist/server/index.mjs ] || [ -f dist/server/server.js ] || [ -f .output/server/index.mjs ]; then ok "bundle SSR encontrado"; else bad "bundle SSR ausente; rode npm run build"; fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files "$SERVICE_NAME.service" --no-legend 2>/dev/null | grep -q . && ok "serviço $SERVICE_NAME existe" || warn "serviço $SERVICE_NAME não instalado"
  systemctl is-active --quiet "$SERVICE_NAME.service" 2>/dev/null && active=1 || active=0
  [ "$active" -eq 1 ] && ok "serviço $SERVICE_NAME ativo" || warn "serviço $SERVICE_NAME inativo"
else warn "systemctl indisponível"; active=0; fi
check_path "$KALINE_ROOT"
[ -w "$KALINE_ROOT" ] && ok "$KALINE_ROOT gravável pelo usuário atual" || warn "$KALINE_ROOT não é gravável pelo usuário atual"
[ -d "$KALINE_ROOT/entrada" ] && ok "$KALINE_ROOT/entrada existe" || warn "$KALINE_ROOT/entrada ausente; rode npm run kaline:init"
if command -v findmnt >/dev/null 2>&1 && findmnt -n -T "$KALINE_ROOT" >/dev/null 2>&1; then
  fs="$(findmnt -n -T "$KALINE_ROOT" -o FSTYPE 2>/dev/null | head -n1)"
  ok "$KALINE_ROOT fstype=$fs"
  case "$fs" in fuseblk|ntfs|ntfs-3g) warn "NTFS/fuseblk: permissões vêm das opções de montagem; chown/chgrp/chmod podem não funcionar. Use HESTIA_SERVICE_USER=<dono do mount> para organizer.";; esac
fi
if [ "${active:-0}" -eq 1 ] && command -v curl >/dev/null 2>&1; then
  curl -fsS "$BASE_URL/api/health" >/dev/null && ok "$BASE_URL/api/health responde" || bad "$BASE_URL/api/health não respondeu"
  curl -fsS "$BASE_URL/api/storage/status" >/dev/null && ok "$BASE_URL/api/storage/status responde" || bad "$BASE_URL/api/storage/status não respondeu"
fi
exit "$fail"
