"""Лимитный модуль АББ — backend API."""
import os
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from .cache import Cache

DATABASE_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://abb:abb@db:5432/abb",
)
db_pool = ConnectionPool(DATABASE_DSN, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row})
response_cache = Cache(os.getenv("REDIS_URL"))

# Папка с фронтендом. Монтируется томом из docker-compose.
FRONTEND_DIR = Path(os.getenv("WEB_DIR", "/srv/web"))
FRONTEND_AVAILABLE = (FRONTEND_DIR / "index.html").is_file()


# ============================================================
# Схема, необходимая коду. Файлы из db/ выполняются только при
# первичной инициализации пустого тома, поэтому на уже работающей
# базе их никто не применит. Эти же операции идемпотентны и
# выполняются при каждом старте — API не может разойтись со схемой.
# ============================================================
SEARCH_SCHEMA_SQL = [
    r"""ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_name TEXT
       GENERATED ALWAYS AS (
           lower(regexp_replace(name, '^(ООО|АО|ПАО|ЗАО|ГК|ИП|ОАО)\s+', ''))
       ) STORED""",
    """CREATE INDEX IF NOT EXISTS companies_search_prefix
       ON companies (search_name text_pattern_ops)""",
    """CREATE INDEX IF NOT EXISTS companies_search_trgm
       ON companies USING gin (search_name gin_trgm_ops)""",
]

# Схема групп компаний и единого лимита. Полный текст с наполнением —
# в db/04_groups.sql; каталог db монтируется в контейнер. Если файла нет,
# группы просто не создаются и интерфейс показывает «Отсутствует».
GROUPS_SQL_FILE = Path(os.getenv("GROUPS_SQL", "/srv/db/04_groups.sql"))
LIMITS_SQL_FILE = Path(os.getenv("LIMITS_SQL", "/srv/db/05_limits.sql"))
RESERVES_SQL_FILE = Path(os.getenv("RESERVES_SQL", "/srv/db/06_reserves.sql"))

SEARCH_SCHEMA_READY = False


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


app = FastAPI(title="Лимитный модуль АББ", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


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


def db_query(sql: str, params: tuple = ()) -> list[dict]:
    with db_pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def decimal_to_float(v):
    """Decimal -> float, чтобы JSON-сериализация не падала."""
    return float(v) if isinstance(v, Decimal) else v


def to_jsonable(rows: list[dict]) -> list[dict]:
    return [{k: decimal_to_float(v) for k, v in r.items()} for r in rows]



# ============================================================
# Поиск: по названию (триграммы) ИЛИ по ИНН (префикс + триграммы)
# ============================================================
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


@app.get("/api/meta")
def directory_meta():
    """Когда справочник компаний обновлялся последний раз."""
    if (hit := response_cache.get("meta")) is not None:
        return hit

    rows = db_query("""
        SELECT (SELECT count(*) FROM companies WHERE is_active) AS count,
               (SELECT max(updated_at) FROM companies) AS updated_at,
               (SELECT max(finished_at) FROM company_sync_log WHERE status = 'ok') AS synced_at
    """)
    r = rows[0]
    stamp = r["synced_at"] or r["updated_at"]
    out = {
        "cache": response_cache.enabled,
        "directory": {
            "count": r["count"],
            "updated_at": stamp.isoformat() if stamp else None,
            "source": "postgres",
        },
    }
    response_cache.set("meta", out, ttl=60)
    return out


@app.get("/api/companies/{company_id}")
def company_card(company_id: int):
    rows = db_query(
        "SELECT id, name, inn, kpp, industry, updated_at FROM companies WHERE id = %s",
        (company_id,),
    )
    if not rows:
        raise HTTPException(404, "Компания не найдена")
    r = rows[0]
    r["updated_at"] = r["updated_at"].isoformat()
    return r


# ============================================================
# Уровень 3: Основная информация
# ============================================================
INDICATOR_GROUP_TITLES = {
    "balance": "Бухгалтерский баланс",
    "results": "Финансовые результаты",
    "ratios": "Коэффициенты",
}


@app.get("/api/companies/{company_id}/profile")
def company_profile(company_id: int):
    """Раздел «Основная информация»: атрибуты клиента и его группа."""
    rows = db_query(
        """SELECT c.id, c.name, c.inn, c.kpp, c.ogrn, c.address,
                  c.okved, c.okved_name, c.industry,
                  g.id AS group_id, g.name AS group_name
           FROM companies c
           LEFT JOIN company_groups g ON g.id = c.group_id
           WHERE c.id = %s""",
        (company_id,),
    )
    if not rows:
        raise HTTPException(404, "Компания не найдена")

    row = rows[0]
    profile = {
        "id": row["id"], "name": row["name"], "inn": row["inn"], "kpp": row["kpp"],
        "ogrn": row["ogrn"], "address": row["address"],
        "okved": row["okved"], "okved_name": row["okved_name"],
        "industry": row["industry"],
        "group": None,
    }
    if row["group_id"]:
        profile["group"] = group_structure(row["group_id"])
    return profile


def group_structure(group_id: int) -> dict:
    """Единый лимит группы и сублимиты её участников."""
    head = db_query(
        """SELECT id, name, unified_limit, available_limit, utilized_limit,
                  total_limit, utilization_cap_pct
           FROM company_groups WHERE id = %s""",
        (group_id,),
    )
    if not head:
        raise HTTPException(404, "Группа не найдена")

    members = to_jsonable(db_query(
        """SELECT c.id, c.name, c.inn,
                  s.sublimit_amount, s.available_amount, s.utilized_amount
           FROM companies c
           JOIN group_sublimits s ON s.company_id = c.id
           WHERE c.group_id = %s
           ORDER BY s.sublimit_amount DESC""",
        (group_id,),
    ))
    return {**to_jsonable(head)[0], "members": members}


@app.get("/api/groups/{group_id}")
def group_card(group_id: int):
    return group_structure(group_id)


@app.get("/api/companies/{company_id}/indicators")
def company_indicators(company_id: int):
    key = f"ind:{company_id}"
    if (hit := response_cache.get(key)) is not None:
        return hit

    rows = db_query(
        """SELECT group_code, ord, label, kind, year, value
           FROM financial_indicators WHERE company_id = %s
           ORDER BY group_code, ord, year""",
        (company_id,),
    )
    if not rows:
        raise HTTPException(404, "Показатели не найдены")

    years = sorted({r["year"] for r in rows})
    groups: dict[str, dict] = {}
    for r in rows:
        g = groups.setdefault(
            r["group_code"],
            {"code": r["group_code"], "title": INDICATOR_GROUP_TITLES[r["group_code"]], "rows": {}},
        )
        row = g["rows"].setdefault(
            r["ord"], {"label": r["label"], "kind": r["kind"], "values": {}}
        )
        row["values"][r["year"]] = decimal_to_float(r["value"])

    out = {
        "years": years,
        "unit": "тыс. ₽",
        "groups": [
            {
                "code": g["code"],
                "title": g["title"],
                "rows": [
                    {
                        "label": row["label"],
                        "kind": row["kind"],
                        "values": [row["values"].get(y) for y in years],
                    }
                    for _, row in sorted(g["rows"].items())
                ],
            }
            for _, g in sorted(groups.items(), key=lambda kv: ["balance", "results", "ratios"].index(kv[0]))
        ],
    }
    response_cache.set(key, out, ttl=600)
    return out


# ============================================================
# Уровень 2: Лимиты / Сублимиты / Резервы
# ============================================================
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


@app.get("/api/companies/{company_id}/sublimits")
def company_sublimits(company_id: int):
    rows = to_jsonable(
        db_query(
            """SELECT s.id, l.product, s.name, s.amount, s.used_amount,
                      s.amount - s.used_amount AS available, s.tenor_months
               FROM sublimits s JOIN limits l ON l.id = s.limit_id
               WHERE s.company_id = %s ORDER BY l.product, s.amount DESC""",
            (company_id,),
        )
    )
    return {
        "items": rows,
        "total": sum(r["amount"] for r in rows),
        "used": sum(r["used_amount"] for r in rows),
    }


RESERVE_STANDARDS = {"rsbu": "Резервы РСБУ", "ifrs": "Резервы МСФО"}


@app.get("/api/companies/{company_id}/reserves")
def company_reserves(company_id: int):
    """Позиции резервов по стандартам учёта: РСБУ и МСФО."""
    rows = to_jsonable(
        db_query(
            """SELECT id, standard, product, currency, limit_amount,
                      term_months, reserve_amount, calc_date
               FROM reserve_positions WHERE company_id = %s
               ORDER BY standard, limit_amount DESC""",
            (company_id,),
        )
    )
    for r in rows:
        r["calc_date"] = r["calc_date"].isoformat() if r["calc_date"] else None

    blocks = [
        {
            "code": code,
            "title": title,
            "items": [r for r in rows if r["standard"] == code],
            "total": sum(r["reserve_amount"] for r in rows if r["standard"] == code),
        }
        for code, title in RESERVE_STANDARDS.items()
    ]

    return {
        "blocks": [b for b in blocks if b["items"]],
        "items": rows,                                   # плоский список для выгрузки
        "total": sum(r["reserve_amount"] for r in rows),
    }


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
if FRONTEND_AVAILABLE:
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="web")
else:
    @app.get("/", response_class=HTMLResponse)
    def frontend_missing_page():
        """Вместо голого 404 — что именно не так и как чинить."""
        return f"""<!doctype html><html lang="ru"><meta charset="utf-8">
<title>Фронтенд не подключён</title>
<body style="font:15px/1.6 system-ui;max-width:640px;margin:60px auto;padding:0 20px;color:#22303d">
<h1 style="font-size:20px">Фронтенд не подключён</h1>
<p>API работает, но папка <code>{FRONTEND_DIR}</code> внутри контейнера пуста или отсутствует,
поэтому раздавать нечего.</p>
<ol>
<li>Запускайте <code>docker compose up</code> из корня проекта — там, где лежат
<code>docker-compose.yml</code> и папка <code>web/</code>.</li>
<li>Проверьте, что используете актуальный <code>docker-compose.yml</code>:
в сервисе <code>api</code> должны быть <code>FRONTEND_DIR: /srv/web</code> и том
<code>./web:/srv/web:ro</code>. После правки — <code>docker compose up --build</code>.</li>
<li>Посмотрите, что видит контейнер: <code>docker compose exec api ls /srv/web</code>.
Пусто на Windows или macOS — разрешите доступ к диску в Docker Desktop
(Settings → Resources → File sharing).</li>
</ol>
<p>Проверка состояния: <a href="/api/health">/api/health</a> ·
документация API: <a href="/docs">/docs</a></p>
</body></html>"""
