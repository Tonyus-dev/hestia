# Contrato de Integração — Héstia & Klio (HESTIA_KLIO_CONTRACT)

Este documento define a especificação técnica e as premissas de arquitetura para a integração segura entre a **Héstia** e a infraestrutura **Klio**.

---

## 1. Conectividade de Rede e Acesso Privado

- **Local por Padrão**: A Héstia roda localmente por padrão, escutando no endereço de loopback `127.0.0.1:4517`.
- **Acesso via Tailscale/LAN**: O acesso remoto a partir de outros hosts (incluindo via IP privado da VPN **Tailscale**) só é permitido se:
  1. A escuta do host for configurada para um IP não-loopback (como `0.0.0.0`).
  2. O operador configurar explicitamente a variável de ambiente `HESTIA_ALLOW_LAN=1`.

---

## 2. A Caixa Hermes (Inbox/Outbox)

- **Sem Daemon/Watcher**: O Hermes **não** possui um daemon ou watcher contínuo rodando em plano de fundo para vigiar o diretório de arquivos.
- **Processamento sob Demanda**: Os comandos colocados na Inbox são processados apenas e exclusivamente quando o endpoint `/api/hermes/process-once` é chamado via requisição HTTP.
- **Cabeçalho de Segurança Obrigatório**: A execução do `process-once` exige obrigatoriamente o envio do seguinte cabeçalho HTTP:
  ```http
  X-Hestia-Local-Confirm: hermes
  ```

---

## 3. Classificação e Automação de Endpoints

### 3.1 Endpoints Permitidos para Integração
- **Diagnósticos**: APIs de leitura (`/api/health`, `/api/server/status`, `/api/storage/status`, `/api/storage/model`, `/api/services/status`, `/api/storage/scan`).
- **Planejamento (`/api/storage/organizer/plan`)**: É um **dry-run persistido** e não uma leitura pura, visto que ele gera, calcula e persiste o plano temporário de organização no estado interno do servidor.
- **Configurações (`/api/config`)**: Fornece os parâmetros da instância em modo **sanitizado** (sem expor credenciais ou chaves sensíveis).
- **Logs (`/api/logs`)**: Retorna logs de forma **limitada** (linhas recentes) e não deve vazar segredos ou informações sensíveis da máquina.

### 3.2 Endpoints Fora da Automação (Apenas Operação Visual/Humana)
Estes endpoints realizam mutações físicas de arquivos ou alterações profundas e **devem ficar totalmente fora** de qualquer fluxo de automação automática remota da Klio:
- `POST` `/api/local/organizer/apply` (Aplicação de plano de organização).
- `POST` `/api/local/organizer/runs/:runId/undo` (Desfazer operação física de disco).
- `POST` `/api/local/organizer/runs/:undoRunId/redo` (Reaplicar operação desfeita).
