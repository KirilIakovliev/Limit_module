#!/usr/bin/env python3
"""
Собирает HANDOFF.md — сводку проекта с кодом, решениями и граблями.

Код в документ вставляется НЕ вручную, а вырезается из настоящих файлов,
поэтому сводка не может разойтись с проектом. Повторный запуск перезаписывает
файл целиком.

    python3 tools/build_handoff.py
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "HANDOFF.md"


def grab(path: str, start: str, end: str | None = None, limit: int = 300) -> str:
    """Вырезает фрагмент файла от строки со start до строки с end."""
    lines = (ROOT / path).read_text(encoding="utf-8").split("\n")
    i = next((n for n, l in enumerate(lines) if re.search(start, l)), None)
    if i is None:
        return f"[ФРАГМЕНТ НЕ НАЙДЕН: {start} в {path}]"
    j = len(lines)
    if end:
        j = next((n for n in range(i + 1, len(lines)) if re.search(end, lines[n])), len(lines))
    return "\n".join(lines[i:min(j, i + limit)]).rstrip()


def whole(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8").rstrip()


def block(lang: str, code: str) -> str:
    return f"```{lang}\n{code}\n```"


def tree() -> str:
    result = subprocess.run(
        ["find", ".", "-type", "f", "-not", "-path", "./.git/*",
         "-not", "-path", "*/__pycache__/*", "-not", "-name", "*.pyc"],
        cwd=ROOT, capture_output=True, text=True,
    )
    files = sorted(p[2:] for p in result.stdout.strip().split("\n"))
    return "\n".join(files)


def counts() -> str:
    rows = []
    for path in ["web/index.html", "web/css/styles.css", "web/js/format.js", "web/js/api.js",
                 "web/js/demo-data.js", "web/js/search-bar.js", "web/js/tab-tree.js",
                 "web/js/table-views.js", "web/js/events.js", "web/js/xlsx-writer.js",
                 "web/js/excel-export.js", "web/js/app.js", "api/app/main.py", "api/app/cache.py",
                 "db/01_schema.sql", "db/02_seed.sql", "db/03_search_index.sql",
                 "db/04_groups.sql", "db/05_limits.sql", "db/06_reserves.sql"]:
        n = len((ROOT / path).read_text(encoding="utf-8").split("\n"))
        rows.append(f"| `{path}` | {n} |")
    return "\n".join(rows)


DOC = f"""# Лимитный модуль АББ — сводка проекта

Документ для передачи проекта: что построено, какой код за это отвечает,
какие решения приняты и почему, на какие грабли уже наступили.

Код в документе вырезан из настоящих файлов скриптом `tools/build_handoff.py`,
поэтому не расходится с проектом. Пересобрать: `python3 tools/build_handoff.py`.

---

## 1. Что это

Прототип банковского модуля лимитов: поиск компании, карточка клиента,
финансовая отчётность, лимиты, сублимиты, резервы, события (отклонения) и
выгрузка всего этого в Excel.

**Запуск:**

```bash
cp .env.example .env
docker compose up --build        # -> http://localhost:8000
```

**Состояние:** рабочий прототип. Что сделано и чего нет — раздел 9.

**Данные:** 28 компаний, 4 группы компаний, 164 лимита, 2464 финансовых
показателя, 144 позиции резервов, 33 заявки. Всё сгенерировано детерминированно
из `id`, поэтому воспроизводится одинаково.

---

## 2. Архитектура

```
Браузер (HTML/CSS/ванильный JS)
    │  HTTP + JSON
    ▼
API (Python 3.12, FastAPI, psycopg 3)
    │  SQL
    ▼
PostgreSQL 16 (+ pg_trgm)
```

Redis есть в стеке, но в работе не участвует — см. решение 3.1.
nginx опционален (профиль `full`), по умолчанию статику раздаёт сам FastAPI.

### Размеры файлов

| Файл | Строк |
|---|---|
{counts()}

### Дерево проекта

```
{tree()}
```

---

## 3. Принятые решения и их обоснование

### 3.1. Поиск ходит прямо в Postgres, а не через кэш в Redis

Проверено замером на 200 000 компаний:

| Операция | Postgres | Снимок в Redis |
|---|---|---|
| Префиксный поиск, есть совпадения | 0,08 мс | 0,10 мс |
| Поиск **без совпадений** | 0,08 мс | **45 мс** |
| Разбор снимка при обновлении | — | 459 мс |
| Размер снимка | — | 25,2 МБ |

Кэш оказался в 560 раз медленнее базы в самом частом сценарии: пользователь
печатает, и половина префиксов ничего не находит. Postgres идёт по индексу за
`log(n)` шагов, перебор списка в памяти линеен.

**Вывод:** кэшировать индексированный запрос бессмысленно. Redis остался
опциональным сервисом (профиль `full`) и обслуживает только `/api/meta`.

### 3.2. `ORDER BY ... USING ~<~` вместо обычной сортировки

Один и тот же запрос, один и тот же индекс, 200 000 строк:

```
ORDER BY search_name            ->  11,992 мс   (Sort по 16 667 строкам)
ORDER BY search_name USING ~<~  ->   0,044 мс   (Index Scan, 8 строк)
```

Разница в **270 раз**. Индекс `text_pattern_ops` хранит значения в порядке
C-локали; обычный `ORDER BY` требует порядка по правилам языка — это другой
порядок, поэтому база читает все совпадения и сортирует. `USING ~<~` просит
тот же оператор, что в индексе.

**Признак проблемы:** строка `Sort` в плане при наличии `LIMIT`.

### 3.3. Генерируемая колонка `search_name`

В базе «ООО Магнит», пользователь печатает «магн» — префиксный поиск не
сработает. Колонка считается базой автоматически:

{block("sql", grab("db/03_search_index.sql", r"^ALTER TABLE companies", r"^-- btree"))}

### 3.4. «Единый сублимит» считается, а не хранится

По глоссарию это совокупность лимитов корпоративного и инвестиционного блоков
на конкретного клиента. Отдельное хранение рано или поздно разошлось бы со
слагаемыми, поэтому значение считается в API суммой лимитов клиента.

### 3.5. Миграции идемпотентны и применяются при старте API

Файлы из `db/` Postgres выполняет только при инициализации **пустого тома**.
На работающей базе они молча игнорируются — мы на этом потеряли время
(`column "search_name" does not exist`). Решение — те же операции при каждом
старте API:

{block("python", grab("api/app/main.py", r"^def ensure_schema", r"^@asynccontextmanager"))}

**Цена:** миграции выполняются на каждом запуске, поэтому должны оставаться
дешёвыми. `CREATE INDEX` на большой таблице так гонять нельзя — для этого
нужен полноценный инструмент миграций (Alembic/Flyway).

### 3.6. Чистый JavaScript без фреймворка

Нет сборки, нет npm, правка видна после F5. Обратная сторона: состояние
интерфейса ведётся вручную в объекте `state` (`web/js/tab-tree.js`).
Признак, что пора на фреймворк — когда одно изменение приходится вносить в
трёх местах состояния.

### 3.7. Excel генерируется в браузере без библиотек

SheetJS весит ~900 КБ и тянется с CDN, которого в закрытом контуре нет. Свой
генератор — 197 строк: ZIP без сжатия (метод STORE) + OOXML.

---

## 4. База данных

### 4.1. Схема

```
companies ──┬── financial_indicators   показатели по годам (длинный формат)
            ├── limits ── sublimits    лимиты по блокам и транши
            ├── reserve_positions      резервы РСБУ/МСФО
            ├── limit_applications     заявки на рассмотрении
            ├── group_sublimits        сублимит внутри ГК
            └── company_groups         группа компаний
```

{block("sql", grab("db/01_schema.sql", r"^CREATE TABLE companies", r"^CREATE INDEX|^-- ---"))}

Показатели хранятся в «длинном» формате — по строке на (компания, показатель,
год). Новый год или показатель не меняет схему:

{block("sql", grab("db/01_schema.sql", r"^CREATE TABLE financial_indicators", r"^CREATE INDEX|^-- ---"))}

### 4.2. Порядок миграций

| Файл | Что делает |
|---|---|
| `01_schema.sql` | таблицы, индексы, расширение `pg_trgm` |
| `02_seed.sql` | 20 компаний и сгенерированные данные |
| `03_search_index.sql` | колонка `search_name`, btree + GIN индексы |
| `04_groups.sql` | группы компаний, единый лимит, атрибуты (ОГРН, адрес, ОКВЭД) |
| `05_limits.sql` | блоки лимитов, заявки, 8 новых компаний (в т.ч. длинные названия) |
| `06_reserves.sql` | позиции резервов РСБУ и МСФО |

Файлы 04–06 дополнительно выполняются при старте API (см. 3.5).

### 4.3. Индексы под поиск

{block("sql", grab("db/03_search_index.sql", r"^-- btree", r"^ANALYZE"))}

---

## 5. Бэкенд

Весь бэкенд — `api/app/main.py` ({len(whole("api/app/main.py").split(chr(10)))} строк) и `api/app/cache.py`.

### 5.1. Пул соединений и выполнение запросов

{block("python", grab("api/app/main.py", r"^db_pool = ", r"^FRONTEND_DIR|^# ---"))}

{block("python", grab("api/app/main.py", r"^def db_query", r"^def decimal_to_float|^DECIMAL|^def to_jsonable"))}

**Параметризация обязательна.** Склейка строк даёт SQL-инъекцию — проверено:
ввод `' OR '1'='1` через склейку вернул все 28 строк, через параметр — 0.

### 5.2. Жизненный цикл

{block("python", grab("api/app/main.py", r"^@asynccontextmanager", r"^app = FastAPI"))}

### 5.3. Поиск

{block("python", grab("api/app/main.py", r"^# 1\. Основной путь", r"^@app\.get\(\"/api/companies\"\)"))}

{block("python", grab("api/app/main.py", r"^@app\.get\(\"/api/companies\"\)", r"^@app\.get\(\"/api/meta\"\)"))}

### 5.4. Лимиты: группировка и расчёт единого сублимита

{block("python", grab("api/app/main.py", r"^BLOCK_TITLES", r"sublimits", limit=60))}

### 5.5. Диагностика

{block("python", grab("api/app/main.py", r"^@app\.get\(\"/api/health\"\)", r"^# ----|^if FRONTEND_AVAILABLE"))}

Поведение при недоступной базе проверено:

- база упала **на ходу** → `status: "degraded"`, `db: false`, сервис отвечает;
- база недоступна **в момент старта** → API не поднимается вовсе
  (`PoolTimeout: pool initialization incomplete after 30 sec`). Это сознательно:
  лучше упасть заметно, чем отвечать ошибкой на каждый запрос.

### 5.6. Заголовки кэширования

{block("python", grab("api/app/main.py", r"^@app\.middleware", r"^@app\.get|^SEARCH_SCHEMA_SQL|^def ", limit=25))}

### 5.7. Полный список эндпоинтов

```
GET /api/companies?q=&limit=      поиск (префикс -> нечёткий)
GET /api/companies/{{id}}           карточка
GET /api/companies/{{id}}/profile   атрибуты + группа компаний
GET /api/companies/{{id}}/indicators баланс/финрезультаты/коэффициенты
GET /api/companies/{{id}}/limits    блоки лимитов, единый сублимит, заявки
GET /api/companies/{{id}}/sublimits  транши
GET /api/companies/{{id}}/reserves   РСБУ/МСФО
GET /api/groups/{{id}}              структура группы компаний
GET /api/meta                     когда справочник обновлялся
GET /api/health                   состояние сервиса
```

---

## 6. Фронтенд

Модули подключаются по порядку, каждый — IIFE, наружу отдаёт один объект.

### 6.1. `format.js` — форматирование и защита

{block("javascript", whole("web/js/format.js"))}

`escape` обязателен везде, где значение попадает в HTML-строку: без него имя
вида `<script>...</script>` выполнится как код.

### 6.2. `api.js` — единственное место, знающее про сервер

{block("javascript", whole("web/js/api.js"))}

**Важно для продакшена:** `withFallback` подменяет отказ бэкенда демо-данными.
Это удобно для показа, но опасно в эксплуатации — удалить вместе с
`demo-data.js`.

### 6.3. `search-bar.js` — debounce и защита от гонки

{block("javascript", grab("web/js/search-bar.js", r"^  input\.addEventListener\('input'", r"^  function renderDropdown"))}

Два приёма:

- **debounce 160 мс** — запрос уходит только после паузы в наборе;
- **счётчик запросов** — ответ применяется, только если он на самый свежий
  запрос. Без него медленный ответ на «маг» перезаписывает быстрый на «магнит».

### 6.4. `tab-tree.js` — дерево вкладок и геометрия

Состояние всего интерфейса — один объект:

{block("javascript", grab("web/js/tab-tree.js", r"^  const state = \{", r"^  const tabNodes"))}

Измерение положения без учёта анимации:

{block("javascript", grab("web/js/tab-tree.js", r"^  function offsetWithin", r"^  function offsetWithinY|^  const openTab|^  /\*", limit=12))}

`offsetLeft` возвращает раскладку **до** `transform`, поэтому измерения не
зависят от текущего кадра анимации. `getBoundingClientRect()` здесь не подходит.

Подбор ширины верхней строки в два подхода:

{block("javascript", grab("web/js/tab-tree.js", r"^  function measureRow", r"^  /\* Стрелки ставятся"))}

Выравнивание строк по фиксированной границе:

{block("javascript", grab("web/js/tab-tree.js", r"^  function layoutBranch", r"^  function visibleRows"))}

### 6.5. `events.js` — детектор отклонений

{block("javascript", grab("web/js/events.js", r"^  /\* ---------- медиана", r"^  /\* ---------- отклонения"))}

Медиана вместо среднего: одно аномальное значение сдвигает среднее и маскирует
отклонение. Направление («рост — это хорошо или плохо») задаётся словарём
`DIRECTION` — без него система флагировала бы любое движение.

### 6.6. `xlsx-writer.js` — ZIP и OOXML вручную

{block("javascript", grab("web/js/xlsx-writer.js", r"^  const CRC", r"^  function zip|^  /\* ---------- ZIP"))}

Числа обязаны писаться как числа, иначе формулы Excel по ним не работают:

{block("javascript", grab("web/js/xlsx-writer.js", r"return typeof obj\.v === 'number'", r"^\s*\}$", limit=5))}

### 6.7. `app.js` — связка

{block("javascript", grab("web/js/app.js", r"^  async function loadCompany", r"^  /\* ---------- плавающая панель"))}

Пять запросов уходят параллельно: общее время равно самому долгому, а не сумме.

---

## 7. Интерфейс: приёмы вёрстки

### 7.1. Одинаковая ширина карточек во всех рядах

Ширина считается как доля **самого ёмкого** ряда, а не делением текущего:

{block("css", grab("web/css/styles.css", r"^  --tab-basis:calc", r"^  display:flex"))}

### 7.2. Подбор ширины верхней строки

Реквизиты ИНН и КПП нельзя переносить: число, разорванное на две строки,
читается как ошибка. JS замеряет карточки в двух режимах (`max-content` и
`min-content`) и назначает ширину обеим боковым вкладкам:

{block("css", grab("web/css/styles.css", r"^\.tab-row\.is-measuring-whole", r"^/\* ---"))}

### 7.3. Плавное раскрытие уровня

{block("css", grab("web/css/styles.css", r"^\.tab-level\{", r"^\.tab-branch|^/\* ---"))}

`height: 0 → auto` не анимируется, `grid-template-rows: 0fr → 1fr` — да.
`overflow: hidden` на ребёнке обязателен.

### 7.4. Контекст наложения

{block("css", grab("web/css/styles.css", r"^/\* transform создаёт контекст", r"^\.page-title-wrap"))}

`transform` создаёт контекст наложения: `z-index` подсказок действовал только
внутри `.hero`, и панель результатов рисовалась поверх. Лечится заданием
порядка самим контекстам.

---

## 8. Грабли: на что обращать внимание

| Симптом | Причина | Лечение |
|---|---|---|
| `column "search_name" does not exist` | файлы из `db/` выполняются только на пустом томе | миграции при старте API (`ensure_schema`) |
| Интерфейс выглядит старым после правок | кэш браузера | `?v=` у css/js + `Cache-Control: no-store` для HTML; `Cmd/Ctrl+Shift+R` |
| Правка «не применилась» | замена по строке молча не совпала | `python3 tools/verify_build.py` |
| `400 Invalid HTTP request` в логах | curl с кириллицей в URL | `curl -sG --data-urlencode "q=маг"` |
| `z-index` не работает | родитель с `transform` создал контекст наложения | `z-index` на самих контекстах |
| Стиль не применяется | ниже в CSS есть второе правило с той же специфичностью | искать дубль, удалять мёртвые правила |
| Все продукты получили одну сумму | `random()` в некоррелированном `LATERAL` вычислен один раз (`Materialize`) | считать в списке выборки или в CTE |
| Панель исчезала сразу после появления | не снятый `setTimeout` скрытия | `clearTimeout` перед каждым новым таймером |
| Тень/рамка разного цвета слева и справа | `border-color: transparent` пропускает градиент | `background-clip: padding-box` + явный цвет |
| `Sort` в плане при `LIMIT` | порядок сортировки не совпал с индексом | согласовать `ORDER BY` с индексом |
| API не стартует | база недоступна, `db_pool.wait(timeout=30)` | поднять базу; в Compose — `healthcheck` + `depends_on` |

---

## 9. Что сделано и чего нет

### Сделано

- Поиск с подсказками: префикс + нечёткий запасной путь, debounce, защита от гонки
- Дерево вкладок в три уровня с анимацией, выравниванием и указателями
- Разделы: основная информация, финансовая отчётность, лимиты, сублимиты, резервы
- Группы компаний: единый лимит, состав, переход на карточку участника
- События: детектор отклонений текущего периода с фильтрами
- Выгрузка в Excel — до 9 листов, без внешних библиотек
- Работа без бэкенда на демо-данных
- Docker Compose, идемпотентные миграции, диагностика (`/api/health`, `tools/`)
- Курс из 7 лекций (`course/`, `course.html`) с живыми демонстрациями

### Не сделано — обязательно перед эксплуатацией

1. **Аутентификация и авторизация.** Сейчас всё видно любому, кто открыл адрес.
2. **Журнал действий.** Кто что смотрел — не фиксируется; для банка обязательно.
3. **Тесты.** Проверки делались вручную через `TestClient`; нужен `pytest` в CI.
4. **Пагинация.** Списки возвращаются целиком.
5. **Ограничение частоты запросов.**
6. **Удалить демо-данные** (`web/js/demo-data.js` и `withFallback` в `api.js`).
7. **Пароли и секреты.** `abb/abb` в `.env.example` — только для разработки.
8. **Код внутрь образа.** Сейчас `volumes` монтируют исходники — удобно для
   разработки, недопустимо в проде.
9. **HTTPS**, резервные копии с проверенным восстановлением, мониторинг.
10. **Kubernetes.** Обсуждался переезд с Docker Compose на k8s для машины без
    доступа в интернет — манифесты ещё не написаны.

### Открытые вопросы по содержанию

- ОГРН, адреса, ОКВЭД и суммы сгенерированы из `id` — правдоподобные, но
  выдуманные. Перед демонстрацией заказчику заменить на реальные либо
  обозначить как тестовые.
- Пороги детектора событий (25% / 50%, ставки резервирования 7% и 9%)
  подобраны на глаз. Нужны настраиваемые значения, возможно по отраслям.
- «Крышка» по утилизации сейчас константа 85% для всех.

---

## 10. Полезные команды

```bash
# запуск
docker compose up --build                 # db + api  -> localhost:8000
docker compose --profile full up          # + nginx и redis

# диагностика
curl -s localhost:8000/api/health
bash tools/check_deploy.sh                # что реально отдаёт контейнер
python3 tools/verify_build.py             # на месте ли правки во фронтенде

# база
docker compose exec db psql -U abb -d abb
docker compose exec -T db psql -U abb -d abb < db/05_limits.sql

# проверка поиска
curl -s  "localhost:8000/api/companies?q=7414"              # ASCII
curl -sG "localhost:8000/api/companies" --data-urlencode "q=маг"   # кириллица

# план запроса
docker compose exec db psql -U abb -d abb -c \\
  "EXPLAIN ANALYZE SELECT id, name FROM companies
   WHERE search_name LIKE 'маг%' ORDER BY search_name USING ~<~ LIMIT 8;"

# сборка
python3 tools/build_preview.py            # один HTML со всем фронтендом
python3 tools/build_course.py             # курс -> course.html
python3 tools/build_handoff.py            # этот документ
```

---

## 11. Куда смотреть дальше

- `README.md` — краткий запуск
- `course/` и `course.html` — курс по проекту (7 лекций, живые демонстрации)
- `GUIDE-search.md` — подробный разбор решения по поиску с замерами
- `tools/verify_build.py` — список опорных фрагментов, по которым проверяется,
  что фронтенд собран правильно
"""


def main() -> int:
    OUT.write_text(DOC, encoding="utf-8")
    missing = DOC.count("[ФРАГМЕНТ НЕ НАЙДЕН")
    print(f"{OUT} — {len(DOC):,} символов, {len(DOC.splitlines())} строк")
    print(f"ненайденных фрагментов: {missing}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
