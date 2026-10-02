# Spec: Alembic для app, витрины снаружи, стенд Helm

Зафиксировано: 2026-10-02. После [2026-09-28](2026-09-28-datahub-marts.md) и [2026-09-29](2026-09-29-group-currency-layout.md). UI и SQL карточки не менялись.

## Зачем

Приложение не владеет DDL витрин DataHub. Локально пустой том всё ещё наполняется снимком `db/local`. На стенде те же файлы гоняет DBeaver; `app.load_log` создаёт только Alembic.

## Данные

- Схемы `sbox_rsk_drt` / `srd` / `app` как раньше. Backend читает только `t_lm_*` и `app.load_log`.
- Initdb (compose, **только пустой том**), порядок: `00` → `10` → `11` → `12` → `90` → `91`. Файла `13_*.sql` нет.
- Alembic: ревизия `001_app_load_log` — схема `app` и таблица `load_log`. Витрины `t_lm_*` в миграции не класть, `CREATE TABLE IF NOT EXISTS` по ним в приложении нет.
- Локально после migrate: `python -m app.seed_local` (одна строка в `load_log`). На стенде seed **не** запускать.
- Нет витрин → карточка/поиск **503** (`Витрины на отображение ещё не загружены`). `/api/health` не падает: `db`, `marts`, `missing_marts`.
- Стенд: хост `t-lmts1-pdb51.base.akbars.ru`, БД `limitmodule`, пользователь `limitmodule_test`. SQL в DBeaver тем же порядком 00→91. Повтор 10–12 на живых таблицах без DROP нельзя.

## Подключение

DSN из `POSTGRES_HOST` / `PORT` / `DB` / `USER` / `PASSWORD` (`api/app/db.py`), либо целиком `DATABASE_URL`. Пароль в git не класть (`.env` в `.gitignore`, в Helm `--set postgresql.password`).

Compose: Redis и nginx убраны. API сам на `:8000` отдаёт фронт (`WEB_DIR`). Локальный Postgres в контейнере `db`; на хосте порт часто занят — `POSTGRES_PUBLISH_PORT`.

## Стенд (Kubernetes)

- Чарт: `deployment/helm-chart/limitmodule`, values стенда `values-stand.yaml`. Сырых манифестов нет.
- Образ: `Dockerfile.prod` в корне `Limit_module/`, контекст `.` (вшиты api + web + Alembic). Сборка `nerdctl --namespace k8s.io` → `t-lmts1-app51/limitmodule:<tag>`, `pullPolicy: IfNotPresent`, без pullSecret.
- Ожидание БД: `python -m app.wait_db` (и `load_log` у initContainer API). Образ postgres не используется.
- Job Alembic: hook `post-install,post-upgrade` (`alembic upgrade head`, без seed).
- Поды в сети кластера, порт контейнера 8000. Снаружи не 8000: Traefik NodePort **30080**. Имя `t-lmts1-app51.base.akbars.ru` без порта — nginx на хосте, конфиг `deployment/nginx/limitmodule.conf` (`:80` → `10.188.128.138:30080`). Команды установки nginx — в `docs/run-stand.md`.
- Ingress: class `traefik`, без TLS и без Middleware (CRD на стенде нет). `hostAliases`: `10.188.0.62` → pdb51.
- Проверка образа без k8s: тот же тег, `nerdctl run -p 8000:8000` и те же `POSTGRES_*`.

## Документация

- Локально: `docs/run-local.md`. Стенд: `docs/run-stand.md`.
- Диаграммы владения схемой из репозитория убраны.

## Не в этой версии

Сборка зелёных `t_lm_*` приложением; загрузчик с DataHub; Postgres/Redis в кластере; Traefik Middleware; пароль БД в values.
