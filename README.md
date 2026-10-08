# Лимитный модуль АББ

Просмотр лимитов: поиск клиента по названию или ИНН, затем карточка. Backend читает готовые витрины PostgreSQL и сам их не собирает.

Стек: PostgreSQL 16 и FastAPI. API и страница отдаются одним процессом на `:8000`.

## Локальный запуск

Из корня репозитория:

```bash
cp .env.example .env
docker compose up --build
```

Открыть http://localhost:8000.

| | |
|---|---|
| Интерфейс | http://localhost:8000 |
| Health | http://localhost:8000/api/health |
| Swagger | http://localhost:8000/docs |
| Postgres | `localhost:5433` (`limitmodule_test` / `limitmodule`, пароль в `.env`) |

Сервис `migrate` применяет Alembic (только `app.load_log`) и локальный seed. Снимок витрин попадает в базу только при пустом томе. Порт занят: `POSTGRES_PUBLISH_PORT=5434 docker compose up --build`. Пересоздание тома и правки миграций: [docs/run-local.md](docs/run-local.md).

Если `docker pull` падает с `TLS handshake timeout`, это сеть до Docker Hub, не compose. Повторить pull или перенести образы `postgres:16-alpine` и `python:3.12-slim` через `docker save` / `docker load`.

`{"detail":"Not Found"}` на `/` значит, что API жив, а каталог фронтенда не смонтирован. В `curl localhost:8000/api/health` смотреть `web_mounted`; в контейнере должен быть `/srv/web/index.html`.

## Тесты

Нужна база из compose. Перед правками — строгий прогон: без Postgres он падает, а не становится зелёным skip.

```bash
docker compose up -d
cd api
REQUIRE_TEST_DB=1 pytest
```

Обычный `pytest` без переменной по-прежнему пропускает тесты, если базы нет.

Фрагменты UI на месте:

```bash
python3 tools/verify_build.py
```

## Где что лежит

| | |
|---|---|
| Backend | `api/app` — `main.py`, `queries.py`, `db.py`, `models.py` |
| Миграции приложения | `api/alembic` — схема `app`, не витрины |
| Frontend | `web/`. Excel собирается в браузере, файл `web/js/xlsx-writer.js` |
| Локальный снимок БД | `db/local/` — `00`, `10`–`12` DDL, `90`–`91` фикстуры |
| Стенд | [docs/run-stand.md](docs/run-stand.md), чарт `deployment/helm-chart/limitmodule`, nginx `deployment/nginx/limitmodule.conf` |
| Спецификации | [specs/current.md](specs/current.md) |
| Контекст и исходный DDL | соседний каталог `context/` — **не в этом git**. DDL: `context/data/ddl` |

Переход с прототипа: [docs/database_migration.md](docs/database_migration.md). Типы Impala → PostgreSQL: [docs/ddl_conversion.md](docs/ddl_conversion.md).

Склейка страницы в один файл для просмотра без сервера (не способ разработки): `python3 tools/build_preview.py` пишет локальный `preview.html`, в git он не хранится.
