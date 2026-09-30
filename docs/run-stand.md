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

## B. Образ и Helm

Из корня `Limit_module/`:

```bash
sudo nerdctl --namespace k8s.io build \
  --build-arg BASE_IMAGE=artifactory.akbars.tech/docker/library/python:3.12-slim \
  --build-arg PIP_INDEX_URL=https://artifactory.akbars.tech/artifactory/api/pypi/pypi/simple \
  --build-arg PIP_TRUSTED_HOST=artifactory.akbars.tech \
  -f k8s/Dockerfile.prod \
  -t t-lmts1-app51/limitmodule:0.2.0 \
  .
sudo nerdctl --namespace k8s.io image inspect t-lmts1-app51/limitmodule:0.2.0 >/dev/null

helm upgrade --install limitmodule helm-chart/limitmodule \
  -n limitmodule --create-namespace \
  -f helm-chart/limitmodule/values-stand.yaml \
  --set postgresql.password='…' \
  --set image.tag=0.2.0
```

Проверка:

```bash
curl -s http://10.188.128.138:30080/api/health
# db: true; marts: true после SQL из раздела A

curl -s --get 'http://10.188.128.138:30080/api/clients' --data-urlencode 'q=рост'
# ИНН 7707049388 (Ростелеком)

bash k8s/scripts/04-smoke-test.sh
```

Чарт локально (без кластера): `helm lint helm-chart/limitmodule` и `helm template lm helm-chart/limitmodule -f helm-chart/limitmodule/values-stand.yaml --set postgresql.password=dummy`.
