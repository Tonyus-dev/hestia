# PR H2 — Hermes Inbox/Outbox via Syncthing

## Objetivo

Adicionar à Héstia uma caixa persistente de comandos por arquivos, sincronizável via Syncthing.

## Princípio

- Kaline cria comandos.
- Syncthing sincroniza arquivos.
- Héstia valida e processa.
- Outbox devolve resultado.

## Endpoints

- `GET /api/hermes/status`
- `POST /api/hermes/process-once`

## Tipos permitidos

- `station.status`
- `llm.chat`

## Segurança

- Sem watcher infinito.
- Sem execução shell.
- Sem comandos arbitrários.
- Sem path traversal.
- Sem processar fora da Hermes root.
- Confirmação local obrigatória para `process-once`.

## Fora de escopo

- Códice.
- RAG.
- Parser EPUB/PDF.
- Organização real de arquivos.
- Worker.
- Supabase.
- Presence.
