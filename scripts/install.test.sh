#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
SOURCE="$TEST_ROOT/source"
BIN="$TEST_ROOT/bin"
mkdir -p "$SOURCE/scripts" "$SOURCE/packaging" "$BIN"
trap 'rm -rf "$TEST_ROOT"' EXIT
cp "$ROOT_DIR/hestia.js" "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$SOURCE/"
cp -a "$ROOT_DIR/chama" "$SOURCE/chama"
cp "$ROOT_DIR/scripts/require-node.mjs" "$ROOT_DIR/scripts/console-doctor.mjs" "$SOURCE/scripts/"
cp "$ROOT_DIR/packaging/hestia-console.service.in" "$SOURCE/packaging/"
fail() { echo "[install-test] ERRO: $*" >&2; exit 1; }

cat > "$BIN/id" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in -u) [ "$#" -eq 1 ] && echo 0 || echo 1000;; -gn) echo builder;; *) exit 0;; esac
EOF
cat > "$BIN/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$BIN/npm" <<'EOF'
#!/usr/bin/env bash
prefix=""
while [ "$#" -gt 0 ]; do [ "$1" = "--prefix" ] && { prefix="$2"; shift 2; continue; }; [ "$1" = "run" ] && [ "${2:-}" = "build" ] && { mkdir -p "$prefix/dist/client" "$prefix/dist/server"; printf 'bundle' > "$prefix/dist/server/server.js"; }; shift; done
[ -n "$prefix" ] && mkdir -p "$prefix/node_modules"
EOF
cat > "$BIN/runuser" <<EOF
#!/usr/bin/env bash
printf 'called\n' >> '$TEST_ROOT/runuser.log'
shift 2; [ "\${1:-}" = "--" ] && shift; exec "\$@"
EOF
cat > "$BIN/getent" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in passwd) echo "builder:x:1000:1000::/tmp:/bin/bash";; group) echo "hestia-console:x:1001:";; esac
EOF
for command in systemctl chown addgroup adduser; do printf '#!/usr/bin/env bash\nexit 0\n' > "$BIN/$command"; done
cat > "$BIN/install" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-d" ]; then mkdir -p "${!#}"; else /usr/bin/install -m 0600 /dev/null "${!#}"; fi
EOF
chmod +x "$BIN"/*

ENV_FILE="$TEST_ROOT/console.env"
UNIT_FILE="$TEST_ROOT/console.service"
RUNTIME="$TEST_ROOT/console-runtime"
output="$(PATH="$BIN:/usr/bin:/bin" SUDO_USER=builder HESTIA_SOURCE_DIR="$SOURCE" HESTIA_INSTALL_ROOT="$RUNTIME" HESTIA_ENV_FILE="$ENV_FILE" HESTIA_UNIT_FILE="$UNIT_FILE" HESTIA_SYSTEMCTL_BIN=systemctl bash "$ROOT_DIR/scripts/install.sh" 2>&1)"
[ -f "$RUNTIME/hestia.js" ] && [ -f "$RUNTIME/dist/server/server.js" ] || fail "runtime da Console incompleto"
grep -Fqx "WorkingDirectory=$RUNTIME" "$UNIT_FILE" || fail "unit depende do checkout"
grep -Fqx 'HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>' "$ENV_FILE" && fail "placeholder deveria estar comentado"
grep -Fqx '# HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>' "$ENV_FILE" || fail "env desktop ausente"
[ -s "$TEST_ROOT/runuser.log" ] || fail "npm não passou pelo usuário não-root"
[[ "$output" != *"TOKEN_DESKTOP="* ]] || fail "env/token apareceu na saída"

printf '%s\n' 'HESTIA_STATION_BASE_URL=https://legacy.example' 'HESTIA_STATION_TOKEN=secret' > "$ENV_FILE"
before="$(sha256sum "$ENV_FILE")"
if PATH="$BIN:/usr/bin:/bin" SUDO_USER=builder HESTIA_SOURCE_DIR="$SOURCE" HESTIA_INSTALL_ROOT="$RUNTIME" HESTIA_ENV_FILE="$ENV_FILE" HESTIA_UNIT_FILE="$UNIT_FILE" HESTIA_SYSTEMCTL_BIN=systemctl bash "$ROOT_DIR/scripts/install.sh" >/dev/null 2>&1; then fail "configuração legada foi aceita"; fi
[ "$(sha256sum "$ENV_FILE")" = "$before" ] || fail "env legado foi sobrescrito"

mkdir -p "$RUNTIME"; printf 'unit\n' > "$UNIT_FILE"
PATH="$BIN:/usr/bin:/bin" HESTIA_INSTALL_ROOT="$RUNTIME" HESTIA_ENV_FILE="$ENV_FILE" HESTIA_UNIT_FILE="$UNIT_FILE" HESTIA_SYSTEMCTL_BIN=systemctl bash "$ROOT_DIR/scripts/uninstall.sh" >/dev/null
[ -f "$ENV_FILE" ] || fail "uninstall padrão removeu env"
[ ! -e "$RUNTIME" ] || fail "uninstall não removeu runtime"
PATH="$BIN:/usr/bin:/bin" HESTIA_INSTALL_ROOT="$RUNTIME" HESTIA_ENV_FILE="$ENV_FILE" HESTIA_UNIT_FILE="$UNIT_FILE" HESTIA_SYSTEMCTL_BIN=systemctl bash "$ROOT_DIR/scripts/uninstall.sh" --purge >/dev/null
[ ! -e "$ENV_FILE" ] || fail "purge preservou env"

echo "Console installer tests: OK"
