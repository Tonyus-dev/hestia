#!/usr/bin/env bash
# Instala a Héstia rodando DIRETO deste checkout do git — sem copiar nada pra /opt.
# Ideal pra quem acompanha o repo: atualizar é só `git pull && ./scripts/install.sh` de novo
# (idempotente), sem precisar gerar e reinstalar um .deb novo a cada mudança de código.
# Pra instalar como app empacotado (menu, `apt remove`), use scripts/build-deb.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hestia-console"

log() { echo "[install] $*"; }

# --- Pré-requisitos: falha rápido com mensagem clara. -----------------------
command -v node >/dev/null 2>&1 || {
  echo "[install] ERRO: node não encontrado. Instale Node.js 20+ antes de continuar." >&2
  exit 1
}
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[install] ERRO: Node.js 20+ é necessário (detectado $(node -v))." >&2
  exit 1
fi
command -v npm >/dev/null 2>&1 || {
  echo "[install] ERRO: npm não encontrado." >&2
  exit 1
}

log "instalando dependências"
(cd "$ROOT_DIR" && npm install)

log "buildando o frontend"
(cd "$ROOT_DIR" && npm run build)

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && [ "$(id -u)" = "0" ]; then
  log "instalando serviço systemd (aponta direto pra este checkout: $ROOT_DIR)"
  sed "s#__WORKDIR__#$ROOT_DIR#g" "$ROOT_DIR/packaging/hestia-console.service.in" \
    > "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  log "serviço instalado e rodando em http://127.0.0.1:4517"
  log "pra atualizar depois: git pull && ./scripts/install.sh (idempotente, reinicia o serviço)"
else
  log "sem systemd rodando como init (ou sem privilégio de root): build feito, sem serviço instalado."
  log "rode manualmente com: npm run hestia"
  log "ou rode este script de novo com sudo, num host com systemd de verdade, pra instalar o serviço."
fi
