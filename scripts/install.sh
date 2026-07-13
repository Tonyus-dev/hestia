#!/usr/bin/env bash
# Instala/reinstala a Héstia direto deste checkout. Idempotente e sem buildar como root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hestia-console"
SERVICE_ONLY=0
[ "${1:-}" = "--service-only" ] && SERVICE_ONLY=1
log() { echo "[install] $*"; }
err() { echo "[install] ERRO: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || err "node não encontrado. Instale Node.js 20+."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || err "Node.js 20+ é necessário (detectado $(node -v))."
command -v npm >/dev/null 2>&1 || err "npm não encontrado."

run_as_checkout_user() {
  if [ "$(id -u)" = "0" ] && [ -n "${SUDO_USER:-}" ]; then
    local home
    home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    sudo -H -u "$SUDO_USER" env HOME="$home" "$@"
  else
    "$@"
  fi
}

fix_checkout_owners() {
  [ "$(id -u)" = "0" ] && [ -n "${SUDO_USER:-}" ] || return 0
  local paths=()
  [ -e "$ROOT_DIR/dist" ] && [ "$(stat -c %U "$ROOT_DIR/dist")" = "root" ] && paths+=("$ROOT_DIR/dist")
  [ -e "$ROOT_DIR/.output" ] && [ "$(stat -c %U "$ROOT_DIR/.output")" = "root" ] && paths+=("$ROOT_DIR/.output")
  if [ "${#paths[@]}" -gt 0 ]; then
    log "dist/.output pertence a root; corrigindo dono dentro do checkout"
    chown -R "$SUDO_USER:$SUDO_USER" "${paths[@]}"
  fi
}

install_deps_and_build() {
  fix_checkout_owners
  if [ -f "$ROOT_DIR/package-lock.json" ]; then
    log "instalando dependências com npm ci"
    if ! run_as_checkout_user bash -lc "cd '$ROOT_DIR' && npm ci"; then
      log "npm ci falhou. Verifique package-lock.json; tentando npm install como fallback local."
      run_as_checkout_user bash -lc "cd '$ROOT_DIR' && npm install"
    fi
  elif [ ! -d "$ROOT_DIR/node_modules" ]; then
    log "package-lock ausente e node_modules ausente; rodando npm install"
    run_as_checkout_user bash -lc "cd '$ROOT_DIR' && npm install"
  else
    log "node_modules já existe; pulando npm install"
  fi
  log "buildando frontend sem sudo"
  run_as_checkout_user bash -lc "cd '$ROOT_DIR' && npm run build"
}

has_build() {
  [ -d "$ROOT_DIR/dist/client" ] && { [ -f "$ROOT_DIR/dist/server/index.mjs" ] || [ -f "$ROOT_DIR/dist/server/server.js" ] || [ -f "$ROOT_DIR/.output/server/index.mjs" ]; }
}

diagnose_kaline() {
  [ -e /KALINE ] || { log "aviso: /KALINE não existe ainda."; return 0; }
  if command -v findmnt >/dev/null 2>&1 && findmnt -n -T /KALINE >/dev/null 2>&1; then
    local fs owner
    fs="$(findmnt -n -T /KALINE -o FSTYPE | head -n1)"
    owner="$(stat -c %U /KALINE 2>/dev/null || true)"
    case "$fs" in
      fuseblk|ntfs|ntfs-3g)
        log "aviso: /KALINE está em $fs. Permissões são controladas pelas opções de montagem; chown/chgrp/chmod podem não funcionar."
        log "para organizer/write, use: HESTIA_SERVICE_USER=${owner:-seu_usuario} sudo -E npm run install:local"
        ;;
    esac
  fi
}

install_service() {
  [ "$(id -u)" = "0" ] || { log "sem root: build pronto, mas serviço não instalado. Use: sudo npm run install:service"; return 0; }
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] || { log "systemd indisponível: serviço não instalado."; return 0; }

  # Criar /etc/default/hestia-console com placeholders se não existir
  if [ ! -f /etc/default/hestia-console ]; then
    log "criando template de configuração em /etc/default/hestia-console"
    cat << 'EOF' > /etc/default/hestia-console
# Héstia Console Configuration

# Root path for storage (e.g. /KALINE)
# IMPORTANTE: A raiz de produção oficial do serviço systemd é fixada em /KALINE.
# Para alterar para testes locais ou execução manual, use HESTIA_STORAGE_PATH.
# HESTIA_STORAGE_PATH=/KALINE

# Allowed Host headers (comma-separated, exact values, no wildcards)
# HESTIA_ALLOWED_HOSTS=hestia.exemplo.ts.net,hestia.exemplo.ts.net:443

# Allowed origins for Codice CORS requests (comma-separated, exact values, no wildcards)
# HESTIA_CODICE_CORS_ORIGIN=https://codice.exemplo.com
EOF
  fi

  log "instalando serviço systemd em /etc/systemd/system/${SERVICE_NAME}.service"
  sed -e "s#__WORKDIR__#$ROOT_DIR#g" "$ROOT_DIR/packaging/hestia-console.service.in" > "/etc/systemd/system/${SERVICE_NAME}.service"
  mkdir -p "/etc/systemd/system/${SERVICE_NAME}.service.d"
  if [ -n "${HESTIA_SERVICE_USER:-}" ]; then
    id "$HESTIA_SERVICE_USER" >/dev/null 2>&1 || err "HESTIA_SERVICE_USER=$HESTIA_SERVICE_USER não existe."
    cat > "/etc/systemd/system/${SERVICE_NAME}.service.d/10-user.conf" <<OVERRIDE
[Service]
DynamicUser=no
User=$HESTIA_SERVICE_USER
Group=$HESTIA_SERVICE_USER
ReadWritePaths=-/KALINE
OVERRIDE
    log "modo organizer/write: serviço rodará como $HESTIA_SERVICE_USER"
  else
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service.d/10-user.conf"
    log "modo protegido padrão: DynamicUser=yes. Para NTFS, use HESTIA_SERVICE_USER=<usuario> sudo -E npm run install:local"
  fi
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  systemctl restart "${SERVICE_NAME}.service"
  log "serviço instalado em http://127.0.0.1:4517"
}

diagnose_kaline
if [ "$SERVICE_ONLY" = "0" ]; then
  install_deps_and_build
  has_build || err "build não encontrado após npm run build. Caminhos esperados: dist/client + dist/server/index.mjs|server.js ou .output/server/index.mjs"
else
  fix_checkout_owners
  has_build || err "build ausente. Rode npm run setup:local antes de sudo npm run install:service."
fi
install_service
