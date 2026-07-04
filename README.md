# Héstia Console

Interface local da Héstia com **Chama Local** embutida.

> Héstia organiza, registra e sustenta.
> Chama Local mede e serve.
> Presence mostra e consulta.

- **Héstia** — app local do servidor
- **Héstia Console** — a tela dentro da Héstia (este web app)
- **Chama Local** — módulo/API somente leitura embutido (o pulso interno)

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

## Instalar como app no Linux Mint Xfce

Empacota a Héstia como `.deb` com serviço systemd (autostart em
`127.0.0.1:4517`), atalho no menu e ícone próprio.

Gerar pacote:

```bash
chmod +x scripts/build-deb.sh
./scripts/build-deb.sh
```

Instalar:

```bash
sudo apt install ./dist-deb/hestia-console_0.1.0_amd64.deb
```

Abrir pelo menu:

```
Menu → Héstia Console
```

Ou pelo terminal:

```bash
hestia-console
```

Ver serviço:

```bash
systemctl status hestia-console
```

Logs do serviço:

```bash
journalctl -u hestia-console -f
```

Remover:

```bash
sudo apt remove hestia-console
```

Requer Node.js 20+ instalado no sistema (o pacote depende de `nodejs` e
`xdg-utils`, mas não fixa versão mínima via apt para não conflitar com o
pacote `nodejs` de cada distro/PPA — o `postinst` avisa se a versão
detectada for antiga).

## CLI

```
node hestia.js --help
node hestia.js --port 4600
```

Precedência: **CLI > env > `~/.chama/config.json` > padrões**. A v0 é local-first em `127.0.0.1:4517`; LAN só depois com Tailscale/autenticação.

## Endpoints

Todos são `GET` e somente leitura.

### Chama Local (base)

```
GET /api/health
GET /api/server/status
GET /api/storage/status
GET /api/storage/discover  # descobre volumes montados de verdade (ver abaixo)
GET /api/services/status
GET /api/logs?tail=100      # 1..200
GET /api/config
```

Verificação rápida:

```bash
curl -s http://localhost:4517/api/health | jq
```

#### `GET /api/storage/discover`

Lista os volumes realmente montados no host (via `df -PTk`), filtrando pseudo-filesystems
(`tmpfs`, `overlay`, `squashfs`, etc.) e ruído (`/snap`, `/var/lib/docker`, `/boot`). Cada item
tem `device`, `fstype`, `mountpoint`, `totalBytes`/`usedBytes`/`freeBytes`/`percentUsed`, e um
campo `kind` (`"ssd"` | `"hdd"` | `"unknown"`) — heurística best-effort lendo
`/sys/block/<disco>/queue/rotational`; se o kernel não expõe isso (comum em VMs, containers,
LVM/`device-mapper`), fica `"unknown"` — nunca inventa.

Use isto para descobrir os mountpoints certos do seu SSD/HD e depois configurá-los
explicitamente em `storagePaths` (veja `~/.chama/config.json` abaixo) — a descoberta é só
leitura, não altera a configuração sozinha.

```bash
curl -s http://localhost:4517/api/storage/discover | jq
```

### Presence (leitura same-origin/local)

Endpoints para integração com a Presence (atlas público em outra origem,
chamando Héstia opcionalmente). Cada resposta carrega `schemaVersion` e
`generatedAt`.

⚠️ **Importante**: Estes endpoints estão disponíveis **apenas para consulta
same-origin ou local** — sem CORS, sem `Private-Network-Access`, sem suporte
a leitura de uma Presence pública em outra origem (fica para quando isso
"doer").

```
GET /api/presence/manifest       # componentes e tagline da estação
GET /api/presence/summary        # identidade + contadores de services/storage
GET /api/presence/health         # saúde geral (mesmo que /api/health)
GET /api/presence/events/recent?limit=100  # eventos recentes (1..200, default 100)
GET /api/presence/snapshots/latest         # último snapshot com staleness
GET /api/presence/services       # status de serviços (mesmo que /api/services/status)
GET /api/presence/storage        # status de disco (mesmo que /api/storage/status)
GET /api/presence/backups        # plano de backup (stub: "planned" até implementação)
GET /api/presence/capabilities   # capacidades read-only da Chama
```

Exemplo:

```bash
curl -s http://localhost:4517/api/presence/summary | jq
```

## Configuração

### Via env

```
HESTIA_HOST=127.0.0.1
HESTIA_PORT=4517
HESTIA_STORAGE_PATH=/KALINE
HESTIA_DATA_DIR=/var/lib/hestia-console   # persistência: identidade, eventos, snapshots
HESTIA_ALLOW_LAN=1                         # obrigatório se HESTIA_HOST não for loopback
```

`HESTIA_DATA_DIR` especifica onde gravar `identity.json`, logs de eventos (JSONL), e snapshots.
Precedência: `HESTIA_DATA_DIR` > `STATE_DIRECTORY` (systemd) > `~/.chama/data` (padrão local).
Se o diretório não for gravável, rotas de `/api/presence/*` que dependem de disco retornam
`{status: "unavailable"}`; saúde/storage/services continuam funcionando normalmente.

Por padrão a Chama Local recusa iniciar (`process.exit(1)`) se `HESTIA_HOST`
não for loopback (`127.0.0.1`/`localhost`/`::1`) — a API não tem autenticação,
então expor em LAN sem querer vazaria hostname, paths de disco, serviços
ativos e logs para qualquer host da rede. Só inicia fora do loopback com
`HESTIA_ALLOW_LAN=1` explícito (e mesmo assim, sem autenticação própria —
proteja com Tailscale/firewall na frente).

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

Camadas adicionais em `hestia.js`/`chama/security.js`:

- **Bind guard** — recusa iniciar fora de loopback sem `HESTIA_ALLOW_LAN=1`
  (veja "Via env" acima).
- **Validação de `Host`** — todo request só é aceito se o header `Host`
  corresponder exatamente a `host:port` configurado (e aos aliases de
  loopback, quando aplicável). Mitiga DNS rebinding contra a API local
  (uma página maliciosa não consegue ler `/api/*` mesmo se rebindar o DNS
  dela para `127.0.0.1`).
- **Rate limit** — `/api/*` aceita no máximo 60 requisições a cada 10s por
  IP; excedentes recebem `429`.
- **Headers de resposta** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` e `Content-Security-Policy` em
  toda resposta (evita clickjacking e reduz a superfície de XSS).
