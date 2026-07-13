#!/usr/bin/env bash
set -euo pipefail
ROOT="${HESTIA_HERMES_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/hestia-console/hermes}"
for dir in inbox outbox archive errors; do
  mkdir -p "$ROOT/$dir"
  echo "$ROOT/$dir"
done
TMP="$ROOT/outbox/.hermes-write-test.$$.$RANDOM.tmp"
printf 'ok\n' > "$TMP"
rm -f "$TMP"
echo "Hermes pronto em $ROOT"
