# Auditoria — Pocket e Baby Stations

## Base

- Branch: work (remote origin ausente; branch local criada `feat/pocket-baby-stations`).
- SHA inicial: 75bfa9e18f51f9cd4029bc9fe17135dd70c9ac58.
- Estado da árvore: limpa antes da implementação.
- Estado do PromptForge: presente no main local em `chama/llm.js` e docs; fora do escopo.
- Versão mínima do Node: `>=22.13.0` em `package.json`.

## Registro atual

- Definição de `STATION_IDS`: `desktop`, `tvbox` em `chama/stationClient.js`.
- Mapeamento de variáveis: `HESTIA_DESKTOP_*` e `HESTIA_TVBOX_*` em `chama/stationClient.js`.
- Cliente Station: fetch server-side com Bearer, timeout, redirect manual, request id, limite e contratos em `chama/stationClient.js`.
- Rotas genéricas: registradas a partir de `STATION_IDS` em `chama/stationRoutes.js`.
- Rotas especiais: Códice apenas TV Box; Organizer apenas desktop em `chama/stationRoutes.js`.
- Tipos frontend: `StationId = "desktop" | "tvbox"` em `src/lib/hestia/api.ts`.
- Cards atuais: dois cards fixos em `src/routes/_station.index.tsx`.
- Configuração pública: flags desktop/tvbox em `publicStationConfig()`.
- Env example: variáveis documentadas em README/deploy, sem env example dedicado.
- Doctor: genérico para Agent em `chama/stationDoctor.js`.
- Smoke: dois Agents efêmeros em `scripts/station-smoke.mjs`.
- Testes: cobrem cliente, Agent, rotas e installer.

## Contrato atual

- Health: `GET /api/station/health`.
- Storage: `GET /api/station/storage/status` para `/KALINE` agregado.
- Services: `GET /api/station/services/status` via allowlist.
- Autenticação: Bearer token com comparação timing-safe.
- Host Guard: valida Host antes da autenticação.
- Timeout: AbortController no cliente.
- Limite de resposta: JSON limitado no cliente.
- Tratamento de offline: estados sanitizados `not_configured`, `misconfigured`, `unavailable`, `unauthorized`, `incompatible`.

## Lacunas

- Pocket ausente: não há ID/config/rota/UI.
- Baby ausente: não há ID/config/rota/UI.
- Métricas de sistema ausentes: Agent remoto não expõe CPU/RAM/swap/hostname/uptime/root disk.
- Serviços novos ausentes da allowlist: `hermes`, `telegram-guard` ausentes.
- UI fixa em duas Stations: cards hardcoded.
- Configuração pública fixa em duas Stations: flags só desktop/tvbox.

## Escopo mínimo

- Arquivos necessários: cliente/rotas/Agent/hardware/services, tipos/UI, Doctor/smoke, testes e docs Station existentes.
- Arquivos que não serão tocados: PromptForge, LLM, Klio, Kódice funcional, Organizer funcional, Supabase, identidade visual.
- Riscos: validação estrita incompatível com resposta real; smoke local pode falhar por ambiente; validação física indisponível neste ambiente.
- Plano: adicionar IDs e envs; criar contrato read-only genérico; proxyar rota; renderizar quatro cards por registro seguro; ampliar allowlist; atualizar testes/smoke/docs; executar gates; marcar validação física como bloqueada se não disponível.
