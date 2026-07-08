#!/usr/bin/env bash
set -euo pipefail
echo "Héstia — Setup Ollama/Qwen"
if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama não encontrado."
  echo "Instale o Ollama no servidor antes de baixar os modelos Qwen."
  echo "Linux:"
  echo "  curl -fsSL https://ollama.com/install.sh | sh"
  exit 1
fi
ollama --version || true
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:latest
ollama pull qwen2.5-coder || ollama pull qwen2.5-coder:latest
ollama list | grep -E "qwen2.5|qwen" || true
echo "Setup Qwen concluído."
