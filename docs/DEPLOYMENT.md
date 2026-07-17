# Implantação da Héstia

## Arquitetura

- `127.0.0.1:4517`: Héstia Console no notebook; monitora as duas Stations.
- `127.0.0.1:4518`: Station Agent no desktop; monitor-only, sem Organizer e sem Códice.
- `127.0.0.1:4519`: Station Agent na TV Box; monitor-only e Códice read-only.

Console, Station e Códice não copiam arquivos. A cópia desktop → TV Box continua externa, por rsync/SSH.

## Pré-requisitos

- Node.js `>=22.13.0` e npm;
- Linux com systemd;
- Tailscale já instalado e configurado manualmente;
- acesso SSH entre as máquinas quando necessário;
- biblioteca já copiada para `/KALINE` na TV Box.

## Ordem recomendada de implantação

1. Desktop/servidor;
2. TV Box;
3. Tailscale e acesso privado;
4. Notebook/Console;
5. Gate físico completo.

As Stations não dependem da Console. Por isso, instale e valide primeiro o
desktop em `127.0.0.1:4518` e depois a TV Box em `127.0.0.1:4519`. Só então
configure manualmente a rede privada e instale a Console com as duas URLs e
tokens reais. Esta é uma sequência operacional, não uma automação.

### 1. Desktop/servidor

Instale a Station em `127.0.0.1:4518`, confirme o runtime em `/opt`, serviço
ativo e execute o Doctor instalado. Confirme também Organizer e Códice em 404
e que o token próprio não aparece em logs.

### 2. TV Box

Instale a Station em `127.0.0.1:4519`, confirme o runtime mínimo em `/opt` e
configure explicitamente `HESTIA_STATION_ORGANIZER_ENABLED=0`,
`HESTIA_STATION_CODICE_ENABLED=1`, `HESTIA_STORAGE_PATH=/KALINE`,
`HESTIA_CODICE_CORS_ORIGIN=https://<ORIGEM_WEB_DO_CODICE>` e
`HESTIA_CODICE_SUPABASE_URL=https://<PROJETO>.supabase.co`,
`HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<CHAVE>`,
`HESTIA_CODICE_ALLOWED_USER_IDS=<UUID_SUPABASE>` e
`HESTIA_STATION_ALLOWED_HOSTS=<HOST_PRIVADO>`. Execute o Doctor instalado e
valide health, storage, services e Códice.

### 3. Rede privada

Depois das duas Stations funcionarem localmente, configure Tailscale e acesso
privado manualmente. Valide os dois endpoints, hosts permitidos exatos e que o
acesso não é público. A Héstia não automatiza esse passo.

### 4. Notebook/Console

Somente depois de obter as duas URLs privadas e os dois tokens independentes,
instale a Console e execute o Doctor instalado em `/opt`. A Console depende das
Stations; as Stations não dependem da Console.

## Notebook

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo npm run install:local
sudoedit /etc/default/hestia-console
sudo systemctl restart hestia-console
sudo systemctl is-active --quiet hestia-console
sudo /usr/bin/env node \
  /opt/hestia-console/scripts/console-doctor.mjs \
  --require-systemd
```

Configure separadamente, sem reutilizar tokens:

```dotenv
HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>
HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>
HESTIA_STATION_TIMEOUT_MS=5000
HESTIA_ORGANIZER_TIMEOUT_MS=120000
```

Acesse somente `http://127.0.0.1:4517` no notebook.

## Desktop

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo HESTIA_STATION_PORT=4518 npm run station:install
sudoedit /etc/default/hestia-station-agent
sudo systemctl restart hestia-station-agent
sudo systemctl is-active --quiet hestia-station-agent
sudo /usr/bin/env node \
  /opt/hestia-station/scripts/station-doctor.mjs \
  --require-systemd
```

Confirme `HESTIA_STATION_ORGANIZER_ENABLED=0` e `HESTIA_STATION_CODICE_ENABLED=0`.

## TV Box

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo HESTIA_STATION_PORT=4519 npm run station:install
sudoedit /etc/default/hestia-station-agent
sudo systemctl restart hestia-station-agent
sudo systemctl is-active --quiet hestia-station-agent
sudo /usr/bin/env node \
  /opt/hestia-station/scripts/station-doctor.mjs \
  --require-systemd
```

Configure `HESTIA_STATION_ORGANIZER_ENABLED=0`, `HESTIA_STATION_CODICE_ENABLED=1`, `HESTIA_STORAGE_PATH=/KALINE`, `HESTIA_CODICE_CORS_ORIGIN=https://<ORIGEM_WEB_DO_CODICE>`, `HESTIA_CODICE_SUPABASE_URL=https://<PROJETO>.supabase.co`, `HESTIA_CODICE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<CHAVE>`, `HESTIA_CODICE_ALLOWED_USER_IDS=<UUID_SUPABASE>` e os hosts privados permitidos. Use somente publishable key; nunca service-role. EPUB e PDF são obrigatórios; TXT é opcional. O instalador não instala LibreOffice nem frontend na Station.

`HESTIA_CODICE_CORS_ORIGIN` é a origem exata do aplicativo web Códice executado no navegador. Todas as rotas `/api/codice/*` exigem Bearer Supabase válido e `user.id` na allowlist. A Console e o Doctor consultam `/api/station/codice/health` server-to-server com o token da Station; não possuem JWT Supabase e não expõem biblioteca ou livros. A API é somente leitura e entrega bytes completos: não há Range, 206, upload ou import.

**Não implante esta alteração isoladamente.** O cliente Kódice precisa primeiro adquirir e enviar o Bearer Supabase. A atualização da Station, configuração da allowlist e atualização do cliente devem ocorrer de forma coordenada, sem janela em que o cliente antigo tente acessar a Station nova.

## Tailscale

Instale, autentique e valide Tailscale manualmente. Use apenas IPs/hostnames privados nos arquivos locais. Este projeto não automatiza `tailscale serve`, não grava IP real e não distribui tokens.

## Atualização

Atualize o checkout e execute novamente o mesmo instalador. Os paths operacionais são fixos em `/opt/hestia-console`, `/opt/hestia-station`, `/etc/default` e `/etc/systemd/system`; overrides existem somente no modo de teste confinado por `HESTIA_TEST_ROOT`. O runtime novo é preparado no mesmo filesystem e ativado por rename. Se restart ou Doctor falhar, o runtime anterior é restaurado. Env, token, porta e feature flags existentes são preservados. O serviço não depende do checkout após a instalação.

O pacote Debian da Console usa somente a arquitetura nativa de `dpkg --print-architecture` em produção. O teste `armhf` da CI valida apenas nome e metadata do pacote, não execução ou build em ARM. O `postinst` falha se Node.js `>=22.13.0`, serviço ativo ou Console Doctor não forem confirmados.

O Organizer permanece disponível apenas como opt-in interno do Agent. As instalações atuais mantêm `HESTIA_STATION_ORGANIZER_ENABLED=0`; a Console não expõe proxy ou interface de escrita.

O Doctor do checkout é ferramenta de desenvolvimento. O gate pós-instalação deve
sempre executar diretamente o Doctor instalado em `/opt`.

Alterações em `/etc/default` não afetam processos já iniciados. O restart é
obrigatório antes do gate pós-configuração: editar env → reiniciar serviço →
confirmar serviço ativo → executar Doctor instalado → validar endpoints reais.

## Desinstalação

```bash
sudo npm run uninstall:local
sudo npm run uninstall:local -- --purge
sudo npm run station:uninstall
sudo npm run station:uninstall -- --purge
```

O modo padrão remove unit e runtime, preservando configuração e token. `--purge` remove também a configuração da Héstia. Nenhum modo remove `/KALINE`, EPUB, PDF ou dados externos.

## Gate físico

### Notebook

- [ ] runtime em `/opt/hestia-console` e serviço ativo;
- [ ] `127.0.0.1:4517` abre;
- [ ] Servidor e TV Box aparecem e falham independentemente;
- [ ] reboot preserva configuração.

### Desktop

- [ ] runtime em `/opt/hestia-station`, porta 4518;
- [ ] health, storage e services reais;
- [ ] Organizer e Códice retornam 404;
- [ ] Tailscale privado e reboot validados.

### TV Box

- [ ] runtime mínimo em `/opt/hestia-station`, porta 4519 e Node em ARMv7;
- [ ] health, storage, services e Códice reais;
- [ ] EPUB/PDF reais listados, transmitidos e com checksums preservados;
- [ ] import retorna 404;
- [ ] RAM, CPU, microSD, reboot e Tailscale privado observados.

Enquanto esse checklist não for executado nas três máquinas: **RESULTADO OPERACIONAL: PENDENTE**.
