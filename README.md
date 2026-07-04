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

## Rodar como serviço systemd direto do repo (recomendado pra quem acompanha atualizações)

`scripts/install.sh` builda e — se rodado como root num host com systemd de verdade — instala
um serviço systemd que aponta **direto pra este checkout do git**, sem copiar nada pra `/opt`.
Atualizar depois é só isso, sem gerar nem reinstalar pacote nenhum:

```bash
git pull
npm run install:local   # idempotente: builda de novo e reinicia o serviço
```

Primeira instalação:

```bash
git clone <este-repo> hestia-console
cd hestia-console
sudo npm run install:local
```

Sem `sudo`/sem systemd, o script só builda e sugere `npm run hestia` manual — não trava, não
tenta se auto-elevar. Requer Node.js 20+ (`engines.node` no `package.json` documenta isso; o
script verifica e falha com mensagem clara se a versão for menor).

## Instalar como app no Linux Mint Xfce

Alternativa ao `install.sh`: empacota a Héstia como `.deb` com serviço systemd (autostart em
`127.0.0.1:4517`), atalho no menu e ícone próprio — bom pra quem quer o app "de verdade"
instalado via `apt`, mas **qualquer mudança de código exige gerar e reinstalar um `.deb` novo**
(o pacote copia o código pra `/opt/hestia-console` no momento do build, não acompanha `git
pull`). Quem for atualizar com frequência, prefira a seção acima.

Gerar pacote:

```bash
npm run build-deb
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

Quase todos são `GET` e somente leitura. A única exceção é
`POST /api/local/organizer/apply` (ver seção Organizer abaixo), que move/copia arquivos dentro
de um plano gerado pela própria Héstia, só com confirmação explícita.

### Chama Local (base)

```
GET /api/health
GET /api/server/status
GET /api/storage/status
GET /api/storage/discover  # descobre volumes montados de verdade (ver abaixo)
GET /api/storage/model     # árvore canônica de /KALINE (ver abaixo)
GET /api/storage/sources   # fontes externas do HD configuradas (ver abaixo)
GET /api/storage/scan      # varredura read-only de /KALINE e das fontes (ver abaixo)
GET /api/storage/organizer/plan  # gera um plano dry-run (ver seção Organizer abaixo)
GET /api/services/status
GET /api/services/bindings  # vínculos read-only com serviços existentes (ver abaixo)
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

#### Modelo `/KALINE` e varredura

A Héstia entende `/KALINE` como uma árvore canônica fixa (`entrada`, `codice/{pdf,epub,fichamentos}`,
`midia/{videos,audio,imagens}`, `arquivos/{compactados}`, `backups`, `modelos`, `logs`,
`snapshots`) — dado estático em `chama/storageModel.js`, sem relação com o `dataDir` interno da
própria Chama Local (identidade/eventos/snapshots internos continuam em `~/.chama/data` ou
`STATE_DIRECTORY`, nunca dentro de `/KALINE`).

`GET /api/storage/scan` varre `/KALINE` e as fontes externas configuradas (abaixo) e devolve só um
**resumo** por pasta — contagem de arquivos, bytes totais, extensões — nunca uma lista de nomes de
arquivo, nem localmente nem na Presence. A varredura tem limites conservadores
(`maxDepth: 4`, `maxFiles: 5000` por pasta) e nunca segue symlink recursivamente; se um limite for
atingido, a pasta volta com `truncated: true` e `reason` (`"maxDepth"` ou `"maxFiles"`).

Fontes externas do HD (opcional, via `~/.chama/config.json`, chave `storageSources` — ver seção
de Configuração abaixo) entram na mesma varredura, mas o `scan` em si é só leitura: nunca move,
copia ou apaga nada (isso só acontece via `POST /api/local/organizer/apply`, abaixo).

```bash
curl -s http://localhost:4517/api/storage/model | jq
curl -s http://localhost:4517/api/storage/sources | jq
curl -s http://localhost:4517/api/storage/scan | jq
```

### Organizer (plano dry-run + aplicação local aprovada)

A única capacidade de escrita da Héstia: organizar o que está em `/KALINE/entrada` (alimentada
pelo Syncthing recebendo arquivos de outros aparelhos) e nas fontes externas configuradas,
movendo/copiando para a pasta canônica certa por extensão.

```
GET  /api/storage/organizer/plan          # gera e persiste um novo plano dry-run
POST /api/local/organizer/apply           # aplica um plano já gerado (exige confirmação)
GET  /api/local/organizer/runs            # lista execuções anteriores
GET  /api/local/organizer/runs/:runId     # manifesto de uma execução
POST /api/local/organizer/runs/:runId/undo  # desfaz uma execução aplicada (exige confirmação)
```

**1. Gerar o plano** (só cálculo, nenhuma escrita — pode chamar quantas vezes quiser):

```bash
curl -s http://localhost:4517/api/storage/organizer/plan | jq
```

Cada item do plano tem `sourcePath`/`targetPath`/`action` (`"move"` para `entrada`, `"copy"` para
fontes externas — o arquivo original de uma fonte externa nunca é apagado) e `status`
(`"planned"` ou `"conflict"` se já existir algo com o mesmo nome no destino — nesse caso a
Héstia nunca sobrescreve, só marca conflito e pula).

**2. Aplicar o plano** — exige três coisas: `Content-Type: application/json`, o header
`X-Hestia-Local-Confirm: organize`, e o `planId` de um plano já gerado no passo 1:

```bash
curl -s -X POST http://localhost:4517/api/local/organizer/apply \
  -H "Content-Type: application/json" \
  -H "X-Hestia-Local-Confirm: organize" \
  -d '{"planId": "plan_...", "mode": "apply"}' | jq
```

Sem o header, a requisição nunca chega no handler — um hook global em `hestia.js` já barra com
`403` antes de qualquer outra coisa. O corpo só aceita `planId`/`mode`; nunca um path, lista de
arquivos ou `targetPath` vindo do cliente — o plano aplicado é sempre exatamente o que a própria
Héstia gerou e persistiu no passo 1.

Ao mover entre filesystems diferentes (ex.: de um HD externo para `/KALINE`, se forem
partições/discos distintos), `rename` falha com `EXDEV`; a Héstia detecta isso e faz
copy→verifica tamanho→apaga a origem, em vez de deixar o erro estourar.

Cada execução grava um manifesto em `<dataDir>/organizer/runs/<runId>.json` e emite um evento
JSONL (`organizer.plan.applied` / `.partially_applied` / `.failed`) — consulte via
`GET /api/local/organizer/runs/:runId` ou `GET /api/presence/events/recent`.

**3. Desfazer uma execução** — mesmo header de confirmação, sem corpo:

```bash
curl -s -X POST http://localhost:4517/api/local/organizer/runs/org_.../undo \
  -H "X-Hestia-Local-Confirm: organize" | jq
```

Só reverte operações que realmente aconteceram (`status:"ok"`). `move` volta o arquivo pro lugar
original; `copy` só apaga a cópia, nunca a origem externa. Recusa (`skipped`, nunca sobrescreve)
se o destino já sumiu ou se a origem já foi recriada por outra coisa desde o apply — não há
checksum gravado, só checagem de existência. Não é repetível (`409` se a execução já foi
desfeita) e não tem "refazer" (redo). `GET /api/local/organizer/runs` devolve, por execução,
`undoOf`/`undoneBy` para a UI saber quando esconder o botão de desfazer.

**Retenção**: planos (7 dias), execuções (90 dias) e eventos (30 dias) são expurgados
automaticamente por idade, uma vez por dia (`chama/retention.js`) — dry-run não aplicado depois
de uma semana é considerado obsoleto; execuções ficam mais tempo por valor de auditoria. Uma vez
aplicada, uma execução não depende mais do plano original (o manifesto já tem tudo que o undo
precisa), então expurgar planos velhos nunca quebra undo de execuções já aplicadas.

**UI**: a página `/storage` reúne o modelo `/KALINE`, os vínculos de serviço, o resumo do scan, e
os botões "Gerar plano"/"Aplicar plano localmente"/"Desfazer" — sempre com aprovação explícita,
nunca automático. Sem botão de start/stop/reiniciar serviço, upload, download ou shell.

Fora desta fatia: refazer o undo (redo), rotação configurável via env var.

### Service bindings

A Héstia reconhece os serviços já existentes no servidor:

- Samba;
- Jellyfin;
- Syncthing;
- Tailscale.

Ela não instala, configura, inicia, para ou reinicia nenhum deles — só descreve o vínculo lógico
com o `/KALINE` (ex.: Samba dá acesso de rede ao `/KALINE`, Jellyfin lê `/KALINE/midia`).

```bash
curl -s http://localhost:4517/api/services/bindings | jq
```

`/api/presence/summary` e `/api/presence/manifest` também incluem uma visão sanitizada desses
vínculos (só `id`/`label`/`role`, sem `relatedStorage`).

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
GET /api/presence/capabilities   # capacidades da Chama (writing.modifyStorage:true; resto false)
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
  "services": ["jellyfin", "syncthing", "smbd", "tailscaled"],
  "storageSources": [
    {
      "id": "filmes-hd",
      "label": "Filmes do HD",
      "path": "/mnt/hd/Filmes",
      "category": "midia/videos",
      "mode": "external-readonly"
    }
  ]
}
```

Só os campos acima são lidos. Serviços são intersectados com a lista permitida:
`jellyfin`, `syncthing`, `smbd`, `tailscaled`. Cada item de `storageSources` só é aceito se tiver
os cinco campos (`id`/`label`/`path`/`category`/`mode`) como string — qualquer outro campo ou
item incompleto é ignorado. `path` nunca vem de query/body/header, só deste arquivo.

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

A Héstia é majoritariamente somente leitura. A única exceção, deliberada e documentada, é o
organizer (`POST /api/local/organizer/apply`): move/copia arquivo dentro de um plano gerado
pela própria Héstia, nunca sobrescreve, nunca apaga um arquivo do usuário sem antes confirmar
que ele já existe com sucesso no destino, e só roda com o header de confirmação explícita
`X-Hestia-Local-Confirm: organize`. Isso está refletido de propósito em
`chama/capabilities.js` (`writing.modifyStorage: true`, `mode: "local-write-with-approval"`) —
nunca escondido atrás de um `readonly: true` que não seria mais verdade.

Fora isso, continua valendo:

- Sem upload
- Sem shell
- Sem reiniciar serviço
- Sem comando arbitrário
- Sem endpoint de undo (nesta fatia)

`execFile` com argumentos fixos é a única forma de I/O de processo (fora do organizer). Nomes
de serviço e paths de disco vêm de listas fixas no código (ou da whitelist
`~/.chama/config.json`), nunca da URL. O organizer só enumera arquivos reais internamente
(nunca expõe a lista bruta em nenhum endpoint) e só aplica planos que a própria Héstia gerou e
persistiu — o cliente nunca envia um path, nem uma lista de arquivos, só o `planId`.

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
- **Confirmação de escrita local** — todo `POST /api/local/*` exige o header
  `X-Hestia-Local-Confirm: organize`; sem ele, `403` antes de qualquer outra coisa.
- **Headers de resposta** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` e `Content-Security-Policy` em
  toda resposta (evita clickjacking e reduz a superfície de XSS).
