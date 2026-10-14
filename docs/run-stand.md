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

Сборку запускать из корня `Limit_module/`: последняя `.` — контекст с папкой `api/`. Пароль БД при сборке не нужен; он передаётся при запуске контейнера и через Helm. Страниц, Node и nginx в этом образе нет.

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

В API-образе нет каталога страниц. Проверка:

```bash
sudo nerdctl --namespace k8s.io run --rm --user 10001 \
  t-lmts1-app51/limitmodule:0.2.1 \
  python -c "import os; raise SystemExit(0 if not os.path.exists('/srv/web') else 1)"
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

## C. Frontend: Artifactory Node, файлы на host nginx

Nginx на `t-lmts1-app51` уже установлен. Контейнер nginx в Kubernetes не добавляется. Конфиг: [`deployment/nginx/limitmodule.conf`](../deployment/nginx/limitmodule.conf).

```
browser :80
  → host nginx
       /api /docs /redoc /openapi.json → 10.188.128.138:30080 → Traefik → FastAPI
       /old-prototype/* → /var/www/limitmodule/old-prototype
       /* → /var/www/limitmodule/app  (SPA → index.html)
```

Сборка из корня `Limit_module/`. Base image и npm — только Artifactory:

- Node: `artifactory.akbars.tech/common-docker-local/trustedimages/alpine/node:20-abdt`
- npm: `https://artifactory.akbars.tech/artifactory/api/npm/npm/` (`frontend/.npmrc`, `replace-registry-host=npmjs`)

В lockfile `resolved` остаётся `registry.npmjs.org`. npm 10 подменяет этот хост на registry из `.npmrc` и в публичный registry не ходит. Переписывать lockfile не нужно.

Токен в git не класть. Если Artifactory требует авторизацию, она живёт в `~/.npmrc` на сборщике (`//artifactory.akbars.tech/artifactory/api/npm/npm/:_authToken=...`) и передаётся секретом сборки. Без требования auth секрет не нужен.

Сначала успешная сборка во временный каталог. Каталог на стенде меняется только после этого.

```bash
cd Limit_module
rm -rf /tmp/limitmodule-dist

# секрет добавить только если без него npm отвечает 401:
#   --secret id=npmrc,src="$HOME/.npmrc"
nerdctl --namespace k8s.io build \
  -f frontend/Dockerfile \
  -t limitmodule-frontend-build \
  .

cid=$(nerdctl --namespace k8s.io create limitmodule-frontend-build)
nerdctl --namespace k8s.io cp "$cid":/app/dist /tmp/limitmodule-dist
nerdctl --namespace k8s.io rm "$cid"
test -f /tmp/limitmodule-dist/index.html
```

Запись в `/var/www/limitmodule` и reload nginx выполняет пользователь, у которого есть эти права. Команды без `sudo`. Пользователь процесса nginx (обычно `www-data`) должен иметь право чтения и входа в эти каталоги.

```bash
install -d -m 755 /var/www/limitmodule/app /var/www/limitmodule/old-prototype
rsync -a --delete /tmp/limitmodule-dist/ /var/www/limitmodule/app/
rsync -a --delete web/old-prototype/ /var/www/limitmodule/old-prototype/

install -m 644 deployment/nginx/limitmodule.conf /etc/nginx/sites-available/limitmodule.conf
ln -sfn /etc/nginx/sites-available/limitmodule.conf /etc/nginx/sites-enabled/limitmodule.conf
nginx -t && systemctl reload nginx
```

Проверка:

```bash
curl -sI http://t-lmts1-app51.base.akbars.ru/ | head -n 1
curl -sI http://t-lmts1-app51.base.akbars.ru/company/7702070139 | head -n 1
curl -sI http://t-lmts1-app51.base.akbars.ru/old-prototype/ | head -n 1
curl -s http://t-lmts1-app51.base.akbars.ru/api/health
curl -sI http://t-lmts1-app51.base.akbars.ru/assets/missing.js | head -n 1
```

`/` и deep link — HTML React. `/assets/missing.js` — 404, не `index.html`. `/api/health` — JSON FastAPI.

Чарт локально (без кластера): `helm lint deployment/helm-chart/limitmodule` и `helm template lm deployment/helm-chart/limitmodule -f deployment/helm-chart/limitmodule/values-stand.yaml --set postgresql.password=dummy`.
