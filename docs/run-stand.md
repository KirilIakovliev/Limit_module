# Тестовый стенд t-lmts1-app51

Кластер и Traefik уже есть. Postgres в кластер **не** ставим: хост **`t-lmts1-pdb51.base.akbars.ru`**, БД **`limitmodule`**, пользователь **`limitmodule_test`**. Пароль в git не класть: `--set postgresql.password=...`.

DSN собирается из `POSTGRES_*` (`api/app/db.py`). Прод: сменить `postgresql.host`, `app.hostAliases` и `image.registry` в values.

`load_log` **не** из SQL: его создаёт Job Alembic.

## A. DBeaver, БД `limitmodule`

Порядок файлов из [`db/local/`](../db/local/). Повторно гонять 10–12 на уже существующих таблицах нельзя без DROP.

1. `00_extensions.sql` — `pg_trgm` и схемы. Если `CREATE EXTENSION` запрещён для `limitmodule_test` — этот файл выполняет DBA (суперпользователь), дальше те же 10–91 от вашего пользователя.
2. `10_sbox_rsk_drt_marts.sql` — DDL витрин `t_lm_*`.
3. `11_sbox_rsk_drt_refs.sql` — DDL справочников.
4. `12_srd_replicas.sql` — DDL `srd` / `t_util`.
5. `90_test_refs.sql` — данные справочников (файл большой).
6. `91_test_marts.sql` — моки витрин (экран: Ростелеком, ГК ВТБ, МТС-Банк).

## B. Образ, проверка без Kubernetes, Helm

Сборку запускать из корня `Limit_module/`: последняя `.` — контекст с папками `api/` и `web/`. Пароль БД при сборке не нужен; он передаётся при запуске контейнера и через Helm.

```bash
read -rsp 'Пароль БД: ' POSTGRES_PASSWORD
echo
export POSTGRES_PASSWORD

sudo nerdctl --namespace k8s.io build \
  --build-arg BASE_IMAGE=artifactory.akbars.tech/docker/library/python:3.12-slim \
  --build-arg PIP_INDEX_URL=https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple \
  --build-arg PIP_TRUSTED_HOST=artifactory.akbars.tech \
  -f Dockerfile.prod \
  -t t-lmts1-app51/limitmodule:0.2.1 \
  .
sudo nerdctl --namespace k8s.io image inspect t-lmts1-app51/limitmodule:0.2.1 >/dev/null
```

Dockerfile нормализует права статики (`chmod -R a+rX /srv/web`), чтобы каталоги с правами `700` не приводили к ответу `401 Unauthorized` при раздаче файлов. Проверка чтения без root:

```bash
sudo nerdctl --namespace k8s.io run --rm --user 10001 \
  t-lmts1-app51/limitmodule:0.2.1 \
  python -c "from pathlib import Path; print(Path('/srv/web/css/styles.css').read_text()[:100])"
```

Сначала тот же образ без кластера (`--add-host` — в контейнере DNS до pdb51 часто не резолвится). Остановить: Ctrl+C.

```bash
sudo nerdctl --namespace k8s.io run --rm -p 8000:8000 \
  --add-host t-lmts1-pdb51.base.akbars.ru:10.188.0.62 \
  -e POSTGRES_HOST=t-lmts1-pdb51.base.akbars.ru \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=limitmodule \
  -e POSTGRES_USER=limitmodule_test \
  -e POSTGRES_PASSWORD \
  t-lmts1-app51/limitmodule:0.2.1
```

В другом терминале:

```bash
curl -s http://127.0.0.1:8000/api/health
# db: true; marts: true после SQL из раздела A
```

Потом Helm. Приложение остаётся в pod-сети на `8000`; внешний вход без порта делает nginx через Traefik NodePort `30080`.

```bash
helm upgrade --install limitmodule deployment/helm-chart/limitmodule \
  -n limitmodule --create-namespace \
  -f deployment/helm-chart/limitmodule/values-stand.yaml \
  --set-string postgresql.password="$POSTGRES_PASSWORD" \
  --set image.tag=0.2.1

kubectl rollout status deploy/limitmodule -n limitmodule --timeout=180s
```

Проверка внутри кластера и через Traefik:

```bash
kubectl get pods -n limitmodule -o wide
# IP приложения должен быть 10.244.x.x, не IP ноды.

curl -s -H 'Host: t-lmts1-app51.base.akbars.ru' http://10.188.128.138:30080/api/health

curl -s -G -H 'Host: t-lmts1-app51.base.akbars.ru' \
  --data-urlencode 'q=рост' \
  'http://10.188.128.138:30080/api/clients'
```

Внешний `:80` — nginx на хосте, конфиг [`deployment/nginx/limitmodule.conf`](../deployment/nginx/limitmodule.conf):

```bash
sudo apt update && sudo apt install -y nginx
sudo cp deployment/nginx/limitmodule.conf /etc/nginx/sites-available/limitmodule.conf
sudo ln -sf /etc/nginx/sites-available/limitmodule.conf /etc/nginx/sites-enabled/limitmodule.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

curl -s http://t-lmts1-app51.base.akbars.ru/api/health
curl -I http://t-lmts1-app51.base.akbars.ru/css/styles.css
curl -I http://t-lmts1-app51.base.akbars.ru/js/app.js
# CSS/JS: 200 OK; health: db=true, web_mounted=true. В браузере: Ctrl+F5.
```

Чарт локально (без кластера): `helm lint deployment/helm-chart/limitmodule` и `helm template lm deployment/helm-chart/limitmodule -f deployment/helm-chart/limitmodule/values-stand.yaml --set postgresql.password=dummy`.
