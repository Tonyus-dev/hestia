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

## Notebook

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo npm run install:local
sudoedit /etc/default/hestia-console
sudo npm run doctor
```

Configure separadamente, sem reutilizar tokens:

```dotenv
HESTIA_DESKTOP_BASE_URL=https://<DESKTOP_PRIVADO>
HESTIA_DESKTOP_TOKEN=<TOKEN_DESKTOP>
HESTIA_TVBOX_BASE_URL=https://<TVBOX_PRIVADA>
HESTIA_TVBOX_TOKEN=<TOKEN_TVBOX>
HESTIA_STATION_TIMEOUT_MS=5000
```

Acesse somente `http://127.0.0.1:4517` no notebook.

## Desktop

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo HESTIA_STATION_PORT=4518 npm run station:install
sudoedit /etc/default/hestia-station-agent
sudo npm run station:doctor -- --require-systemd
```

Confirme `HESTIA_STATION_ORGANIZER_ENABLED=0` e `HESTIA_STATION_CODICE_ENABLED=0`.

## TV Box

```bash
git clone https://github.com/Tonyus-dev/hestia.git
cd hestia
sudo HESTIA_STATION_PORT=4519 npm run station:install
sudoedit /etc/default/hestia-station-agent
sudo npm run station:doctor -- --require-systemd
```

Configure `HESTIA_STATION_ORGANIZER_ENABLED=0`, `HESTIA_STATION_CODICE_ENABLED=1`, `HESTIA_STORAGE_PATH=/KALINE`, uma origem CORS exata da Console e os hosts privados permitidos. O instalador não instala LibreOffice nem frontend na Station.

## Tailscale

Instale, autentique e valide Tailscale manualmente. Use apenas IPs/hostnames privados nos arquivos locais. Este projeto não automatiza `tailscale serve`, não grava IP real e não distribui tokens.

## Atualização

Atualize o checkout e execute novamente o mesmo instalador. O runtime em `/opt` é substituído; env, token, porta e feature flags existentes são preservados. O Doctor é obrigatório. O serviço não depende do checkout após a instalação.

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
