# Héstia

Héstia é a Console local do notebook que monitora, em modo somente leitura, duas Stations headless: o desktop/servidor e a TV Box. A implantação operacional canônica está em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Arquitetura final

| Máquina          | Papel                                         | Bind canônico    |
| ---------------- | --------------------------------------------- | ---------------- |
| notebook         | Héstia Console visual                         | `127.0.0.1:4517` |
| desktop/servidor | Station Agent monitor-only                    | `127.0.0.1:4518` |
| TV Box           | Station Agent monitor-only + Códice read-only | `127.0.0.1:4519` |

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

As duas Stations são explícitas e independentes:

```dotenv
HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>
HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>
HESTIA_STATION_TIMEOUT_MS=5000
```

As variáveis legadas singulares não são migradas nem usadas pelo runtime. O Doctor rejeita sua presença com uma orientação de correção. Tokens e URLs ficam somente no processo server-side e nunca são devolvidos ao navegador.

## API da Console para as Stations

```http
GET /api/stations/desktop/connection
GET /api/stations/desktop/health
GET /api/stations/desktop/storage/status
GET /api/stations/desktop/services/status

GET /api/stations/tvbox/connection
GET /api/stations/tvbox/health
GET /api/stations/tvbox/storage/status
GET /api/stations/tvbox/services/status
GET /api/stations/tvbox/codice/health
```

Não existe endpoint de descoberta, overview, escrita ou Organizer na Console. O Códice health existe somente para a TV Box.

## API interna do Station Agent

Com Bearer válido:

```http
GET /api/station/health
GET /api/station/storage/status
GET /api/station/services/status
```

O Agent inicia com `HESTIA_STATION_ORGANIZER_ENABLED=0` e `HESTIA_STATION_CODICE_ENABLED=0`. Na TV Box, o Códice read-only é ativado explicitamente e expõe somente health, library e streaming HEAD/GET de livros. EPUB e PDF são obrigatórios e TXT é opcional. `HESTIA_CODICE_CORS_ORIGIN` identifica o aplicativo web Códice no navegador, não a Console server-to-server. Não há upload nem import.

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

Testes automatizados e smoke com fixtures sintéticas não validam notebook, desktop ou TV Box físicos. Até executar o checklist completo de [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): **RESULTADO OPERACIONAL: PENDENTE**.
