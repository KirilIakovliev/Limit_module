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

Схема и демо-данные накатываются автоматически при первом старте (`db/*.sql`).
Чтобы пересоздать базу с нуля: `docker compose down -v && docker compose up --build`.

## Структура

```
db/01_schema.sql        таблицы + индексы pg_trgm
db/03_search_index.sql  колонка search_name и индексы под подсказки
db/04_groups.sql        группы компаний и единый лимит
db/05_limits.sql        блоки лимитов, заявки, новые компании
db/06_reserves.sql      позиции резервов РСБУ и МСФО
db/02_seed.sql          20 компаний, показатели, лимиты, сублимиты, резервы
api/app/main.py         эндпоинты
api/app/cache.py        обёртка над Redis (работает и без него)
api/scripts/refresh_companies.py   обновление справочника
web/index.html            разметка
web/css/styles.css        стили
web/js/format.js          форматирование чисел и дат
web/js/api.js             единственное место, знающее про бэкенд
web/js/search-bar.js      строка поиска и подсказки
web/js/tab-tree.js        дерево вкладок
web/js/table-views.js     рендер таблиц и списка событий
web/js/events.js          поиск отклонений для вкладки «События»
web/js/excel-export.js    сборка книги Excel по листам
web/js/xlsx-writer.js     генератор XLSX без внешних библиотек
web/js/app.js             связка
web/js/demo-data.js       демо-данные (fallback, если API недоступен)
```

## API

```
GET /api/companies?q=маг&limit=8        поиск по названию или ИНН
GET /api/companies/{id}                 карточка
GET /api/companies/{id}/indicators      баланс / финрезультаты / коэффициенты
GET /api/companies/{id}/limits          лимиты
GET /api/companies/{id}/sublimits       сублимиты
GET /api/companies/{id}/reserves        резервы
GET /api/health
```

## Обновление справочника компаний

Источник истины — Postgres, Redis только кэширует подсказки (TTL 300 с).

```bash
# положить выгрузку в ./data и запустить
docker compose exec api python scripts/refresh_companies.py \
    --file /data/companies.csv --deactivate-missing
```

Джоб грузит источник во временную таблицу, делает один `UPSERT` по ИНН,
помечает исчезнувшие записи `is_active = false` и сбрасывает ключи `search:*`
в Redis. Справочник ни на секунду не остаётся пустым.

Расписание — по вкусу:

```
# ежедневно в 04:30 на хосте
30 4 * * * cd /opt/abb && docker compose exec -T api \
    python scripts/refresh_companies.py --file /data/companies.csv
```

История запусков пишется в таблицу `company_sync_log`.

## Поиск подсказок

Поиск идёт напрямую в Postgres, без кэша. На 200 000 компаний префиксный
запрос отрабатывает за 0,08 мс, потому что `ORDER BY search_name USING ~<~`
совпадает с порядком btree-индекса и скан останавливается на восьмой строке.
Опечатки ловит запасной запрос через `word_similarity`, он запускается, только
если префиксный вернул меньше трёх строк.

Колонка `search_name` и индексы под неё создаются **автоматически при старте
API** (`ensure_schema` в `app/main.py`). Операции идемпотентны, выполняются на
каждом запуске — код и схема не могут разойтись.

Это важно, потому что файлы из `db/` выполняются только при первичной
инициализации пустого тома. На базе, которая уже работает, они не применятся,
и код, ожидающий новую колонку, падал бы с `UndefinedColumn`.

Проверка: в `/api/health` есть поле `search_schema` — должно быть `true`.
Если `false`, смотрите причину в логах API и при необходимости накатите
миграцию руками:

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
Листы: Компания · Баланс · Финрезультаты · Коэффициенты · Лимиты · Сублимиты ·
Информация о резервах. Числа выгружаются числами с форматом `#,##0`, шапка
закреплена, так что в Excel сразу работают фильтры и формулы.

## Смена демо-данных на реальные

1. Заменить `db/02_seed.sql` на загрузку из вашей витрины.
2. Удалить `web/js/mock.js` и подключение к нему из `index.html`,
   а также `withFallback` из `web/js/api.js`.
