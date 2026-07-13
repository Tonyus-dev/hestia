# Códice API sobre Tailscale

A Héstia funciona em ambiente de Loopback por padrão (`127.0.0.1:4517`), sem expor a API de arquivos abertamente para a rede local ou externa.

Como a Héstia precisa ser acessada pelo Códice de diferentes dispositivos autorizados (como celulares ou web browsers na mesma Tailnet) sem expor ou transferir os livros para a Nuvem pública, utilizaremos o **Tailscale Serve** para tunelar as requisições HTTPS privadas e locais diretamente para a porta local da Héstia.

---

## 🛠️ Como funciona a topologia

1. **Servidor Héstia (Kaline)**:
   A Héstia continua escutando em `127.0.0.1:4517` para fins de segurança, sem fazer bind em `0.0.0.0`.

2. **Tailscale Serve (HTTPS Privado)**:
   O Tailscale Serve oferece HTTPS privado e local na Tailnet. O Funnel permanece desativado (sem exposição pública na internet).
   Para iniciar o proxy reverso em background apontando para a porta HTTP local da Héstia:

   ```bash
   sudo tailscale serve --bg http://127.0.0.1:4517
   ```

   Para inspecionar e comprovar o status e a URL gerada:

   ```bash
   tailscale serve status
   ```

3. **Controle de Acesso em Camadas**:
   - **Acesso à Rede (Tailscale)**: Apenas dispositivos conectados e autorizados na mesma Tailnet privada podem resolver e alcançar a URL gerada pelo Tailscale Serve.
   - **Host Guard**: O Host Guard da Héstia valida o cabeçalho `Host` (e `X-Forwarded-Host`) contra os domínios permitidos, blindando a API contra DNS Rebinding.
   - **CORS Estrito**: Controla e restringe quais origens web executadas no navegador (como a interface web do Códice) podem fazer chamadas de API (`fetch`) à Héstia. Note que o CORS atua no nível do navegador e não serve como autenticação direta de rede.

---

## 💾 Configuração Persistente

As variáveis de ambiente devem ser salvas no arquivo de configuração do sistema para serem lidas pelo systemd (via `EnvironmentFile=-/etc/default/hestia-console` sob o sandbox do serviço):

```bash
sudoedit /etc/default/hestia-console
```

Adicione as variáveis de ambiente necessárias (usando placeholders genéricos para preservar dados privados):

```ini
HESTIA_ALLOWED_HOSTS="<HESTIA_HOST_REDACTED>,<HESTIA_HOST_REDACTED>:443"
HESTIA_STORAGE_PATH="/KALINE"
HESTIA_CODICE_CORS_ORIGIN="https://<CODICE_ORIGIN_REDACTED>"
```

Após editar o arquivo, recarregue o systemd e reinicie o serviço para aplicar as configurações:

```bash
sudo systemctl daemon-reload
sudo systemctl restart hestia-console
systemctl status hestia-console --no-pager
```
