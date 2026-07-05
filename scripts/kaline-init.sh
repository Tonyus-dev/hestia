#!/usr/bin/env bash
set -euo pipefail
KALINE_ROOT="${KALINE_ROOT:-/KALINE}"
for dir in \
  "$KALINE_ROOT/entrada/uploads" \
  "$KALINE_ROOT/entrada/dispositivos" \
  "$KALINE_ROOT/entrada/manual" \
  "$KALINE_ROOT/entrada/revisar" \
  "$KALINE_ROOT/ash/planos" \
  "$KALINE_ROOT/ash/runs" \
  "$KALINE_ROOT/ash/quarentena" \
  "$KALINE_ROOT/ash/ignorados" \
  "$KALINE_ROOT/codice" \
  "$KALINE_ROOT/midia" \
  "$KALINE_ROOT/design" \
  "$KALINE_ROOT/documentos" \
  "$KALINE_ROOT/codigo"; do
  mkdir -p "$dir"
done
echo "Estrutura inicial garantida em $KALINE_ROOT"
