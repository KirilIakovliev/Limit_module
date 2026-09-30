# Тестовый стенд

База уже есть: хост **`t-lmts1-pdb51.base.akbars.ru`**, БД **`limitmodule`**, пользователь **`limitmodule_test`**.  
Пароль — переменная `POSTGRES_PASSWORD` в `k8s/app/01-secret.yaml` (сейчас пустая). На прод сменить `POSTGRES_HOST` в том же Secret.

`db/local` и `90`/`91` на стенд не копировать. Витрины `t_lm_*` создаёт сборщик. Этот репозиторий накатывает только `app` (Alembic).

Приложение не содержит хост в коде: DSN собирается из `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (`api/app/db.py`). Либо целиком `DATABASE_URL`, если его задать.

## Порядок файлов

Подставить пароль в `k8s/app/01-secret.yaml` → `POSTGRES_PASSWORD`. Postgres в кластере **не** поднимать (`04`/`05` не нужны).

| Шаг | Файл | Зачем |
|---|---|---|
| 1 | `k8s/app/00-namespace.yaml` | namespace `abb` |
| 2 | `k8s/app/01-secret.yaml` | хост, порт, БД, пользователь, **пароль** |
| 3 | `k8s/app/02-configmap.yaml` | `REPLICA_SCHEMA`, `WEB_DIR` |
| 4 | `k8s/app/06-alembic-job.yaml` | `alembic upgrade head` → `app.load_log` |
| 5 | `k8s/app/06-api.yaml` | API; ждёт хост из Secret и таблицу `app.load_log` |
| 6 | `k8s/app/07-ingress.yaml` | вход снаружи |

```bash
# в 01-secret.yaml: POSTGRES_PASSWORD

kubectl apply -f k8s/app/00-namespace.yaml
kubectl apply -f k8s/app/01-secret.yaml
kubectl apply -f k8s/app/02-configmap.yaml

kubectl apply -f k8s/app/06-alembic-job.yaml
kubectl -n abb wait --for=condition=complete job/abb-alembic --timeout=180s

kubectl apply -f k8s/app/06-api.yaml
kubectl apply -f k8s/app/07-ingress.yaml
```

С машины, если Job неудобен:

```bash
cd api
export POSTGRES_HOST=t-lmts1-pdb51.base.akbars.ru
export POSTGRES_PORT=5432
export POSTGRES_DB=limitmodule
export POSTGRES_USER=limitmodule_test
export POSTGRES_PASSWORD='…'
alembic upgrade head
alembic current
```

Проверка: `/api/health` — `db: true`; `marts: true`, когда на сервере есть `t_lm_*`.

Повторный Job: `kubectl -n abb delete job abb-alembic` и apply снова.

Прод: в Secret поменять `POSTGRES_HOST` (и пользователя, если другой), перевыкатить API и Job.

`03`/`04`/`05` — только если когда-нибудь понадобится Postgres внутри кластера, не для этого стенда.
