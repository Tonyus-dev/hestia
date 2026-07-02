# Héstia Console

Interface local da Héstia com **Chama Local** embutida.

> Héstia guarda, serve e sustenta.
> A Chama Local mede e valida.
> Presence mostra.

- **Héstia** — servidor físico/local da Estação Kaline
- **Héstia Console** — este web app (a tela)
- **Chama Local** — API local embutida (o pulso interno)

## Rodar o frontend no Lovable / dev

```
npm run dev
```

A UI abre normalmente. Sem a Chama rodando, cada card mostra
`Aguardando Chama Local` — nenhuma métrica é inventada.

## Instalação local (Linux)

Pré-requisitos: **Node.js 20+**, `systemctl` para /api/services/status,
`df` para /api/storage/status (padrão em qualquer distro).

```bash
git clone <este-repo> hestia-console
cd hestia-console
npm install
npm run hestia          # build + start em http://localhost:4517
```

Para desenvolvimento local do backend com hot reload:

```bash
npm run build
npm run dev:local       # reinicia a Chama a cada mudança em hestia.js/chama/*
```

## CLI

```
node hestia.js --help
node hestia.js --port 4600
```

Precedência: **CLI > env > `~/.chama/config.json` > padrões**. A v0 é local-first em `127.0.0.1:4517`; LAN só depois com Tailscale/autenticação.

## Endpoints

Todos são `GET` e somente leitura.

```
GET /api/health
GET /api/server/status
GET /api/storage/status
GET /api/services/status
GET /api/logs?tail=100      # 1..200
GET /api/config
```

Verificação rápida:

```bash
curl -s http://localhost:4517/api/health | jq
```

## Configuração

### Via env

```
HESTIA_HOST=127.0.0.1
HESTIA_PORT=4517
HESTIA_STORAGE_PATH=/KALINE
```

### Via `~/.chama/config.json` (opcional, whitelist)

```json
{
  "host": "127.0.0.1",
  "port": 4517,
  "storagePaths": ["/", "/KALINE", "/mnt/backup"],
  "services": ["jellyfin", "syncthing", "smbd", "tailscaled"]
}
```

Só os campos acima são lidos. Serviços são intersectados com a lista permitida:
`jellyfin`, `syncthing`, `smbd`, `tailscaled`.

## Processo de construção

1. Build do frontend TanStack Start para `dist/`
2. Iniciar `hestia.js` (Fastify): servir API em `/api/*` e assets estáticos em `/*`
3. Chama Local mede o host via `node:os`, `df`, `systemctl` e mantém logs internos em ring buffer da própria Chama Local
4. O frontend usa a origin da própria Héstia ou `127.0.0.1:4517` no Vite local
5. Fora do ambiente local, o app mostra `Aguardando Chama Local` sem disparar requisições

## Comandos npm

| Comando | O que faz | Onde usar |
|---|---|---|
| `npm install` | Instala dependências | Uma vez no checkout |
| `npm run dev` | Frontend Lovable com HMR | Preview / desenvolvimento de UI |
| `npm run build` | Build de produção para `dist/` | Antes de iniciar a Chama |
| `npm run hestia` | Build + inicia Chama Local em `http://localhost:4517` | Linux local |
| `npm run dev:local` | Backend com hot reload | Desenvolvimento de `hestia.js/chama/*` |
| `npm test` | Roda a suite do Vitest uma vez | CI / verificação local |
| `npm run test:watch` | Roda os testes em modo interativo | Durante refatorações |

Verificações rápidas:

```bash
node hestia.js --help
node hestia.js --port 4600
npm run build
npm run hestia
npm test
```

## Rodar os testes (Vitest)

A suite usa [Vitest](https://vitest.dev/) com ambiente `jsdom` para testar o parser do cliente (`src/lib/hestia/api.ts`) e o helper `stableStringify`.

```bash
npm test              # roda uma vez e sai
npm run test:watch    # modo interativo, re-runs ao salvar arquivos
```

Opções úteis:

```bash
npm test -- --reporter=verbose   # mostra nome de cada teste
npm test -- src/lib/hestia/api.test.ts
npm run test:watch -- --coverage  # requer @vitest/coverage-v8 instalado
```

Atualmente cobrimos: parsing de erros HTTP estruturados, fallback para 500 sem corpo JSON, timeout, falha de rede, proteção contra fetch fora de localhost, helpers de formatação e `stableStringify` ordenado.

## Critérios de aceite

- [x] Frontend renderiza sem 500 ao abrir no preview Lovable
- [x] `/api/health`, `/api/server/status`, `/api/storage/status`, `/api/services/status` respondem em local
- [x] `/api/logs?tail=N` respeita `1 ≤ N ≤ 200`
- [x] CLI aceita `--port`, `--host` e `--help`
- [x] `~/.chama/config.json` opcional whitelista serviços e paths
- [x] Página `/endpoints` gera `curl` com URL local correta
- [x] Página `/logs` permite escolher tail 50 / 100 / 200
- [x] Build de produção passa sem erros

Pendências fora do sandbox: testar em Linux real, smoke tests com Vitest, empacotamento como binário único.

## Segurança

A v0 é somente leitura.

- Sem upload
- Sem delete
- Sem shell
- Sem reiniciar serviço
- Sem comando arbitrário

`execFile` com argumentos fixos é a única forma de I/O de processo. Nomes
de serviço e paths de disco vêm de listas fixas no código (ou da whitelist
`~/.chama/config.json`), nunca da URL.
