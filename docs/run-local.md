# Локальный запуск

`.env` лежит в корне `Limit_module/` — рядом с `docker-compose.yml`. Если файла нет:

```bash
cp .env.example .env
```

Пароли в git не класть: `.env` в `.gitignore`.

## Заполняет ли подъём базу данными?

Да, но только на **пустом томе**.

1. Postgres видит пустой `PGDATA` и выполняет `db/local/*.sql` по имени:
   `00` расширения и схемы → `10`–`12` DDL витрин и серого слоя → `90` справочники → `91` моки `t_lm_*` (Ростелеком, ГК ВТБ, МТС-Банк и остальные сценарии).
2. Сервис `migrate` создаёт `app.load_log` (Alembic) и пишет тестовую строку актуальности.

Том уже был (`docker compose up` без `-v`) — скрипты **не** повторятся, данные как в прошлый раз. Чтобы наполнить с нуля: `docker compose down -v && docker compose up --build`.

Чтобы стучаться с локального API в стендовую базу, в `.env` выставить `POSTGRES_HOST=t-lmts1-pdb51.base.akbars.ru`, порт `5432` и пароль стенда (контейнер `db` тогда не используется). Обычный локальный контур — хост `db`, см. `.env.example`.

## С нуля

```bash
cp .env.example .env          # если ещё нет
docker compose down -v
docker compose up --build
# порт на хосте занят: POSTGRES_PUBLISH_PORT=5434 docker compose up --build
```

Открыть http://localhost:8000. База: `limitmodule`, пользователь `limitmodule_test` (пароль в `.env`, по умолчанию `localdev`).

```bash
curl -s http://localhost:8000/api/health
# db: true, marts: true, missing_marts: []

curl -s 'http://localhost:8000/api/clients?q=рост'
# есть ИНН 7707049388

docker compose exec api alembic current
# 001_app_load_log (head)

docker compose exec db psql -U limitmodule_test -d limitmodule -c \
  "SELECT count(*) FROM sbox_rsk_drt.t_lm_1_2_clients;"
```

Экран: Ростелеком `7707049388`; ГК ВТБ — две валюты в одном блоке; события на МТС-Банке `7702045051`.

## Как менять схему приложения и накатывать миграции

Alembic трогает **только** схему `app` (сейчас `load_log`). Витрины `t_lm_*` сюда не класть.

1. Новая ревизия — из каталога `api/` (там `alembic.ini`):

```bash
cd api
DATABASE_URL=postgresql://limitmodule_test:localdev@localhost:5433/limitmodule \
  alembic revision -m "кратко зачем"
```

2. В новом файле `api/alembic/versions/` в `upgrade()` — SQL, как в `001_app_load_log.py` (`op.execute("""...""")`). Не описывать витрины.

3. Применить к уже поднятой локальной базе (том не трогать):

```bash
docker compose exec api alembic upgrade head
docker compose exec api alembic current
```

Повторный `upgrade head` безопасен. Сервис `migrate` при следующем `up` с нуля сам догонит head.

Откат (редко): `docker compose exec api alembic downgrade -1`.

## Как менять снимок витрин (локальные `t_lm_*`)

Править `db/local/10_*.sql` … `91_*.sql`. На **живой** базе файлы сами не применятся. Пересоздать том:

```bash
docker compose down -v && docker compose up --build
```

Либо один скрипт руками (только отладка):

```bash
docker compose exec -T db psql -U limitmodule_test -d limitmodule < db/local/10_sbox_rsk_drt_marts.sql
```

На стенд эти файлы не копировать — см. [run-stand.md](run-stand.md).
