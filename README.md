# Héstia Station

Héstia é a **Station**: a estação local da Kaline no servidor físico onde ela vive. O Console é a interface visual da Station; a Chama Local é o agente interno; Presence é a superfície externa que consulta.

> Héstia é a Estação. A Chama é o pulso. O Console é a face. Presence consulta. Kaline decide.

## Ontologia atual

- **Héstia** — a Station.
- **Héstia Station** — estação local da Kaline.
- **Console** — interface visual da Station (este frontend).
- **Chama Local** — agente interno que mede, registra e executa apenas ações locais protegidas.
- **Presence** — superfície que consulta a Station, quando habilitada.
- **Servidor físico** — corpo onde Héstia vive.

## Modo protegido

Modo protegido: leitura por padrão; escrita local apenas por planos aprovados explicitamente; sem comandos destrutivos.

A Héstia não deve ser descrita como absolutamente somente leitura: o organizer pode aplicar, desfazer e refazer planos locais, mas só com confirmação explícita e sem aceitar paths arbitrários do cliente.

## Rotas públicas do Console

| Rota         | Função                        |
| ------------ | ----------------------------- |
| `/`          | cockpit da Héstia             |
| `/sistema`   | hardware real                 |
| `/storage`   | volumes, fontes e `/KALINE`   |
| `/organizar` | planos e ações locais         |
| `/servicos`  | systemd e vínculos            |
| `/historico` | eventos, runs e logs legíveis |
| `/config`    | modo protegido                |
| `/endpoints` | contratos da API              |

`/logs` continua existindo como rota técnica/legada, mas `/historico` é a rota pública preferida para leitura humana.

## Endpoints documentados

### Leitura / diagnóstico

```http
GET /api/health
GET /api/server/status
GET /api/hardware/status
GET /api/hardware/config
GET /api/storage/status
GET /api/storage/model
GET /api/storage/sources
GET /api/storage/scan
GET /api/services/status
GET /api/services/bindings
GET /api/logs
GET /api/config
```

### Ações locais protegidas

```http
GET  /api/storage/organizer/plan
GET  /api/local/organizer/runs
POST /api/local/organizer/apply
POST /api/local/organizer/runs/:runId/undo
POST /api/local/organizer/runs/:runId/redo
```

Os `POSTs` exigem confirmação explícita via header `X-Hestia-Local-Confirm: organize`.

## Rodar o frontend no Lovable / dev

```
npm run dev
```

A UI abre normalmente. Sem a Chama rodando, cada card mostra
`Aguardando Chama Local` — nenhuma métrica é inventada.

## Instalação local limpa (Linux)

Fluxo repetível:

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
# Com package-lock.json versionado, prefira instalação reprodutível:
npm ci
# Se estiver em uma cópia sem package-lock.json, use npm install para gerá-lo:
# npm install
npm run build
HESTIA_SERVICE_USER="$USER" sudo -E npm run install:local
npm run doctor
```

Sem symlink manual, sem editar `/etc/fstab`, sem criar `dist` como root, sem Cloudflare e sem aplicar organizer automaticamente.

Scripts úteis:

```bash
npm run setup:local      # npm ci/install + build como usuário normal
sudo npm run install:service  # só instala/reinstala systemd; exige build pronto
sudo npm run install:local    # fluxo completo seguro/idempotente
npm run doctor           # diagnóstico read-only
npm run kaline:init      # cria apenas diretórios vazios de /KALINE
```

Se `/KALINE` estiver em NTFS/fuseblk, permissões vêm das opções de montagem e `chown/chmod` podem não funcionar. Para permitir organizer/write no HD montado pelo seu usuário:

```bash
HESTIA_SERVICE_USER="$USER" sudo -E npm run install:local
```

Sem `HESTIA_SERVICE_USER`, o serviço mantém o modo protegido padrão com `DynamicUser=yes`. Com `HESTIA_SERVICE_USER`, o instalador cria um override systemd com `DynamicUser=no`, `User=<usuário>`, `Group=<usuário>` e `ReadWritePaths=/KALINE`. O instalador só diagnostica NTFS; ele não edita `/etc/fstab` nem tenta corrigir mount.

Atualização:

```bash
git pull
npm ci
npm run build
sudo systemctl restart hestia-console
```

Ou, usando o instalador idempotente:

```bash
git pull
sudo npm run install:local
```

Para desenvolvimento local do backend com hot reload:

```bash
npm run build
npm run dev:local
```

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

Checklist de fechamento do pacote:

- [x] Build de produção passa sem erros.
- [x] `.deb` é gerado por `npm run build-deb` a partir do `package-lock.json` quando ele existe.
- [x] O pacote instala o serviço systemd em loopback (`127.0.0.1:4517`), launcher de menu e ícones.
- [x] O launcher só abre a URL local; não abre LAN nem inicia automação.
- [x] `npm run doctor` é diagnóstico read-only: não cria diretórios, não instala pacotes e não aplica organizer.

Pendência fora do sandbox: validar instalação real do `.deb` em Linux Mint/systemd como PID 1 antes de chamar o pacote de produção final no host da Station.

## CLI

```
node hestia.js --help
node hestia.js --port 4600
```

Precedência: **CLI > env > `~/.chama/config.json` > padrões**. A v0 é local-first em `127.0.0.1:4517`; LAN só depois com Tailscale/autenticação.

## Endpoints

O modo protegido é leitura por padrão. A escrita local existe apenas nos POSTs protegidos do organizer, com plano aprovado e confirmação explícita. A principal exceção é
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

A Héstia Station entende `/KALINE` como uma árvore canônica fixa (`entrada`, `codice/{pdf,epub,fichamentos}`,
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
de Configuração abaixo) entram na mesma varredura, mas o `scan` em si é leitura por padrão: nunca move,
copia ou apaga nada (isso só acontece via `POST /api/local/organizer/apply`, abaixo).

```bash
curl -s http://localhost:4517/api/storage/model | jq
curl -s http://localhost:4517/api/storage/sources | jq
curl -s http://localhost:4517/api/storage/scan | jq
```

### Organizer (plano dry-run + aplicação local aprovada)

A única capacidade de escrita da Héstia: Entrada recebe arquivos brutos em
`/KALINE/entrada/uploads`, `/KALINE/entrada/dispositivos` e `/KALINE/entrada/manual`; Ash gera
um plano seguro; Héstia aplica apenas planos aprovados. Fontes externas configuradas continuam
read-only: entram no plano como `copy`, nunca como perda do original.

```
GET  /api/storage/organizer/plan          # gera e persiste um novo plano dry-run
POST /api/local/organizer/apply           # aplica um plano já gerado (exige confirmação)
GET  /api/local/organizer/runs            # lista execuções anteriores
GET  /api/local/organizer/runs/:runId     # manifesto de uma execução
POST /api/local/organizer/runs/:runId/undo  # desfaz uma execução aplicada (exige confirmação)
POST /api/local/organizer/runs/:runId/redo  # refaz uma execução de undo (exige confirmação)
```

**1. Gerar o plano** (só cálculo, nenhuma escrita — pode chamar quantas vezes quiser):

```bash
curl -s http://localhost:4517/api/storage/organizer/plan | jq
```

Cada item do plano tem `sourcePath`/`targetPath`/`action` (`"move"` para `entrada`, `"copy"` para
fontes externas — o arquivo original de uma fonte externa nunca é apagado), metadados leves de
origem/data e `status` (`"planned"`, `"conflict"` ou `"ignored"`). O arquivamento final usa
`/KALINE/{classe}/{tipo}/{YYYY}/{MM}/{arquivo}` por extensão: desconhecidos vão para
`entrada/revisar`, executáveis/scripts/pacotes para `ash/quarentena`, temporários/sistema podem
ser ignorados, recém-modificados aguardam estabilidade antes de mover/copiar e arquivos já
organizados são ignorados para evitar operações inúteis.

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
desfeita). `GET /api/local/organizer/runs` devolve, por execução,
`undoOf`/`undoneBy`/`redoOf`/`redoneBy` para a UI saber quando esconder ou mostrar desfazer/refazer.

**4. Refazer um undo** — mesmo header de confirmação, sem corpo:

```bash
curl -s -X POST http://localhost:4517/api/local/organizer/runs/undo_.../redo \
  -H "X-Hestia-Local-Confirm: organize" | jq
```

Só funciona em cima de uma execução de undo e é terminal: não cria histórico encadeado de redo/undo.

**Retenção**: planos (7 dias), execuções (90 dias) e eventos (30 dias) são expurgados
automaticamente por idade, uma vez por dia (`chama/retention.js`) — dry-run não aplicado depois
de uma semana é considerado obsoleto; execuções ficam mais tempo por valor de auditoria. Uma vez
aplicada, uma execução não depende mais do plano original (o manifesto já tem tudo que o undo
precisa), então expurgar planos velhos nunca quebra undo de execuções já aplicadas.

**UI**: a página `/storage` reúne o modelo `/KALINE`, os vínculos de serviço, o resumo do scan, e
os botões "Gerar plano"/"Aplicar plano localmente"/"Desfazer"/"Refazer" — sempre com aprovação explícita,
nunca automático. Sem botão de start/stop/reiniciar serviço, upload, download ou shell.

### Service bindings

A Héstia reconhece os serviços já existentes no servidor:

- Samba;
- Jellyfin;
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

⚠️ **Importante**: Por padrão, estes endpoints estão disponíveis **apenas para consulta
same-origin ou local** — sem CORS. Uma Presence pública em outra origem só consegue ler essas
respostas se `HESTIA_PRESENCE_CORS_ORIGIN` for configurado explicitamente (ver "Via env" abaixo)
— opt-in deliberado, nunca ligado por padrão, e nunca cobre `/api/local/*` (a única rota de
escrita continua protegida do jeito de sempre).

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
HESTIA_RETENTION_PLANS_DAYS=7               # opcional — default 7
HESTIA_RETENTION_RUNS_DAYS=90               # opcional — default 90
HESTIA_RETENTION_EVENTS_DAYS=30             # opcional — default 30
HESTIA_PRESENCE_CORS_ORIGIN=https://presence.example   # opcional, "*" ou lista separada por vírgula
```

`HESTIA_DATA_DIR` especifica onde gravar `identity.json`, logs de eventos (JSONL), e snapshots.
Precedência: `HESTIA_DATA_DIR` > `STATE_DIRECTORY` (systemd) > `~/.chama/data` (padrão local).
Se o diretório não for gravável, rotas de `/api/presence/*` que dependem de disco retornam
`{status: "unavailable"}`; saúde/storage/services continuam funcionando normalmente.

`HESTIA_RETENTION_*_DAYS` sobrescreve os defaults de `chama/retention.js` (7/90/30 dias);
valor inválido ou ausente cai no default. `HESTIA_PRESENCE_CORS_ORIGIN` liga CORS (+
`Access-Control-Allow-Private-Network` no preflight) só para `/api/presence/*` — desligado por
padrão, nunca cobre `/api/local/*`.

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
  "services": ["jellyfin", "smbd", "tailscaled"],
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
`jellyfin`, `smbd`, `tailscaled`. Cada item de `storageSources` só é aceito se tiver
os cinco campos (`id`/`label`/`path`/`category`/`mode`) como string — qualquer outro campo ou
item incompleto é ignorado. `path` nunca vem de query/body/header, só deste arquivo.

## Processo de construção

1. Build do frontend TanStack Start para `dist/`
2. Iniciar `hestia.js` (Fastify): servir API em `/api/*` e assets estáticos em `/*`
3. Chama Local mede o host via `node:os`, `df`, `systemctl` e mantém logs internos em ring buffer da própria Chama Local
4. O frontend usa a origin da própria Héstia ou `127.0.0.1:4517` no Vite local
5. Fora do ambiente local, o app mostra `Aguardando Chama Local` sem disparar requisições

## Comandos npm

| Comando              | O que faz                                             | Onde usar                              |
| -------------------- | ----------------------------------------------------- | -------------------------------------- |
| `npm install`        | Instala dependências                                  | Uma vez no checkout                    |
| `npm run dev`        | Frontend Lovable com HMR                              | Preview / desenvolvimento de UI        |
| `npm run build`      | Build de produção para `dist/`                        | Antes de iniciar a Chama               |
| `npm run hestia`     | Build + inicia Chama Local em `http://localhost:4517` | Linux local                            |
| `npm run dev:local`  | Backend com hot reload                                | Desenvolvimento de `hestia.js/chama/*` |
| `npm test`           | Roda a suite do Vitest uma vez                        | CI / verificação local                 |
| `npm run test:watch` | Roda os testes em modo interativo                     | Durante refatorações                   |

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

A Héstia opera em modo protegido: leitura por padrão; escrita local apenas por planos aprovados explicitamente; sem comandos destrutivos. A exceção deliberada e documentada é o
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
- Undo/redo do organizer é de um nível só (sem histórico encadeado)

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
- **CORS opt-in só pra `/api/presence/*`** — desligado por padrão; liga só com
  `HESTIA_PRESENCE_CORS_ORIGIN` explícito, nunca cobre `/api/local/*` (ver "Via env" acima).

### systemd: roda sem privilégio de root

Tanto o `.deb` (`packaging/hestia-console.service`) quanto o `scripts/install.sh`
(`packaging/hestia-console.service.in`) usam `DynamicUser=yes` — o serviço roda com um UID/GID
efêmero, sem privilégio de root, com `NoNewPrivileges=yes` e `ProtectSystem=strict` (todo o
filesystem fica somente leitura, exceto o que é liberado explicitamente).

O organizer precisa escrever de verdade em `/KALINE`, então isso é liberado via
`ReadWritePaths=/KALINE`. Depois de instalar, libere o grupo do serviço (mesmo nome do serviço,
`hestia-console`) nesse caminho:

```bash
sudo chgrp hestia-console /KALINE
sudo chmod g+rwx /KALINE
```

O `.deb` tenta fazer isso automaticamente no `postinst` se `/KALINE` já existir; se não existir
ainda, ele só avisa — rode o comando acima manualmente depois de criar `/KALINE`.

Se você usa `storageSources` (fontes externas do HD), cada path configurado lá também precisa
estar acessível ao mesmo grupo (o `ReadWritePaths` do unit não conhece esses paths dinamicamente
— são definidos em `~/.chama/config.json`, não no unit file).

Pra quem instala via `scripts/install.sh` (checkout de git, não `/opt`): o diretório do checkout
também precisa ser legível pelo UID efêmero — se estiver dentro de um `$HOME` com permissão
700/750 (padrão), rode `chmod o+rX` no checkout e nos diretórios pais, ou clone fora do home
(ex.: `/srv/hestia-console`). O script avisa sobre isso ao instalar o serviço.

⚠️ **Limitação conhecida**: `DynamicUser=yes`/`ProtectSystem=strict` foram validados com
`systemd-analyze verify` (sintaxe do unit) e via inspeção manual, mas o comportamento real de
sandbox em runtime não foi testado num host com systemd de verdade rodando como PID 1 — só é
possível fazer isso numa instalação real (Linux Mint ou outra distro com systemd). Teste antes
de considerar isso validado em produção.

### Revisão de segurança do pipeline do organizer

Passada dedicada sobre `storageScanner.js` → `organizerPlan.js` → `organizerApply.js` →
`organizerUndo.js`/`organizerRedo.js`, feita depois que o fluxo completo (plano, apply, undo,
redo) já estava no ar:

- **Corrigido nesta PR**: `getPlan(planId, ...)` e `getOrganizerRun(runId, ...)` montavam o path
  do arquivo via `path.join(dataDir, ..., \`${id}.json\`)` — e `path.join` **normaliza `..`**, então
  um `planId`/`runId` vindo direto do cliente (body do POST / param da URL) com algo como
  `"../../../../etc/passwd"` escapava de `dataDir/organizer/{plans,runs}/`. Corrigido validando
  o formato estrito do id (`chama/organizerIds.js`, regex `^(plan|org|undo|redo)_\d+_[0-9a-f]{8}$`)
**antes** de montar qualquer path — na função de leitura em si, não só no route handler, pra
proteger qualquer chamador futuro também. Confirmado ao vivo com `curl`que a tentativa de
traversal agora recebe`404`/plano-não-encontrado, sem tocar o disco fora do esperado.
- **Symlink**: já mitigado desde a PR do scanner — `storageScanner.js` nunca segue link
  simbólico (`entry.isSymbolicLink()` pula, não entra).
- **`targetPath` sempre dentro de `/KALINE`**: `organizerPlan.js` usa uma tabela fixa de
  extensão→pasta (nunca vinda de config/cliente) e `basename()` no nome do arquivo (corta
  qualquer `..` do nome); mesmo assim, uma checagem `targetPath.startsWith("/KALINE/")` foi
  adicionada como cinto e suspensório, caso essa tabela vire configurável no futuro.
- **TOCTOU (aceito)**: existe uma janela pequena entre checar `targetExists()` e o
  `rename`/`copyFile` de verdade. Num app local de usuário único (sem outro processo
  concorrente mexendo em `/KALINE` ao mesmo tempo por design), o risco real é baixo — aceito
  como limitação conhecida, não uma vulnerabilidade ativa nesse modelo de ameaça.
- **`storageSources.mode`**: já restrito a `"external-readonly"` (único valor aceito,
  `chama/config.js`) — não existe modo que apague a origem de uma fonte externa.
- **Header de confirmação**: `X-Hestia-Local-Confirm` é fricção de intenção, não autenticação —
  já documentado como tal; não é um segredo, é uma barreira contra disparo acidental/CSRF
  simples (formulário/`<img>` não conseguem setar header customizado sem preflight CORS, que
  esta API não concede pra `/api/local/*`).

## Organizer / Ash — Segurança

- Gerar plano é sempre **dry-run**: nenhum arquivo é movido, copiado, apagado ou renomeado em `GET /api/storage/organizer/plan`.
- `apply` exige confirmação explícita (`X-Hestia-Local-Confirm: organize`) e planos com mais de 5000 itens exigem confirmação extra do `planId`.
- Revise o plano antes de aplicar; comece com poucos arquivos e use lotes para legado grande.
- Planos grandes mostram apenas uma amostra inicial na UI para não travar o navegador.
- Manifests/runs ficam em `dataDir/organizer/runs/` e podem ser consultados em `/organizar`/`/api/local/organizer/runs` para auditoria.
- Undo é conservador: só desfaz itens do manifest, pula destinos ausentes/alterados e nunca apaga arquivo desconhecido.
- Não use uploads para duplicar o HD inteiro sem entender o efeito; para acervos grandes, prefira lotes revisáveis.

## Contrato Kaline V27b

A Héstia expõe uma ponte local para a Kaline V27b:

```http
GET  /api/llm/health
POST /api/llm/chat
```

A Kaline V27 usa `VITE_HESTIA_URL` para localizar a Héstia.

Exemplo:

```bash
VITE_HESTIA_URL=https://servidor-kaline.tailnet.ts.net
```

Na Héstia, CORS para a Kaline deve ser habilitado explicitamente:

```bash
HESTIA_KALINE_CORS_ORIGIN=https://kaline-v27-preview.seu-subdominio.workers.dev
```

Sem essa variável, a Héstia continua local-only/same-origin.

### Ollama/Qwen

A Héstia espera Ollama local em:

```text
http://127.0.0.1:11434
```

Para preparar os modelos:

```bash
npm run llm:setup
```

Modelos esperados:

- `qwen2.5:1.5b`
- `qwen2.5:latest`
- `qwen2.5-coder` ou `qwen2.5-coder:latest`

### Testes manuais

```bash
curl http://127.0.0.1:4517/api/llm/health
curl -X POST http://127.0.0.1:4517/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"responda apenas: Kaline local ativa","facet":"kaline","model":"qwen2.5:1.5b"}'
```

## Hermes Inbox/Outbox

A Caixa Hermes permite que agentes ou scripts coloquem comandos persistentes para a Héstia por arquivos estruturados em uma pasta local ou compartilhada via rede (Samba/Tailscale).

Nenhuma ferramenta de sincronização ativa automática executa lógica ou é pressuposta.<br>
Os arquivos são lidos diretamente de um diretório monitorado.

A Héstia valida, processa e responde localmente.

Estrutura padrão:

```txt
/KALINE/HESTIA/inbox
/KALINE/HESTIA/outbox
/KALINE/HESTIA/archive
/KALINE/HESTIA/errors
```

Config opcional:

```env
HESTIA_HERMES_ROOT=/KALINE/HESTIA
```

Endpoints:

```http
GET  /api/hermes/status
POST /api/hermes/process-once
```

Processar uma vez:

```bash
curl -X POST http://127.0.0.1:4517/api/hermes/process-once \
  -H "X-Hestia-Local-Confirm: hermes"
```
