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
node hestia.js --host 0.0.0.0 --port 4517
```

Precedência: **CLI > env > `~/.chama/config.json` > padrões**.

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

Só os campos acima são lidos. Nomes de serviço passam por regex
`[a-zA-Z0-9._-]{1,64}` — qualquer coisa fora disso é ignorada.

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
