# Héstia

Héstia é o console de observabilidade e operação controlada da infraestrutura Kaline. A Console canônica roda na TV Box e agrega **sete Stations**: `desktop`, `tvbox`, `pocket`, `baby`, `mini`, `max` e `note`.

> **Héstia observa, apresenta e solicita ações estritamente delimitadas. Ela não oferece shell remoto nem execução arbitrária.**

A arquitetura permite que recursos permaneçam desligados ou suspensos quando não são necessários. Quando uma ação operacional é necessária, a Héstia usa contratos explícitos, autenticação por Station e validação posterior do estado real.

## Topologia canônica

| Station | Papel canônico | Bind local do Agent |
| --- | --- | --- |
| `desktop` | **SERVIDOR i7** — `/KALINE`, backup, processamento e serviços pesados sob demanda; Ash Gate | `127.0.0.1:4518` |
| `tvbox` | TV Box — Héstia Console, Station local, executor LAN/WoL restrito e runtime canônico da Ash | `127.0.0.1:4519` |
| `pocket` | Pocket — ZeroClaw + Khora | `127.0.0.1:4518` |
| `baby` | Baby — computação de reserva/worker | `127.0.0.1:4518` |
| `mini` | Mini — host canônico do Kódice | `127.0.0.1:4518` |
| `max` | MAX — Cauldron / Kallistis VTT | `127.0.0.1:4518` |
| `note` | Notebook principal de desenvolvimento | `127.0.0.1:4518` |

A Console canônica usa `127.0.0.1:4517` na TV Box. O acesso remoto entre Console e Stations deve usar origens HTTPS privadas, normalmente via Tailscale Serve. Não versionar IPs, hostnames reais ou tokens.

### Limites arquiteturais

- **Ash runtime:** TV Box.
- **Ash Gate:** SERVIDOR i7.
- **Kódice:** Mini.
- **Khora + ZeroClaw:** Pocket.
- **Cauldron / Kallistis VTT:** MAX.
- **Héstia AI runtime:** nenhum.
- **Execução remota genérica:** ausente.

## Requisitos

- Node.js `>=22.13.0` e npm;
- Linux com systemd para instalação dos serviços;
- Tailscale e SSH configurados separadamente quando usados.

Os instaladores não configuram Tailscale, não sincronizam arquivos e não instalam componentes externos ao runtime da Héstia.

## Desenvolvimento e gates

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Gates adicionais relevantes:

```bash
npm run station:doctor
npm run station:smoke
npm run build-deb
```

O frontend nunca inventa métricas. Estado indisponível permanece indisponível; Station não configurada é diferente de Station offline; erro de autenticação é diferente de indisponibilidade.

## Configuração da Console

Cada Station tem URL e token independentes:

```dotenv
HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>

HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>

HESTIA_POCKET_BASE_URL=https://<POCKET_PRIVADA>
HESTIA_POCKET_TOKEN=<TOKEN_POCKET>

HESTIA_BABY_BASE_URL=https://<BABY_PRIVADA>
HESTIA_BABY_TOKEN=<TOKEN_BABY>

HESTIA_MINI_BASE_URL=https://<MINI_PRIVADA>
HESTIA_MINI_TOKEN=<TOKEN_MINI>

HESTIA_MAX_BASE_URL=https://<MAX_PRIVADA>
HESTIA_MAX_TOKEN=<TOKEN_MAX>

HESTIA_NOTE_BASE_URL=https://<NOTE_PRIVADA>
HESTIA_NOTE_TOKEN=<TOKEN_NOTE>
```

Rotas remotas exigem HTTPS. HTTP é aceito apenas em loopback quando explicitamente permitido pelo runtime. Tokens ficam somente no backend da Console e nunca devem ser devolvidos ao navegador.

## API da Console

Para cada Station canônica (`desktop`, `tvbox`, `pocket`, `baby`, `mini`, `max`, `note`):

```http
GET /api/stations/:id/connection
GET /api/stations/:id/health
GET /api/stations/:id/system/status
GET /api/stations/:id/storage/status
GET /api/stations/:id/services/status
GET /api/stations/:id/updates
GET /api/stations/:id/apps
GET /api/stations/:id/tunnel/status
POST /api/stations/:id/apps/:appId/update
```

Ações operacionais adicionais permanecem específicas e nomeadas; não existe endpoint de `exec`, shell, comando arbitrário ou pacote arbitrário.

## Station Agent

Com Bearer válido, o Agent expõe:

```http
GET /api/station/health
GET /api/station/system/status
GET /api/station/storage/status
GET /api/station/services/status
GET /api/station/updates
GET /api/station/apps
GET /api/station/tunnel/status
POST /api/station/apps/:appId/update
```

Cada host usa seu Agent local em loopback. O transporte privado fica na frente do Agent e não altera o bind local.

## Updates do Dia e inventário de aplicativos

A Héstia separa duas coisas:

1. **Pacotes do sistema:** observação de atualizações disponíveis, inclusive sinalização de segurança quando comprovável.
2. **Aplicativos monitorados:** descoberta dinâmica e atualização controlada por aplicativo quando o provider permite.

O inventário não usa catálogo hardcoded. Ele descobre aplicativos a partir do host e classifica, quando possível:

```text
source: apt | flatpak | snap | appimage | manual
updateStatus: up_to_date | update_available | unknown | unsupported | error
updateCapability: controlled | none | external | unknown
```

Uma atualização só pode ser oferecida quando o item descoberto é gerenciável e a ação é determinística. O navegador envia apenas o `stationId`, o `appId` e uma autorização transitória; a Station resolve provider e package ID no servidor. A UI não envia comandos de shell.

### Senha sudo efêmera

Ao clicar para atualizar um aplicativo controlado, a interface abre um **modal flutuante de autorização**. A senha sudo:

- vale somente para aquela operação;
- não é persistida em arquivo, banco, cookie, `localStorage` ou `sessionStorage`;
- não deve aparecer em logs;
- não deve ser colocada em argv ou variável de ambiente do processo de atualização;
- é descartada pela UI imediatamente após o envio;
- autorização incorreta resulta em `AUTHORIZATION_FAILED`, sem repetição automática.

Fluxo esperado:

```text
UPDATE_REQUESTED
→ UPDATING
→ rescan do inventário
→ UP_TO_DATE
```

ou:

```text
UPDATE_REQUESTED
→ UPDATE_FAILED / AUTHORIZATION_FAILED
```

Invariante de segurança:

```text
SOFTWARE_INVENTORY=READ_ONLY
SOFTWARE_UPDATE=CONTROLLED_WRITE
GENERIC_REMOTE_EXEC=ABSENT
```

## Instalação

Console:

```bash
sudo npm run install:local
```

Station padrão:

```bash
sudo HESTIA_STATION_PORT=4518 npm run station:install
```

Station local da TV Box:

```bash
sudo HESTIA_STATION_PORT=4519 npm run station:install
```

O instalador da Station monta um runtime mínimo em `/opt/hestia-station`, preserva a configuração existente em `/etc/default/hestia-station-agent`, executa npm como usuário não-root e exige o Station Doctor após o start.

O runtime mínimo deve conter **todos os módulos `chama/*.js` importados transitivamente por `station.js`**. Existe teste de regressão para impedir que um módulo novo seja importado pelo Agent e esquecido no manifest de empacotamento do instalador.

O `.deb` continua sendo da Console; ele não é necessário para instalar uma Station.

## Segurança operacional

- nenhuma senha de Station deve ser versionada;
- nenhum token deve ser impresso em logs ou copiado para o frontend;
- atualização de aplicativo é uma capacidade específica, não um shell disfarçado;
- Tailscale/Funnel/Cloudflare são configurados fora dos instaladores;
- métricas e estados não comprovados devem ser reportados como indisponíveis ou não configurados;
- mudanças de topologia devem seguir o mapa de percurso canônico antes de alterar código ou documentação.

## Validação física

CI, fixtures e smokes não substituem validação nos hosts reais. A aceitação de uma Station exige, no mínimo:

```text
service active
runtime completo
Doctor PASS
endpoint local protegido
transporte privado funcionando
Console autenticando
health/updates/apps coerentes
```

Para a MAX, qualquer manutenção de host deve preservar Cauldron / Kallistis e ser validada antes e depois da intervenção.