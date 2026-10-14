# Spec: React на `/`, API отдельно, стенд через host nginx

Зафиксировано: 2026-10-14. Отменяет в [2026-10-02](2026-10-02-alembic-helm-stand.md) раздачу страниц процессом API, `WEB_DIR` и копирование `web/` в образ. Данные, Alembic и pod API из той spec остаются.

Контракт чтения витрин — [2026-09-28](2026-09-28-datahub-marts.md). Карточка ГК — [2026-09-29](2026-09-29-group-currency-layout.md), экран теперь React. Авторизации нет. ИНН и деньги в API — строки. Даты API не разбирать через `Date`.

## Экраны

Новый UI — React в `frontend/`. Маршруты: `/` (поиск) и `/company/:inn`. Обновление адреса карточки отдаёт тот же `index.html`.

- Поиск по названию или ИНН, от 3 символов. Карточка: «Общая информация», «Лимиты», «Лимиты на рассмотрении».
- «Резервы» на экране выключены. «События» — зона в шапке карточки, не вкладка. Список считается в браузере и помечен «в разработке», отдельного API нет.
- Excel — одна кнопка. Книгу собирает API (XlsxWriter): листы `info`, `limits`, `applications`, `reserves`. Лист резервов — текст «Источник данных не подключён», без строк витрины.
- Старый прототип остаётся на `/old-prototype/`: `web/old-prototype/`, запросы к `/api`. Ссылки на CSS и JS абсолютные, с префиксом `/old-prototype/`.

`/next` нет: ни редиректа, ни каталога публикации.

## Кто что отдаёт

FastAPI не отдаёт HTML, JS и CSS. Нет SPA fallback, `StaticFiles` и `WEB_DIR`. `/api/health` без `web_dir` и `web_mounted`.

Один внешний origin. Клиент ходит на относительный `/api`. Новый CORS не добавляется; уже стоящий `allow_origins=["*"]` не расширять.

| Путь | Кто отвечает |
|---|---|
| `/`, `/company/...`, прочие адреса без файла | React, fallback на `index.html` |
| `/assets/*` | файл сборки; нет файла — 404, не `index.html` |
| `/old-prototype/` | файлы прототипа; нет файла — 404 |
| `/api/*` | FastAPI, в том числе 404 JSON |
| `/docs`, `/redoc`, `/openapi.json` | FastAPI |

Контракт между UI и API — OpenAPI (`frontend/openapi.json`, типы `frontend/src/api/schema.ts`).

## Локально

`docker-compose.yml`: `db`, `migrate`, `api`, `web`.

- `web` — уже имеющийся `nginx:1.27-alpine`, порт хоста `8000`. Конфиг `frontend/nginx.conf`. Сборка с диска `frontend/dist`, прототип с диска `web/old-prototype`.
- `api` — `api/Dockerfile`, порт хоста `8001`. Volume только `./api/app`. Страниц в контейнере нет.
- `npm run dev` проксирует `/api` на `127.0.0.1:8001` и `frontend/nginx.conf` не использует.

## Стенд

Второй nginx в Kubernetes не добавлять. Helm по-прежнему один контейнер API. `WEB_DIR` из ConfigMap и values убран.

- Образ API: `Dockerfile.prod`. Base `artifactory.akbars.tech/docker/library/python:3.12-slim`, pip — Artifactory. В образе нет React, `web/`, Node и nginx. Тег и Job Alembic как в spec 2026-10-02.
- Сборка UI: `frontend/Dockerfile`, только stage Node `artifactory.akbars.tech/common-docker-local/trustedimages/alpine/node:20-abdt`. Итог `/app/dist`. Runtime-образа nginx для стенда нет.
- npm: `frontend/.npmrc`, registry `https://artifactory.akbars.tech/artifactory/api/npm/npm/`, `replace-registry-host=npmjs`. Токен в git не хранить. Если Artifactory закрыт — `--secret id=npmrc,src=$HOME/.npmrc`.
- Host nginx уже установлен. Конфиг `deployment/nginx/limitmodule.conf`. React: `/var/www/limitmodule/app`. Прототип: `/var/www/limitmodule/old-prototype`. `/api/`, `/docs`, `/redoc`, `/openapi.json` проксируются на `10.188.128.138:30080` без обрезки пути. Сначала успешный dist, затем `rsync --delete`. `nginx -t` до reload. Команды — `docs/run-stand.md`.

## Не в этой версии

Загрузчик витрин; Postgres и Redis в кластере; выключение уже стоящего CORS; шрифтовые файлы Manrope/Inter (в прототипе остаются системные запасные); Swagger UI без `cdn.jsdelivr.net`; выкладка этой spec на `t-lmts1-app51` (образы и nginx там ещё по предыдущей схеме, пока не выполнен `docs/run-stand.md`).
