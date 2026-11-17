# BOINC Monitor

Веб-клиент статистики BOINC через GUI RPC. Запуск **только через Docker**.

![Обзор](docs/overview.png)

![Графики](docs/charts.png)

## Запуск

На машине с Docker (обычно там же, где крутится BOINC):

```bash
git clone git@github.com:foxweb/boinc-web-client.git
cd boinc-web-client
cp .env.example .env
# укажите BOINC_PASSWORD (и при необходимости BOINC_HOST/PORT)
docker compose up -d --build
```

Откройте в браузере: **http://\<хост\>:8080**

Остановка: `docker compose down`

Логи: `docker compose logs -f`

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `BOINC_PASSWORD` | — | пароль GUI RPC (обязателен) |
| `BOINC_HOST` | `127.0.0.1` | хост BOINC-клиента |
| `BOINC_PORT` | `31416` | порт GUI RPC |
| `PORT` | `8080` | HTTP-порт веб-UI |

Compose использует `network_mode: host`, чтобы контейнер доставал GUI RPC на localhost (bridge IP обычно не в `remote_hosts.cfg`).

## Что показывает

Host / CC status, проекты, задачи, передачи, сообщения, диск, дневные кредиты/RAC, сетевой трафик, live CPU/GPU и активные задачи.

RPC: `exchange_versions`, `get_host_info`, `get_cc_status`, `get_project_status`, `get_results`, `get_file_transfers`, `get_messages`, `get_disk_usage`, `get_statistics`, `get_daily_xfer_history`.

## Сервис на хосте

```bash
sudo cp deploy/boinc-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boinc-monitor.service
```
