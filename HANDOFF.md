# Лимитный модуль АББ — сводка проекта

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
| `web/index.html` | 114 |
| `web/css/styles.css` | 652 |
| `web/js/format.js` | 41 |
| `web/js/api.js` | 51 |
| `web/js/demo-data.js` | 292 |
| `web/js/search-bar.js` | 167 |
| `web/js/tab-tree.js` | 547 |
| `web/js/table-views.js` | 330 |
| `web/js/events.js` | 217 |
| `web/js/xlsx-writer.js` | 198 |
| `web/js/excel-export.js` | 236 |
| `web/js/app.js` | 167 |
| `api/app/main.py` | 498 |
| `api/app/cache.py` | 54 |
| `db/01_schema.sql` | 96 |
| `db/02_seed.sql` | 157 |
| `db/03_search_index.sql` | 27 |
| `db/04_groups.sql` | 131 |
| `db/05_limits.sql` | 240 |
| `db/06_reserves.sql` | 54 |

### Дерево проекта

```
.env.example
GUIDE-search.md
HANDOFF.md
README.md
api/Dockerfile
api/app/__init__.py
api/app/cache.py
api/app/main.py
api/requirements.txt
api/scripts/refresh_companies.py
course.html
course/01-архитектура.md
course/02-интерфейс.md
course/03-база-данных.md
course/04-фронтенд.md
course/05-бэкенд.md
course/06-развёртывание.md
course/07-всё-вместе.md
course/README.md
course/demo/01-flex-basis.html
course/demo/02-stacking-context.html
course/demo/03-grid-rows.html
data/companies.example.csv
db/01_schema.sql
db/02_seed.sql
db/03_search_index.sql
db/04_groups.sql
db/05_limits.sql
db/06_reserves.sql
docker-compose.yml
nginx.conf
preview.html
tools/build_course.py
tools/build_handoff.py
tools/build_preview.py
tools/check_deploy.sh
tools/insert_demos.py
tools/verify_build.py
web/css/styles.css
web/index.html
web/js/api.js
web/js/app.js
web/js/demo-data.js
web/js/events.js
web/js/excel-export.js
web/js/format.js
web/js/search-bar.js
web/js/tab-tree.js
web/js/table-views.js
web/js/xlsx-writer.js
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

```sql
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS search_name TEXT
    GENERATED ALWAYS AS (
        lower(regexp_replace(name, '^(ООО|АО|ПАО|ЗАО|ГК|ИП|ОАО)\s+', ''))
    ) STORED;
```

### 3.4. «Единый сублимит» считается, а не хранится

По глоссарию это совокупность лимитов корпоративного и инвестиционного блоков
на конкретного клиента. Отдельное хранение рано или поздно разошлось бы со
слагаемыми, поэтому значение считается в API суммой лимитов клиента.

### 3.5. Миграции идемпотентны и применяются при старте API

Файлы из `db/` Postgres выполняет только при инициализации **пустого тома**.
На работающей базе они молча игнорируются — мы на этом потеряли время
(`column "search_name" does not exist`). Решение — те же операции при каждом
старте API:

```python
def ensure_schema() -> None:
    global SEARCH_SCHEMA_READY
    try:
        with db_pool.connection() as conn, conn.cursor() as cur:
            for stmt in SEARCH_SCHEMA_SQL:
                cur.execute(stmt)
        SEARCH_SCHEMA_READY = True
        print("[АББ] схема поиска на месте", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[АББ] не удалось применить миграцию: {e}", flush=True)

    for path, title in (
        (GROUPS_SQL_FILE, "группы компаний"),
        (LIMITS_SQL_FILE, "лимиты и заявки"),
        (RESERVES_SQL_FILE, "резервы РСБУ и МСФО"),
    ):
        if not path.is_file():
            continue
        try:
            with db_pool.connection() as conn, conn.cursor() as cur:
                cur.execute(path.read_text(encoding="utf-8"))
            print(f"[АББ] {title}: схема на месте", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[АББ] миграция «{title}» не применилась: {e}", flush=True)
```

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

```sql
CREATE TABLE companies (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    inn         VARCHAR(12) NOT NULL UNIQUE,
    kpp         VARCHAR(9),
    industry    TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    source      TEXT        NOT NULL DEFAULT 'seed',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- поиск по названию: триграммы держат опечатки и середину слова
```

Показатели хранятся в «длинном» формате — по строке на (компания, показатель,
год). Новый год или показатель не меняет схему:

```sql
CREATE TABLE financial_indicators (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    group_code  TEXT   NOT NULL CHECK (group_code IN ('balance','results','ratios')),
    ord         INT    NOT NULL,
    label       TEXT   NOT NULL,
    kind        TEXT   NOT NULL CHECK (kind IN ('money','pct','ratio')),
    year        INT    NOT NULL,
    value       NUMERIC(20,2)
);
```

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

```sql
-- btree с text_pattern_ops обслуживает LIKE 'префикс%' и, что важнее,
-- отдаёт строки уже отсортированными — LIMIT 8 останавливает скан
-- после восьмой строки вместо сортировки всех совпадений.
CREATE INDEX IF NOT EXISTS companies_search_prefix
    ON companies (search_name text_pattern_ops);

-- GIN на триграммах — для запасного пути: опечатки и совпадение в середине.
CREATE INDEX IF NOT EXISTS companies_search_trgm
    ON companies USING gin (search_name gin_trgm_ops);
```

---

## 5. Бэкенд

Весь бэкенд — `api/app/main.py` (497 строк) и `api/app/cache.py`.

### 5.1. Пул соединений и выполнение запросов

```python
db_pool = ConnectionPool(DATABASE_DSN, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row})
response_cache = Cache(os.getenv("REDIS_URL"))

# Папка с фронтендом. Монтируется томом из docker-compose.
```

```python
def db_query(sql: str, params: tuple = ()) -> list[dict]:
    with db_pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()
```

**Параметризация обязательна.** Склейка строк даёт SQL-инъекцию — проверено:
ввод `' OR '1'='1` через склейку вернул все 28 строк, через параметр — 0.

### 5.2. Жизненный цикл

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    db_pool.open()
    db_pool.wait(timeout=30)
    ensure_schema()
    print(
        f"[АББ] фронтенд: {FRONTEND_DIR} -> {'раздаётся' if FRONTEND_AVAILABLE else 'НЕ НАЙДЕН, открыть / для подсказки'}",
        flush=True,
    )
    yield
    db_pool.close()
```

### 5.3. Поиск

```python
# 1. Основной путь. Префикс по названию или по ИНН.
#    ORDER BY ... USING ~<~ совпадает с порядком индекса text_pattern_ops,
#    поэтому сортировки нет: скан останавливается на восьмой строке.
PREFIX_SQL = """
SELECT id, name, inn, kpp, industry, 1.0::float AS score
FROM companies
WHERE is_active AND search_name LIKE %(prefix)s
ORDER BY search_name USING ~<~
LIMIT %(limit)s
"""

INN_SQL = """
SELECT id, name, inn, kpp, industry, 1.0::float AS score
FROM companies
WHERE is_active AND inn LIKE %(prefix)s
ORDER BY inn
LIMIT %(limit)s
"""

# 2. Запасной путь. Совпадение в середине названия и опечатки.
#    Дороже примерно в 100 раз, поэтому запускается, только если
#    префиксный поиск вернул мало строк.
FUZZY_SQL = """
SELECT id, name, inn, kpp, industry,
       word_similarity(%(q)s, search_name)::float AS score
FROM companies
WHERE is_active AND %(q)s <%% search_name
ORDER BY score DESC, name
LIMIT %(limit)s
"""
```

```python
@app.get("/api/companies")
def search_companies(query: str = Query(..., alias="q", min_length=3), limit: int = 8):
    """Подсказки. Префиксный поиск, при нехватке результатов — нечёткий."""
    params = {"q": query.lower(), "prefix": f"{query.lower()}%", "limit": limit}

    rows = db_query(INN_SQL, params) if query[:1].isdigit() else db_query(PREFIX_SQL, params)

    if len(rows) < 3:
        seen = {r["id"] for r in rows}
        for r in db_query(FUZZY_SQL, params):
            if r["id"] not in seen:
                rows.append(r)
        rows = rows[:limit]

    return to_jsonable(rows)
```

### 5.4. Лимиты: группировка и расчёт единого сублимита

```python
BLOCK_TITLES = {"corporate": "Корпоративный блок", "investment": "Инвестиционный блок"}


@app.get("/api/companies/{company_id}/limits")
def company_limits(company_id: int):
    """Установленные лимиты по блокам, единый сублимит и заявки."""
    rows = to_jsonable(
        db_query(
            """SELECT id, block, product, status, currency,
                      limit_amount, used_amount,
                      limit_amount - used_amount AS available,
                      total_limit, utilization_cap_pct, valid_until
               FROM limits WHERE company_id = %s
               ORDER BY block, limit_amount DESC""",
            (company_id,),
        )
    )
    for r in rows:
        r["valid_until"] = r["valid_until"].isoformat() if r["valid_until"] else None

    blocks = [
        {
            "code": code,
            "title": title,
            "items": [r for r in rows if r["block"] == code],
        }
        for code, title in BLOCK_TITLES.items()
    ]

    applications = to_jsonable(
        db_query(
            """SELECT id, product, status, currency, term_months, amount, comment, created_at
               FROM limit_applications WHERE company_id = %s
               ORDER BY created_at DESC, id""",
            (company_id,),
        )
    )
    for a in applications:
        a["created_at"] = a["created_at"].isoformat() if a["created_at"] else None

    total = sum(r["limit_amount"] for r in rows)
    used = sum(r["used_amount"] for r in rows)

    return {
        "blocks": [b for b in blocks if b["items"]],
        # единый сублимит клиента — совокупность лимитов обоих блоков
        "unified": {
            "sublimit": total,
            "utilized": used,
            "available": total - used,
        },
        "applications": applications,
        "items": rows,          # плоский список: используется в выгрузке
        "total": total,
        "used": used,
    }
```

### 5.5. Диагностика

```python
@app.get("/api/health")
def health_check():
    try:
        db_query("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok and SEARCH_SCHEMA_READY else "degraded",
        "db": db_ok,
        "search_schema": SEARCH_SCHEMA_READY,
        "cache": response_cache.enabled,
        "web_dir": str(FRONTEND_DIR),
        "web_mounted": FRONTEND_AVAILABLE,
    }


# ============================================================
# Статика. Если папка примонтирована, API раздаёт фронтенд сам —
# тогда nginx не нужен и образов для запуска требуется меньше.
# Монтируется последней, чтобы не перехватывать /api/*.
# ============================================================
```

Поведение при недоступной базе проверено:

- база упала **на ходу** → `status: "degraded"`, `db: false`, сервис отвечает;
- база недоступна **в момент старта** → API не поднимается вовсе
  (`PoolTimeout: pool initialization incomplete after 30 sec`). Это сознательно:
  лучше упасть заметно, чем отвечать ошибкой на каждый запрос.

### 5.6. Заголовки кэширования

```python
@app.middleware("http")
async def no_cache_html(request, call_next):
    """
    index.html никогда не кэшируется браузером.

    Ссылки на css и js идут с ?v=…, но это работает, только если сам
    index.html свежий. Без этого заголовка браузер показывает старую
    страницу со старыми именами файлов, и правки выглядят «не применились».
    """
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response
```

### 5.7. Полный список эндпоинтов

```
GET /api/companies?q=&limit=      поиск (префикс -> нечёткий)
GET /api/companies/{id}           карточка
GET /api/companies/{id}/profile   атрибуты + группа компаний
GET /api/companies/{id}/indicators баланс/финрезультаты/коэффициенты
GET /api/companies/{id}/limits    блоки лимитов, единый сублимит, заявки
GET /api/companies/{id}/sublimits  транши
GET /api/companies/{id}/reserves   РСБУ/МСФО
GET /api/groups/{id}              структура группы компаний
GET /api/meta                     когда справочник обновлялся
GET /api/health                   состояние сервиса
```

---

## 6. Фронтенд

Модули подключаются по порядку, каждый — IIFE, наружу отдаёт один объект.

### 6.1. `format.js` — форматирование и защита

```javascript
/* Форматирование чисел и дат. Всё в ru-RU. */
const Format = (() => {
  const nf = (min, max) => new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: min, maximumFractionDigits: max,
  });

  const na    = () => '<span class="no-data">—</span>';
  const money = v => v == null ? na() : nf(0, 0).format(Math.round(v));
  const pct   = v => v == null ? na() : nf(1, 1).format(v) + '<span class="unit">%</span>';
  const ratio = v => v == null ? na() : nf(2, 2).format(v);
  const rub   = v => v == null ? na() : nf(0, 0).format(Math.round(v)) + '<span class="unit">₽</span>';

  /* 1 234 567 890 -> «1,23 млрд ₽» — для бейджей на вкладках */
  const compact = v => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return nf(2, 2).format(v / 1e9) + ' млрд ₽';
    if (abs >= 1e6) return nf(1, 1).format(v / 1e6) + ' млн ₽';
    if (abs >= 1e3) return nf(0, 0).format(v / 1e3) + ' тыс. ₽';
    return nf(0, 0).format(v) + ' ₽';
  };

  const byKind = (v, kind) =>
    kind === 'pct' ? pct(v) : kind === 'ratio' ? ratio(v) : money(v);

  const delta = (prev, cur) => {
    if (prev == null || cur == null || !isFinite(prev) || prev === 0) return na();
    const p = (cur - prev) / Math.abs(prev) * 100;
    return `<span class="delta ${p >= 0 ? 'is-up' : 'is-down'}">${p >= 0 ? '+' : '−'}${nf(1, 1).format(Math.abs(p))}%</span>`;
  };

  const date = iso => iso ? new Date(iso).toLocaleDateString('ru-RU') : '—';

  const escape = s => String(s).replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const normalize = s => String(s).toLowerCase().replace(/[«»"'`.,]/g, '').replace(/ё/g, 'е').trim();

  return { money, pct, ratio, rub, compact, byKind, delta, date, escape, na, normalize };
})();
```

`escape` обязателен везде, где значение попадает в HTML-строку: без него имя
вида `<script>...</script>` выполнится как код.

### 6.2. `api.js` — единственное место, знающее про сервер

```javascript
/* ============================================================
   Клиент API. Единственное место, которое знает про бэкенд.

   GET /api/companies?q=&limit=
   GET /api/companies/{id}
   GET /api/companies/{id}/indicators
   GET /api/companies/{id}/limits
   GET /api/companies/{id}/sublimits
   GET /api/companies/{id}/reserves
   ============================================================ */
const API = (() => {
  const BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api';
  let offline = false; // переключается в true, если бэкенд не отвечает

  async function call(path) {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* Если бэкенда нет — работаем на демо-данных, чтобы прототип
     можно было открыть без Docker. В проде удалите fallback. */
  async function withFallback(path, mockFn) {
    if (offline) return mockFn();
    try {
      return await call(path);
    } catch (e) {
      if (typeof DemoData === 'undefined') throw e;
      offline = true;
      console.info(
        `[АББ] Бэкенд не отвечает по ${BASE} (${e.message}) — интерфейс переключён на демо-данные. ` +
        'Для работы с реальной базой запустите docker compose up.'
      );
      return mockFn();
    }
  }

  return {
    isOffline: () => offline,
    meta: () => call('/meta').catch(() => null),
    searchCompanies: q =>
      withFallback(`/companies?q=${encodeURIComponent(q)}&limit=8`, () => DemoData.search(q)),
    company: id => withFallback(`/companies/${id}`, () => DemoData.byId(id)),
    profile: id => withFallback(`/companies/${id}/profile`, () => DemoData.profile(id)),
    indicators: id => withFallback(`/companies/${id}/indicators`, () => DemoData.indicators(id)),
    limits: id => withFallback(`/companies/${id}/limits`, () => DemoData.limits(id)),
    sublimits: id => withFallback(`/companies/${id}/sublimits`, () => DemoData.sublimits(id)),
    reserves: id => withFallback(`/companies/${id}/reserves`, () => DemoData.reserves(id)),
  };
})();
```

**Важно для продакшена:** `withFallback` подменяет отказ бэкенда демо-данными.
Это удобно для показа, но опасно в эксплуатации — удалить вместе с
`demo-data.js`.

### 6.3. `search-bar.js` — debounce и защита от гонки

```javascript
  input.addEventListener('input', () => {
    field.classList.toggle('has-text', input.value.length > 0);
    if (selectedCompany && input.value !== selectedCompany.name && input.value !== selectedCompany.inn) {
      clearSelection();
    }
    const text = input.value.trim();
    clearTimeout(debounceTimer);

    if (text.length < 3) {
      closeDropdown();
      hint.textContent = 'Введите не менее 3 символов';
      return;
    }
    hint.textContent = 'Выберите компанию из списка';
    debounceTimer = setTimeout(() => loadSuggestions(text), 160);
  });

  async function loadSuggestions(text) {
    const requestId = ++requestCounter;
    let result = [];
    try { result = await API.searchCompanies(text); } catch { result = []; }
    if (requestId !== requestCounter) return;   // ответ устарел — пользователь допечатал
    suggestions = result;
    highlightedIndex = -1;
    renderDropdown(text);
  }
```

Два приёма:

- **debounce 160 мс** — запрос уходит только после паузы в наборе;
- **счётчик запросов** — ответ применяется, только если он на самый свежий
  запрос. Без него медленный ответ на «маг» перезаписывает быстрый на «магнит».

### 6.4. `tab-tree.js` — дерево вкладок и геометрия

Состояние всего интерфейса — один объект:

```javascript
  const state = {
    company: null,
    data: null,
    events: [],
    view: null,          // 'company' | 'events' — что выбрано на первом уровне
    section: null,       // 'main' | 'statements' | 'limits' | 'sublimits' | 'reserves'
    group: 'balance',    // 'balance' | 'results' | 'ratios'
    attribute: null,     // выбранный атрибут в «Основной информации» ('group' раскрывает ГК)
    groupSelection: null, // компания, выбранная в структуре ГК для перехода
    eventFilter: 'critical',  // какая категория событий показана
  };
```

Измерение положения без учёта анимации:

```javascript
  function offsetWithin(node, ancestor) {
    let x = 0;
    while (node && node !== ancestor) {
      x += node.offsetLeft;
      node = node.offsetParent;
    }
    return x;
  }
```

`offsetLeft` возвращает раскладку **до** `transform`, поэтому измерения не
зависят от текущего кадра анимации. `getBoundingClientRect()` здесь не подходит.

Подбор ширины верхней строки в два подхода:

```javascript
  function measureRow(mode) {
    companyTabs.classList.add(mode);
    const sides = [companyTabs.firstElementChild, companyTabs.lastElementChild];
    const needed = sides.reduce((max, tab) => Math.max(max, tab ? tab.offsetWidth : 0), 0);
    companyTabs.classList.remove(mode);
    return needed;
  }

  function fitTopRow() {
    const sides = [companyTabs.firstElementChild, companyTabs.lastElementChild];
    if (!sides[0] || sides[0] === sides[1]) return;

    companyTabs.style.removeProperty('--tab-min');
    companyTabs.style.removeProperty('max-width');
    if (!companyTabs.clientWidth) return;

    const pair = companyTabs.querySelector('.tab-pair');
    const pairWidth = pair ? pair.offsetWidth : 0;
    const normal = companyTabs.clientWidth;
    const roomy = treeRoot.clientWidth - 12;   // строка может занять поля под черту
    const rowWidth = width => width * 2 + pairWidth;

    // 1. лучший вариант: боковые вкладки целиком в одну строку
    const whole = measureRow('is-measuring-whole');
    // 2. запасной: не рвать слова и числа, но разрешить перенос по пробелам
    const unbroken = measureRow('is-measuring-word');

    let needed = 0;
    let useGutters = false;

    if (rowWidth(whole) <= normal) needed = whole;
    else if (rowWidth(whole) <= roomy) { needed = whole; useGutters = true; }
    else if (rowWidth(unbroken) <= normal) needed = unbroken;
    else if (rowWidth(unbroken) <= roomy) { needed = unbroken; useGutters = true; }
    else return;                                // не помещается и так

    if (useGutters) companyTabs.style.maxWidth = '100%';
    companyTabs.style.setProperty('--tab-min', Math.ceil(needed) + 'px');
  }
```

Выравнивание строк по фиксированной границе:

```javascript
  function layoutBranch() {
    const toRight = treeRoot.classList.contains('branch-right');
    const toLeft = treeRoot.classList.contains('branch-left');
    const rows = [companyTabs, sectionTabs, groupTabs];

    if (!toLeft && !toRight) {
      rows.forEach(row => { row.style.transform = ''; });
      placeArrows(0);
      return;
    }

    const gutter = cssPx('--marker-gutter');
    const target = toRight ? treeRoot.offsetWidth - gutter : gutter;
    const visible = new Set(visibleRows().map(entry => entry.row));

    rows.forEach(row => {
      // строка третьего уровня остаётся по центру: карточек в ней меньше,
      // и прижатая к краю она выглядела бы обрубленной
      if (row === groupTabs || !visible.has(row) || !row.offsetWidth) {
        row.style.transform = '';
        return;
      }
      const edge = nearEdge(row, toRight);
      if (edge === null) return;
      const shift = Math.round(target - edge);
      row.style.transform = shift ? `translateX(${shift}px)` : '';
      if (row === companyTabs) placeArrows(shift);
    });
  }
```

### 6.5. `events.js` — детектор отклонений

```javascript
  /* ---------- медиана предыдущих периодов ----------
     Сравнение с одним прошлым годом даёт ложные срабатывания, когда
     тот год сам был выбросом. Медиана всей истории устойчивее. */
  function median(values) {
    const clean = values.filter(v => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
    if (!clean.length) return null;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  }
```

Медиана вместо среднего: одно аномальное значение сдвигает среднее и маскирует
отклонение. Направление («рост — это хорошо или плохо») задаётся словарём
`DIRECTION` — без него система флагировала бы любое движение.

### 6.6. `xlsx-writer.js` — ZIP и OOXML вручную

```javascript
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
```

Числа обязаны писаться как числа, иначе формулы Excel по ним не работают:

```javascript
        return typeof obj.v === 'number' && isFinite(obj.v)
          ? `<c r="${ref}"${s}><v>${obj.v}</v></c>`
          : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(obj.v)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
```

### 6.7. `app.js` — связка

```javascript
  async function loadCompany(company) {
    loaded = { company, data: null };
    document.body.classList.add('is-searching');
    resultPanel.classList.add('is-visible');
    TabTree.clear();
    hideActionBar();
    errorBox.classList.remove('is-visible');
    processing.classList.add('is-visible');
    processingNote.textContent = `Собираем данные по «${company.name}»`;
    SearchBar.setBusy(true);

    try {
      // все ветки дерева тянем параллельно
      const [profile, indicators, limits, sublimits, reserves] = await Promise.all([
        API.profile(company.id),
        API.indicators(company.id),
        API.limits(company.id),
        API.sublimits(company.id),
        API.reserves(company.id),
      ]);
      const data = { profile, indicators, limits, sublimits, reserves };
      loaded = { company, data };

      processing.classList.remove('is-visible');
      TabTree.render(company, data);
      showActionBar();
    } catch (error) {
      processing.classList.remove('is-visible');
      errorMessage.textContent =
        `Не удалось получить данные по компании «${company.name}». Проверьте соединение с базой и повторите.`;
      errorBox.classList.add('is-visible');
      console.error(error);
    } finally {
      SearchBar.setBusy(false);
    }
  }
```

Пять запросов уходят параллельно: общее время равно самому долгому, а не сумме.

---

## 7. Интерфейс: приёмы вёрстки

### 7.1. Одинаковая ширина карточек во всех рядах

Ширина считается как доля **самого ёмкого** ряда, а не делением текущего:

```css
  --tab-basis:calc((100% - (var(--row-capacity) - 1) * 12px) / var(--row-capacity));
```

### 7.2. Подбор ширины верхней строки

Реквизиты ИНН и КПП нельзя переносить: число, разорванное на две строки,
читается как ошибка. JS замеряет карточки в двух режимах (`max-content` и
`min-content`) и назначает ширину обеим боковым вкладкам:

```css
.tab-row.is-measuring-whole .tab,
.tab-row.is-measuring-word .tab{flex:0 0 auto;min-width:0}
.tab-row.is-measuring-whole .tab{width:max-content}
.tab-row.is-measuring-word .tab{width:min-content}
.tab-row.is-measuring-whole .tab-label,
.tab-row.is-measuring-whole .tab-value,
.tab-row.is-measuring-whole .tab-note{white-space:nowrap}
```

### 7.3. Плавное раскрытие уровня

```css
.tab-level{
  display:grid;grid-template-rows:0fr;
  transition:grid-template-rows .48s var(--ease),opacity .35s ease;
  opacity:0;
}
.tab-level > *{overflow:hidden;min-height:0}
.tab-level.is-open{grid-template-rows:1fr;opacity:1}
```

`height: 0 → auto` не анимируется, `grid-template-rows: 0fr → 1fr` — да.
`overflow: hidden` на ребёнке обязателен.

### 7.4. Контекст наложения

```css
/* transform создаёт контекст наложения, поэтому z-index подсказок
   действует только внутри .hero. Без явного порядка результаты поиска
   (тоже с transform) рисуются поверх выпадающего списка. */
.hero{
  position:relative;z-index:20;
  transform:translateY(26vh);transition:transform .78s var(--ease);will-change:transform;
}
body.is-searching .hero{transform:translateY(0)}
```

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
docker compose exec db psql -U abb -d abb -c \
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
