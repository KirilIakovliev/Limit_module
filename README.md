# Лимитный модуль АББ — прототип v2

Стек: PostgreSQL 16 + Redis 7 + FastAPI + статический фронтенд за nginx.

## Запуск

```bash
cp .env.example .env
docker compose up --build
```

Открыть http://localhost:8000 — FastAPI раздаёт и API, и фронтенд.
Тянутся два образа: `postgres:16-alpine` и `python:3.12-slim`.

Полный вариант с nginx и Redis (ещё два образа):

```bash
echo "REDIS_URL=redis://cache:6379/0" >> .env
docker compose --profile full up --build      # http://localhost:8080
```

### Без Docker

Фронтенд разбит на отдельные файлы, поэтому его нужно **отдавать веб-сервером**,
а не открывать `web/index.html` двойным кликом — при открытии как файл браузер
не подтянет `css/` и `js/`, и страница отрисуется без стилей.

```bash
cd web && python3 -m http.server 5173     # http://localhost:5173
```

Без бэкенда интерфейс работает на демо-данных из `web/js/mock.js`.

Если нужен ровно один файл (показать коллеге, открыть двойным кликом):

```bash
python3 tools/build_preview.py            # -> preview.html
```

| Сервис | Адрес |
|---|---|
| Интерфейс | http://localhost:8000 (с профилем full — :8080) |
| Проверка API | http://localhost:8000/api/health |
| Swagger | http://localhost:8000/docs |
| Postgres | localhost:5433 (abb/abb) |

### `{"detail":"Not Found"}` на http://localhost:8000

Значит, API поднялся, а фронтенд ему не отдали. Проверить:

```bash
curl localhost:8000/api/health        # смотреть поле web_mounted
docker compose exec api ls /srv/web   # должен быть index.html
docker compose logs api | grep фронтенд
```

Чаще всего причина — старый `docker-compose.yml` без тома `./web:/srv/web:ro`
и переменной `WEB_DIR`. Лечится так:

```bash
docker compose down
docker compose up --build
```

В свежей версии вместо голого 404 на `/` открывается страница с подсказкой.

### Если образ не скачивается

`TLS handshake timeout` при обращении к `registry-1.docker.io` — это сеть,
а не конфигурация проекта. По порядку:

```bash
docker pull postgres:16-alpine        # проверить, воспроизводится ли отдельно
docker logout                         # иногда помогает протухшая сессия
```

1. **Корпоративный прокси.** Демону Docker нужны свои настройки, переменные
   окружения оболочки он не читает. Docker Desktop: Settings -> Resources -> Proxies.
   Linux: `/etc/systemd/system/docker.service.d/http-proxy.conf` с
   `Environment="HTTPS_PROXY=http://proxy:3128"`, затем
   `systemctl daemon-reload && systemctl restart docker`.
2. **Зеркало реестра.** В `/etc/docker/daemon.json` (или Docker Desktop ->
   Docker Engine) добавить свой Nexus/Artifactory:
   `{"registry-mirrors": ["https://registry.company.ru"]}`.
3. **Перенос образов вручную**, если реестр недоступен в принципе:
   ```bash
   # на машине с доступом
   docker pull postgres:16-alpine && docker pull python:3.12-slim
   docker save postgres:16-alpine python:3.12-slim -o abb-images.tar
   # на целевой машине
   docker load -i abb-images.tar
   ```
4. Просто повторить `docker compose up` — таймаут рукопожатия часто разовый.

Схема копий DataHub и тестовые данные накатываются при первом старте (`db/*.sql`).
Чтобы пересоздать базу с нуля: `docker compose down -v && docker compose up --build`.
Описание перехода: [docs/database_migration.md](docs/database_migration.md), spec — [specs/current.md](specs/current.md).
Курс в `course/` описывает **прототип v0** (изобретённая схема) и не обновлялся.

## Структура

```
db/00_extensions.sql              pg_trgm, схемы sbox_rsk_drt / srd / app
db/10_sbox_rsk_drt_marts.sql      копии итоговых витрин t_lm_*
db/11_sbox_rsk_drt_refs.sql       копии ручных справочников stg_file_*
db/12_srd_replicas.sql            копии реплик corpgen_* и t_util
db/13_app_technical.sql           app.load_log
db/90_test_refs.sql               реальные INSERT справочников (trim)
db/91_test_marts.sql              моки витрин + строка load_log
api/app/db.py                     пул, search_path
api/app/queries.py                SQL к витринам
api/app/models.py                 модели ответов (Decimal → строка)
api/app/main.py                   /api/clients, /api/groups, /api/meta
web/js/api.js                     клиент API (ключ — ИНН)
web/js/tab-tree.js                дерево вкладок по БТ
web/js/table-views.js             таблицы карточки / ГК / лимитов
specs/current.md                  зафиксированная spec этой версии
docs/database_migration.md        переход с прототипа
docs/ddl_conversion.md            Impala → PostgreSQL, GAP
```

## API

```
GET /api/clients?q=&limit=          поиск по наименованию или ИНН
GET /api/clients/{inn}              карточка клиента
GET /api/clients/{inn}/limits       лимиты и потенциальные сделки
GET /api/groups/{crm_id}            структура ГК
GET /api/meta                       дата загрузки копии (app.load_log)
GET /api/health
```

## Данные

Источник истины по структуре — DDL команды данных (`context/data/ddl`).
Backend читает только итоговые витрины `t_lm_*`. Передача копии из DataHub
в PROD не реализована (контракта нет); на TEST данные из `db/90–91`.

## Поиск подсказок

Поиск идёт напрямую в `t_lm_1_2_clients`: префикс ИНН или `ILIKE` по
наименованию, запасной путь — оператор `<%` (pg_trgm). Дедупликация —
`DISTINCT ON (uparty_inn_code)` с предпочтением `source = datahub`.
Индексы на копиях не создаются, пока `EXPLAIN ANALYZE` на PROD-объёме
не покажет необходимость (см. docs/database_migration.md).

```bash
docker compose exec -T db psql -U abb -d abb < db/03_search_index.sql
```

## Проверка сборки

Если после обновления файлов интерфейс выглядит по-старому, сначала проверьте,
что правки вообще попали в `web/`:

```bash
python3 tools/verify_build.py
```

Скрипт ищет ключевые фрагменты в css и js и печатает версию ресурсов.
Ссылки на стили и скрипты в `index.html` идут с параметром `?v=…`, поэтому
браузер обязан перечитать их после каждой правки. Если версия не менялась,
пересоберите её и обновите страницу с `Cmd/Ctrl + Shift + R`.

## Выгрузка в Excel

Кнопка «Выгрузить в Excel» собирает файл прямо в браузере — бэкенд не участвует,
внешних библиотек нет (`web/js/xlsx.js` — генератор XLSX на ~180 строк).
Листы: Компания · Группа компаний · Лимиты · Заявки. ИНН выгружается текстом.
Транши и резервы в файл не попадают — источника в текущем DDL нет.

## Смена тестовых данных

1. Обновить `db/90_test_refs.sql` скриптом `tools/convert_ref_inserts.py`.
2. Дописать сценарии в `db/91_test_marts.sql` строго по колонкам DDL.
3. Пересоздать том: `docker compose down -v && docker compose up --build`.
