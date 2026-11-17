# BOINC Monitor

Веб-клиент статистики BOINC через GUI RPC. Запуск **только через Docker**.

![Обзор](docs/overview.png)

![Графики](docs/charts.png)

## Запуск

Только Docker. На машине с BOINC:

```bash
git clone git@github.com:foxweb/boinc-web-client.git ~/boinc-web-client
cd ~/boinc-web-client
cp .env.example .env   # задайте BOINC_PASSWORD
docker compose up -d --build
```

Браузер: **http://\<хост\>:8080**  
(на foxweb-pc: http://192.168.1.45:8080)

```bash
docker compose logs -f    # логи
docker compose down       # стоп
```

Контейнер с `restart: unless-stopped` поднимается вместе с Docker после reboot.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `BOINC_PASSWORD` | — | пароль GUI RPC (обязателен) |
| `BOINC_HOST` | `127.0.0.1` | хост BOINC-клиента |
| `BOINC_PORT` | `31416` | порт GUI RPC |
| `PORT` | `8080` | HTTP-порт веб-UI |

Ве публикует порт UI через Docker (`8080`, проходит UFW как у Grafana). Доступ к GUI RPC идёт через sidecar-прокси на `docker0` → `127.0.0.1:31416` (LAN ACL BOINC не мешает).

## Что показывает

Host / CC status, проекты, задачи, передачи, сообщения, диск, дневные кредиты/RAC, сетевой трафик, live CPU/GPU и активные задачи.

RPC: `exchange_versions`, `get_host_info`, `get_cc_status`, `get_project_status`, `get_results`, `get_file_transfers`, `get_messages`, `get_disk_usage`, `get_statistics`, `get_daily_xfer_history`.

## Опционально: systemd (нужен sudo)

```bash
# поправьте WorkingDirectory в unit при необходимости
sudo cp deploy/boinc-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boinc-monitor.service
```
