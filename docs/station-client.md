# Station Client Boundary

O Héstia Console e o futuro Station Agent são processos diferentes. O Console observa o notebook; o Agent governará o servidor em um PR posterior.

Neste PR existe somente o cliente server-side do Console para consultar `GET /api/station/health` e publicar diagnósticos sanitizados em duas rotas locais same-origin:

- `GET /api/station/connection`
- `GET /api/station/health`

O navegador nunca chama a Estação diretamente e não recebe o token. O fluxo é:

```txt
React same-origin → Héstia Console → Station Client Node → HTTPS privado → Station Agent
```

## Configuração

Exemplo para o ambiente do serviço:

```ini
# URL HTTPS privada oferecida pelo futuro Tailscale Serve
HESTIA_STATION_BASE_URL=https://<STATION_HOST>

# Credencial compartilhada com o futuro Station Agent
HESTIA_STATION_TOKEN=<STATION_TOKEN>

# Timeout do health remoto
HESTIA_STATION_TIMEOUT_MS=5000
```

O token fica somente no backend. `/api/config` informa apenas se a Estação e a credencial estão configuradas, além do timeout resolvido; não expõe URL completa nem segredo.

HTTPS privado será fornecido pelo Tailscale Serve no futuro. Tailscale Funnel não é usado. O Station Agent ainda será criado no PR #31; Storage remoto, Organizer remoto e Códice remoto não existem neste PR.
