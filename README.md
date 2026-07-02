# Héstia Console

Interface local da Héstia com **Chama Local** embutida.

> Héstia guarda, serve e sustenta.
> A Chama Local mede e valida.
> Presence mostra.

- **Héstia** — servidor físico/local da Estação Kaline
- **Héstia Console** — este web app (a tela)
- **Chama Local** — API local embutida (o pulso interno)

## Rodar frontend no Lovable/dev

```
npm run dev
```

A UI abre normalmente. Sem a Chama rodando, cada card mostra
`Aguardando Chama Local` — nenhuma métrica é inventada.

## Rodar Héstia real local (Linux)

```
npm install
npm run hestia
```

Depois abrir:

```
http://localhost:4517
```

## Endpoints

Todos são `GET` e somente leitura.

```
GET /api/health
GET /api/server/status
GET /api/storage/status
GET /api/services/status
GET /api/logs
GET /api/config
```

## Configuração por env

```
HESTIA_HOST=127.0.0.1
HESTIA_PORT=4517
HESTIA_STORAGE_PATH=/KALINE
```

Todos têm padrão sensato; o app roda sem `.env`.

## Segurança

A v0 é somente leitura.

- Sem upload
- Sem delete
- Sem shell
- Sem reiniciar serviço
- Sem comando arbitrário

`execFile` com argumentos fixos é a única forma de I/O de processo. Nomes
de serviço e paths de disco vêm de listas fixas no código, nunca da URL.
