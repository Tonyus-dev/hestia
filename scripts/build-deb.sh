#!/usr/bin/env bash
# Gera dist-deb/hestia-console_<versão>_amd64.deb a partir do repo atual.
# Empacota o backend (hestia.js + chama/), o frontend buildado, um serviço
# systemd (bind fixo em 127.0.0.1:4517), um launcher de menu e os ícones.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_NAME="hestia-console"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
ARCH="amd64"
OUT_DIR="$ROOT_DIR/dist-deb"
STAGING="$ROOT_DIR/.deb-staging"
DEB_FILE="$OUT_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb"

log() { echo "[build-deb] $*"; }

# --- Pré-requisitos: falha rápido com mensagem clara em vez de erro cru de shell. ------
command -v node >/dev/null 2>&1 || {
  echo "[build-deb] ERRO: node não encontrado. Instale Node.js 20+ antes de continuar." >&2
  exit 1
}
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[build-deb] ERRO: Node.js 20+ é necessário para buildar (detectado $(node -v))." >&2
  exit 1
fi
command -v npm >/dev/null 2>&1 || {
  echo "[build-deb] ERRO: npm não encontrado." >&2
  exit 1
}
command -v dpkg-deb >/dev/null 2>&1 || {
  echo "[build-deb] ERRO: dpkg-deb não encontrado. No Debian/Mint: sudo apt install dpkg-dev." >&2
  exit 1
}

log "limpando staging e dist-deb/ anteriores"
rm -rf "$STAGING" "$OUT_DIR"
mkdir -p "$OUT_DIR" "$STAGING/DEBIAN"

if [ -f "$ROOT_DIR/package-lock.json" ]; then
  log "instalando dependências do projeto com npm ci"
  (cd "$ROOT_DIR" && npm ci)
else
  log "package-lock ausente; instalando dependências do projeto com npm install"
  (cd "$ROOT_DIR" && npm install)
fi

log "buildando o frontend"
(cd "$ROOT_DIR" && npm run build)

# hestia.js procura estes mesmos pares (público + bundle SSR) nesta ordem —
# mantém staging consistente com o que o servidor espera encontrar em
# runtime. O build é SSR (bundle Nitro), não uma SPA estática: precisa dos
# dois lados, não só do público.
PUBLIC_SRC=""
for candidate in "dist/client:dist/server/index.mjs" "dist/client:dist/server/server.js" ".output/public:.output/server/index.mjs"; do
  publicRel="${candidate%%:*}"
  serverRel="${candidate##*:}"
  if [ -d "$ROOT_DIR/$publicRel" ] && [ -f "$ROOT_DIR/$serverRel" ]; then
    PUBLIC_SRC="$ROOT_DIR/$publicRel"
    PUBLIC_DEST="$publicRel"
    SERVER_SRC_DIR="$ROOT_DIR/$(dirname "$serverRel")"
    SERVER_DEST_DIR="$(dirname "$serverRel")"
    break
  fi
done
if [ -z "$PUBLIC_SRC" ]; then
  echo "[build-deb] ERRO: build do frontend (SSR) não encontrado (dist/client+dist/server/index.mjs|server.js ou .output/public+.output/server)." >&2
  exit 1
fi
log "frontend encontrado em $PUBLIC_DEST (+ bundle SSR em $SERVER_DEST_DIR)"

APP_DIR="$STAGING/opt/$PKG_NAME"
mkdir -p "$APP_DIR"

log "copiando app para staging ($APP_DIR)"
cp "$ROOT_DIR/hestia.js" "$APP_DIR/"
cp -r "$ROOT_DIR/chama" "$APP_DIR/"
find "$APP_DIR/chama" -name "*.test.js" -delete
cp "$ROOT_DIR/package.json" "$APP_DIR/"
[ -f "$ROOT_DIR/package-lock.json" ] && cp "$ROOT_DIR/package-lock.json" "$APP_DIR/"
mkdir -p "$(dirname "$APP_DIR/$PUBLIC_DEST")"
cp -r "$PUBLIC_SRC" "$APP_DIR/$PUBLIC_DEST"
mkdir -p "$APP_DIR/$SERVER_DEST_DIR"
cp -r "$SERVER_SRC_DIR/." "$APP_DIR/$SERVER_DEST_DIR/"

log "instalando dependências de produção no staging"
if [ -f "$APP_DIR/package-lock.json" ]; then
  (cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
else
  (cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)
fi

log "instalando systemd unit, launcher, desktop entry e ícones"
mkdir -p "$STAGING/etc/systemd/system"
cp "$ROOT_DIR/packaging/hestia-console.service" "$STAGING/etc/systemd/system/"

mkdir -p "$STAGING/usr/bin"
for bin in hestia-console hestia-console-status hestia-console-stop; do
  cp "$ROOT_DIR/packaging/bin/$bin" "$STAGING/usr/bin/$bin"
  chmod 0755 "$STAGING/usr/bin/$bin"
done

mkdir -p "$STAGING/usr/share/applications"
cp "$ROOT_DIR/packaging/hestia-console.desktop" "$STAGING/usr/share/applications/"

ICONS_SRC="$ROOT_DIR/assets/icons"
for size in 512 256 128 64 48; do
  dest="$STAGING/usr/share/icons/hicolor/${size}x${size}/apps"
  mkdir -p "$dest"
  cp "$ICONS_SRC/hestia-console-${size}.png" "$dest/hestia-console.png"
done
if [ -f "$ICONS_SRC/hestia-console.svg" ]; then
  dest="$STAGING/usr/share/icons/hicolor/scalable/apps"
  mkdir -p "$dest"
  cp "$ICONS_SRC/hestia-console.svg" "$dest/hestia-console.svg"
fi

log "gerando metadados DEBIAN/"
sed "s/__VERSION__/$VERSION/" "$ROOT_DIR/packaging/debian/control.template" > "$STAGING/DEBIAN/control"
cp "$ROOT_DIR/packaging/debian/postinst" "$STAGING/DEBIAN/postinst"
cp "$ROOT_DIR/packaging/debian/prerm" "$STAGING/DEBIAN/prerm"
cp "$ROOT_DIR/packaging/debian/postrm" "$STAGING/DEBIAN/postrm"
chmod 0755 "$STAGING/DEBIAN/postinst" "$STAGING/DEBIAN/prerm" "$STAGING/DEBIAN/postrm"

log "empacotando $DEB_FILE"
dpkg-deb --build --root-owner-group "$STAGING" "$DEB_FILE"

log "pronto: $DEB_FILE"
