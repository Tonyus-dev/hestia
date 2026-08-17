# Héstia

Héstia é a Console local da TV Box que monitora, em modo somente leitura, seis Stations headless: desktop/servidor, TV Box, Pocket, Baby, Mini e MAX. A implantação operacional canônica está em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> **Héstia permite que recursos computacionais permaneçam desligados ou suspensos quando não são necessários, sem perder sua operabilidade. Quando o Guardião precisa de um recurso, Héstia pode solicitar seu despertar por um fluxo explicitamente autorizado e verificar se ele realmente retornou.**
>
> **Héstia observa, apresenta e solicita. Ela não executa arbitrariamente.**
>
> *Héstia não mantém as máquinas acordadas. Ela mantém a infraestrutura disponível para ser acordada.*

```text
Héstia mostra.
Baby controla.
TV Box age dentro da LAN.
Mini verifica de fora.
Servidor trabalha e preserva.
Pocket hospeda Khora.
MAX processa sob demanda.
O Guardião autoriza.
```

## Arquitetura final

| Máquina          | Papel                                         | Bind canônico    |
| ---------------- | --------------------------------------------- | ---------------- |
| TV Box           | Héstia Console visual                         | `127.0.0.1:4517` |
| desktop/servidor | Station Agent monitor-only                    | `127.0.0.1:4518` |
| TV Box           | Station Agent monitor-only + Códice read-only | `127.0.0.1:4519` |
| Pocket           | Station Agent monitor-only (Khora)            | `127.0.0.1:4518` |
| Baby             | Station Agent monitor-only (Controle/WoL)     | `127.0.0.1:4518` |
| Mini             | Station Agent sentinela externa               | `127.0.0.1:4518` |
| MAX              | Station Agent computação cloud sob demanda    | `127.0.0.1:4518` |

A Console não copia arquivos. A Station não copia arquivos. O Códice não copia arquivos. A sincronização desktop → TV Box continua externa, por rsync/SSH.

## Requisitos

- Node.js `>=22.13.0` e npm;
- Linux com systemd para instalação dos serviços;
- Tailscale e SSH configurados manualmente quando usados.

Nenhum instalador configura Tailscale, sincroniza arquivos ou instala LibreOffice.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Validação local:

```bash
npm test
npm run lint
npm run build
npm run station:smoke
npm run build-deb
```

O frontend nunca inventa métricas: estados indisponíveis continuam indisponíveis.

## Configuração da Console

As cinco Stations são explícitas e independentes:

```dotenv
HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>
HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>
HESTIA_POCKET_BASE_URL=https://<HOST_PRIVADO_DA_POCKET>
HESTIA_POCKET_TOKEN=<TOKEN_DA_STATION>
HESTIA_BABY_BASE_URL=https://<HOST_PRIVADO_DA_BABY>
HESTIA_BABY_TOKEN=<TOKEN_DA_STATION>
HESTIA_MINI_BASE_URL=https://<HOST_PRIVADO_DA_MINI>
HESTIA_MINI_TOKEN=<TOKEN_DA_STATION>
HESTIA_STATION_TIMEOUT_MS=5000
```

As variáveis legadas singulares não são migradas nem usadas pelo runtime. O Doctor rejeita sua presença com uma orientação de correção. Tokens e URLs ficam somente no processo server-side e nunca são devolvidos ao navegador.

## API da Console para as Stations

```http
GET /api/stations/desktop/connection
GET /api/stations/desktop/health
GET /api/stations/desktop/storage/status
GET /api/stations/desktop/services/status
GET /api/stations/desktop/system/status

GET /api/stations/tvbox/connection
GET /api/stations/tvbox/health
GET /api/stations/tvbox/storage/status
GET /api/stations/tvbox/services/status
GET /api/stations/tvbox/system/status
GET /api/stations/tvbox/codice/health

GET /api/stations/pocket/connection
GET /api/stations/pocket/health
GET /api/stations/pocket/system/status
GET /api/stations/pocket/storage/status
GET /api/stations/pocket/services/status

GET /api/stations/baby/connection
GET /api/stations/baby/health
GET /api/stations/baby/system/status
GET /api/stations/baby/storage/status
GET /api/stations/baby/services/status

GET /api/stations/mini/connection
GET /api/stations/mini/health
GET /api/stations/mini/system/status
GET /api/stations/mini/storage/status
GET /api/stations/mini/services/status
```

Não existe endpoint de descoberta, overview ou escrita na Console. O Códice health existe somente para a TV Box.

## API interna do Station Agent

Com Bearer válido:

```http
GET /api/station/health
GET /api/station/storage/status
GET /api/station/system/status
GET /api/station/services/status
GET /api/station/codice/health
```

Stations: `desktop` monitora armazenamento principal; `tvbox` monitora Códice read-only; `pocket` é monitor-only para Hermes experimental e vigilância; `baby` é monitor-only para Telegram, monitoramento e Wake-on-LAN; `mini` é sentinela externa monitor-only; `max` é computação cloud sob demanda. Pocket, Baby, Mini e Max não habilitam Códice nem ações de escrita local direta; monitoram apenas o Agent, sistema, disco raiz e serviços configurados.

Cada host de Station pode usar a porta local `4518` porque roda em máquina distinta. O Console Doctor percorre as seis Stations canônicas; Station temporariamente offline gera aviso e não bloqueia atualização da Console, mas configuração inválida, autenticação quebrada e contrato incompatível continuam bloqueando.

Variáveis opcionais da Console para as novas Stations: `HESTIA_POCKET_BASE_URL`, `HESTIA_POCKET_TOKEN`, `HESTIA_BABY_BASE_URL`, `HESTIA_BABY_TOKEN`, `HESTIA_MINI_BASE_URL`, `HESTIA_MINI_TOKEN`, `HESTIA_MAX_BASE_URL`, `HESTIA_MAX_TOKEN`. Use origens HTTPS privadas exatas; não versionar IPs, hostnames reais ou tokens.

### Contrato do Wake-Server
- **Ação:** Acionamento de Wake-on-LAN (WoL) para estações adormecidas.
- **Rota:** `POST /api/stations/:id/wake` (Consumidor: Héstia Console; Executor: Baby/WoL relay).
- **Parâmetros:** Rota com o ID da estação a ser acordada.
- **Resposta Esperada:** `202 Accepted` com corpo `{ "ok": true, "status": "pending", "station": "<id>" }` em caso de envio agendado de WoL, ou `501 Not Implemented` nesta etapa.

O Agent inicia com `HESTIA_STATION_CODICE_ENABLED=0`. Na TV Box, o Códice read-only é ativado explicitamente e expõe somente health, library e streaming HEAD/GET de livros. As requisições públicas `GET` e `HEAD` de `/api/codice/*` exigem Bearer Supabase válido, `user.id` na allowlist `HESTIA_CODICE_ALLOWED_USER_IDS` e a origem exata configurada. As requisições `OPTIONS` validam apenas o preflight CORS, não exigem Bearer e não consultam o Supabase. Somente chave `sb_publishable_` é aceita; service-role não é usada. Console e Doctor monitoram apenas `GET /api/station/codice/health` com o token da Station, sem JWT de usuário. EPUB e PDF são obrigatórios e TXT é opcional. Não há Range, resposta 206, upload, import ou escrita.

Esta proteção não deve ser implantada isoladamente: o cliente Kódice ainda precisa ser atualizado para enviar o Bearer Supabase, e a implantação deve ser coordenada com essa mudança.

## Instalação

Console:

```bash
sudo npm run install:local
```

Desktop:

```bash
sudo HESTIA_STATION_PORT=4518 npm run station:install
```

TV Box:

```bash
sudo HESTIA_STATION_PORT=4519 npm run station:install
```

Os instaladores partem de um clone limpo, executam npm como usuário não-root, instalam runtimes estáveis em `/opt`, preservam env/tokens existentes e exigem Doctor após o start. O runtime da Station usa lockfile próprio e apenas `fastify` como dependência externa.

O `.deb` continua sendo da Console, usa em produção somente a arquitetura nativa informada por `dpkg --print-architecture` e não é necessário para instalar a Station. Metadata `armhf` testada em CI não equivale a execução em ARM.

## Estado operacional

Testes automatizados e smoke com fixtures sintéticas não validam TV Box, desktop, TV Box (Station), Pocket, Baby ou Mini físicas. Até executar o checklist completo de [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): **RESULTADO OPERACIONAL: PENDENTE**.
