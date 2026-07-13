# Códice API sobre Tailscale

A Héstia funciona em ambiente de Loopback por padrão (`127.0.0.1:4517`), sem expor a API de arquivos abertamente para a rede.
Como o Códice acessará a Héstia de diferentes dispositivos (como o celular e a web), e considerando a restrição de não transferir os e-pubs inteiros para a Nuvem, usaremos o **Tailscale Serve** para tunelar uma URL HTTPS interna e particular para a porta local da Héstia.

## Como funciona a topologia

1. **Servidor Héstia (Kaline)**:
   A Héstia continua escutando em `127.0.0.1:4517`.

2. **Tailscale Serve**:
   Executado no mesmo servidor onde a Héstia se encontra, o Tailscale criará um tunel HTTPS.
   ```bash
   sudo tailscale serve --bg https / http://127.0.0.1:4517
   ```

3. **Configuração da Héstia**:
   O Tailscale irá reencaminhar as requisições com o Host `nome-da-maquina.tailnet-exemplo.ts.net`.
   A Héstia possui um Anti-DNS Rebinding (Host Guard). Portanto, devemos avisá-la sobre este domínio adicionando-o na configuração:
   ```bash
   export HESTIA_ALLOWED_HOSTS="nome-da-maquina.tailnet-exemplo.ts.net"
   ```

4. **Aplicativo Web Códice**:
   O App Códice, hospedado na Cloudflare Pages (ex. `codice.app`), irá realizar requisições CORS para o Tailscale Serve. Para permitir que a Héstia responda com o CORS Header, você deve expor:
   ```bash
   export HESTIA_CODICE_CORS_ORIGIN="https://codice.app"
   ```

Tudo isso garante: 
- Ninguém fora do Tailscale acessa seus livros.
- Nenhum App fora do `codice.app` pode fazer solicitações `fetch` pro servidor.
- O servidor da Héstia permanece sem ouvir `0.0.0.0`, mitigando falhas na rede local.
