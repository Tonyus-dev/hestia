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
case "${1:-}" in
  -u) [ "$#" -eq 1 ] && echo 0 || echo 1000 ;;
  -gn) echo station-test ;;
  *) exit 0 ;;
esac
EOF
cat > "$FAKE_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-e" ]; then printf '%s' '$TOKEN'; fi
EOF
cat > "$FAKE_BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/chown" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/install" <<'EOF'
#!/usr/bin/env bash
target="${!#}"
/usr/bin/install -m 0600 /dev/null "$target"
EOF
chmod +x "$FAKE_BIN"/*

run_install() {
  local env_file="$1"
  local unit_file="$2"
  shift 2
  env -u HESTIA_STATION_PORT \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    HESTIA_STATION_SERVICE_USER=station-test \
    HESTIA_STATION_ENV_FILE="$env_file" \
    HESTIA_STATION_UNIT_FILE="$unit_file" \
    "$@" bash "$ROOT_DIR/scripts/install-station-agent.sh"
}

default_env="$TEST_ROOT/default.env"
default_unit="$TEST_ROOT/default.service"
output="$(run_install "$default_env" "$default_unit" env 2>&1)"
grep -Fqx "HESTIA_STATION_PORT=4518" "$default_env" || fail "porta padrão não é 4518"
grep -Fqx "HESTIA_STATION_ORGANIZER_ENABLED=0" "$default_env" ||
  fail "env novo não desativa Organizer"
grep -Fqx "HESTIA_STATION_CODICE_ENABLED=0" "$default_env" ||
  fail "env novo não desativa Códice"
grep -Fqx "# HESTIA_CODICE_CORS_ORIGIN=https://codice.example" "$default_env" ||
  fail "env novo não documenta origem do Códice"
grep -Fqx "# HESTIA_STATION_ALLOWED_HOSTS=kaline-box.example.ts.net" "$default_env" ||
  fail "env novo não documenta Host privado"
[[ "$output" != *"$TOKEN"* ]] || fail "token apareceu na saída"

custom_env="$TEST_ROOT/custom.env"
custom_unit="$TEST_ROOT/custom.service"
output="$(run_install "$custom_env" "$custom_unit" env HESTIA_STATION_PORT=4519 2>&1)"
grep -Fqx "HESTIA_STATION_PORT=4519" "$custom_env" || fail "porta 4519 não foi gravada"
[[ "$output" != *"$TOKEN"* ]] || fail "token apareceu na saída"

for invalid in 0 -1 1.5 texto "4519 " " 4519" 4519x 65536 ""; do
  invalid_env="$TEST_ROOT/invalid-${RANDOM}.env"
  if output="$(run_install "$invalid_env" "$TEST_ROOT/invalid.service" env HESTIA_STATION_PORT="$invalid" 2>&1)"; then
    fail "porta inválida foi aceita: '$invalid'"
  fi
  [[ "$output" == *"HESTIA_STATION_PORT deve ser um inteiro entre 1 e 65535."* ]] ||
    fail "erro inesperado para porta inválida"
  [[ "$output" != *"$TOKEN"* ]] || fail "token apareceu no erro"
done

existing_env="$TEST_ROOT/existing.env"
existing_unit="$TEST_ROOT/existing.service"
printf '%s\n' \
  "HESTIA_STATION_HOST=127.0.0.1" \
  "HESTIA_STATION_PORT=4518" \
  "HESTIA_STATION_TOKEN=existing-secret" \
  "HESTIA_STATION_ORGANIZER_ENABLED=0" > "$existing_env"
before="$(sha256sum "$existing_env")"
output="$(run_install "$existing_env" "$existing_unit" env 2>&1)"
[ "$(sha256sum "$existing_env")" = "$before" ] || fail "env existente foi alterado"
[[ "$output" == *"configuração existente preservada"* ]] || fail "preservação não informada"
[[ "$output" != *"existing-secret"* ]] || fail "token existente apareceu na saída"

output="$(run_install "$existing_env" "$existing_unit" env HESTIA_STATION_PORT=4518 2>&1)"
[ "$(sha256sum "$existing_env")" = "$before" ] || fail "env foi alterado com porta igual"
[[ "$output" != *"existing-secret"* ]] || fail "token existente apareceu na saída"

if output="$(run_install "$existing_env" "$existing_unit" env HESTIA_STATION_PORT=4519 2>&1)"; then
  fail "conflito explícito de porta foi aceito"
fi
[[ "$output" == *"Configuração existente usa a porta 4518."* ]] ||
  fail "conflito de porta não foi explicado"
[ "$(sha256sum "$existing_env")" = "$before" ] || fail "conflito alterou o env existente"
[[ "$output" != *"existing-secret"* ]] || fail "token existente apareceu no conflito"

echo "Station installer tests: OK"
