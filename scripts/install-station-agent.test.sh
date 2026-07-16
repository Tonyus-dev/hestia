#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
FAKE_BIN="$TEST_ROOT/bin"
TOKEN="installer-test-secret-token"
mkdir -p "$FAKE_BIN"
trap 'rm -rf "$TEST_ROOT"' EXIT
fail() { echo "[station-install-test] ERRO: $*" >&2; exit 1; }

cat > "$FAKE_BIN/id" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in -u) [ "$#" -eq 1 ] && echo 0 || echo 1000;; -gn) echo station-test;; *) exit 0;; esac
EOF
cat > "$FAKE_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-e" ]; then printf '%s' '$TOKEN'; fi
EOF
cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/runuser" <<'EOF'
#!/usr/bin/env bash
shift 2
[ "${1:-}" = "--" ] && shift
exec "$@"
EOF
cat > "$FAKE_BIN/getent" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "passwd" ] && echo "station-test:x:1000:1000::/tmp:/bin/false"
EOF
cat > "$FAKE_BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/systemctl-inactive" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "is-active" ] && exit 1
exit 0
EOF
cat > "$FAKE_BIN/chown" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/install" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-d" ]; then mkdir -p "${!#}"; else /usr/bin/install -m 0600 /dev/null "${!#}"; fi
EOF
chmod +x "$FAKE_BIN"/*

run_install() {
  local name="$1"; shift
  env -u HESTIA_STATION_PORT PATH="$FAKE_BIN:/usr/bin:/bin" \
    HESTIA_STATION_SERVICE_USER=station-test \
    HESTIA_STATION_ENV_FILE="$TEST_ROOT/$name.env" \
    HESTIA_STATION_UNIT_FILE="$TEST_ROOT/$name.service" \
    HESTIA_STATION_INSTALL_ROOT="$TEST_ROOT/$name-runtime" \
    HESTIA_SYSTEMCTL_BIN=systemctl "$@" bash "$ROOT_DIR/scripts/install-station-agent.sh"
}

output="$(run_install desktop env 2>&1)"
grep -Fqx 'HESTIA_STATION_PORT=4518' "$TEST_ROOT/desktop.env" || fail "porta padrão incorreta"
grep -Fqx 'HESTIA_STATION_ORGANIZER_ENABLED=0' "$TEST_ROOT/desktop.env" || fail "Organizer não foi desativado"
grep -Fqx 'HESTIA_STATION_CODICE_ENABLED=0' "$TEST_ROOT/desktop.env" || fail "Códice não foi desativado"
grep -Fq "WorkingDirectory=$TEST_ROOT/desktop-runtime" "$TEST_ROOT/desktop.service" || fail "unit depende do checkout"
[ -f "$TEST_ROOT/desktop-runtime/station.js" ] || fail "runtime não foi instalado"
[ ! -e "$TEST_ROOT/desktop-runtime/src" ] || fail "frontend foi copiado"
[ ! -e "$TEST_ROOT/desktop-runtime/dist" ] || fail "dist foi copiado"
[[ "$output" != *"$TOKEN"* ]] || fail "token vazou"

run_install tvbox env HESTIA_STATION_PORT=4519 >/dev/null 2>&1
grep -Fqx 'HESTIA_STATION_PORT=4519' "$TEST_ROOT/tvbox.env" || fail "porta TV Box incorreta"

for invalid in 0 -1 1.5 texto 65536 " 4519" "4519 "; do
  if run_install invalid env HESTIA_STATION_PORT="$invalid" >/dev/null 2>&1; then fail "porta inválida aceita: $invalid"; fi
done

existing="$TEST_ROOT/existing.env"
printf '%s\n' 'HESTIA_STATION_HOST=127.0.0.1' 'HESTIA_STATION_PORT=4518' 'HESTIA_STATION_TOKEN=existing-secret' 'HESTIA_STATION_ORGANIZER_ENABLED=0' > "$existing"
before="$(sha256sum "$existing")"
run_install existing env >/dev/null 2>&1
[ "$(sha256sum "$existing")" = "$before" ] || fail "env/token existente foi alterado"
if run_install existing env HESTIA_STATION_PORT=4519 >/dev/null 2>&1; then fail "conflito de porta aceito"; fi

mkdir -p "$TEST_ROOT/uninstall-runtime"
printf 'secret\n' > "$TEST_ROOT/uninstall.env"
printf 'unit\n' > "$TEST_ROOT/uninstall.service"

HESTIA_STATION_ENV_FILE="$TEST_ROOT/uninstall.env" \
HESTIA_STATION_UNIT_FILE="$TEST_ROOT/uninstall.service" \
HESTIA_STATION_INSTALL_ROOT="$TEST_ROOT/uninstall-runtime" \
HESTIA_SYSTEMCTL_BIN="$FAKE_BIN/systemctl-inactive" PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/scripts/uninstall-station-agent.sh" >/dev/null
[ -f "$TEST_ROOT/uninstall.env" ] || fail "uninstall padrão removeu env"
[ ! -e "$TEST_ROOT/uninstall-runtime" ] || fail "uninstall não removeu runtime"
HESTIA_STATION_ENV_FILE="$TEST_ROOT/uninstall.env" \
HESTIA_STATION_UNIT_FILE="$TEST_ROOT/uninstall.service" \
HESTIA_STATION_INSTALL_ROOT="$TEST_ROOT/uninstall-runtime" \
HESTIA_SYSTEMCTL_BIN="$FAKE_BIN/systemctl-inactive" PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/scripts/uninstall-station-agent.sh" --purge >/dev/null
[ ! -e "$TEST_ROOT/uninstall.env" ] || fail "purge preservou env"

echo "Station installer tests: OK"
