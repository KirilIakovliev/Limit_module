"""Лимитный модуль АББ — backend API. Читает витрины на отображение."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from psycopg.errors import UndefinedTable

from . import db, models, queries
from .cache import Cache

response_cache = Cache(os.getenv("REDIS_URL"))

FRONTEND_DIR = Path(os.getenv("WEB_DIR", "/srv/web"))
FRONTEND_AVAILABLE = (FRONTEND_DIR / "index.html").is_file()

MARTS_UNAVAILABLE = "Витрины на отображение ещё не загружены"


def _read_marts(call):
    try:
        return call()
    except UndefinedTable:
        raise HTTPException(status_code=503, detail=MARTS_UNAVAILABLE) from None


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.open_pool(timeout=30)
    try:
        missing = db.missing_marts()
        print(
            "[АББ] витрины: "
            + ("все на месте" if not missing else "нет " + ", ".join(missing)),
            flush=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[АББ] витрины: каталог недоступен ({exc})", flush=True)
    print(
        f"[АББ] фронтенд: {FRONTEND_DIR} -> {'раздаётся' if FRONTEND_AVAILABLE else 'НЕ НАЙДЕН, открыть / для подсказки'}",
        flush=True,
    )
    yield
    db.close_pool()


app = FastAPI(title="Лимитный модуль АББ", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.middleware("http")
async def no_cache_html(request, call_next):
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response


@app.get("/api/meta", response_model=models.Meta)
def directory_meta():
    """Дата/время последней загрузки копии витрин (app.load_log, БТ 2.2 / 2.5.3)."""
    if (hit := response_cache.get("meta")) is not None:
        return hit
    out = models.Meta.model_validate(queries.get_meta())
    response_cache.set("meta", out.model_dump(mode="json"), ttl=60)
    return out


@app.get("/api/clients", response_model=list[models.ClientShort])
def search_clients(query: str = Query(..., alias="q", min_length=3), limit: int = 8):
    """Подсказки по ИНН (префикс) или наименованию (подстрока; нечёткий запасной путь)."""
    return _read_marts(
        lambda: [models.ClientShort.model_validate(r) for r in queries.search_clients(query, limit)]
    )


@app.get("/api/clients/{inn}/limits", response_model=models.LimitsResponse)
def client_limits(inn: str):
    """Установленные лимиты и заявки: t_lm_1_3_limits + comment_egar + единые показатели."""
    if not _read_marts(lambda: queries.get_client(inn)):
        raise HTTPException(404, "Клиент не найден")
    return models.LimitsResponse.model_validate(_read_marts(lambda: queries.get_limits(inn)))


@app.get("/api/clients/{inn}", response_model=models.ClientCard)
def client_card(inn: str):
    """Карточка клиента: одна строка t_lm_1_2_clients на ИНН."""
    row = _read_marts(lambda: queries.get_client(inn))
    if not row:
        raise HTTPException(404, "Клиент не найден")
    return models.ClientCard.model_validate(row)


@app.get("/api/groups/{crm_id}", response_model=models.GroupCard)
def group_card(crm_id: str):
    """Карточка ГК: t_lm_1_2_gk_info (MAX уровня ГК, SUM клиентских строк, по валютам)."""
    g = _read_marts(lambda: queries.get_group(crm_id))
    if not g:
        raise HTTPException(404, "Группа не найдена")
    return models.GroupCard.model_validate(g)


@app.get("/api/health")
def health_check():
    missing: list[str] = []
    try:
        db.fetch_one("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    if db_ok:
        try:
            missing = db.missing_marts()
        except Exception:
            missing = ["(каталог недоступен)"]
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "marts": db_ok and not missing,
        "missing_marts": missing,
        "cache": response_cache.enabled,
        "web_dir": str(FRONTEND_DIR),
        "web_mounted": FRONTEND_AVAILABLE,
    }


if FRONTEND_AVAILABLE:
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="web")
else:
    @app.get("/", response_class=HTMLResponse)
    def frontend_missing_page():
        return f"""<!doctype html><html lang="ru"><meta charset="utf-8">
<title>Фронтенд не подключён</title>
<body style="font:15px/1.6 system-ui;max-width:640px;margin:60px auto;padding:0 20px;color:#22303d">
<h1 style="font-size:20px">Фронтенд не подключён</h1>
<p>API работает, но папка <code>{FRONTEND_DIR}</code> внутри контейнера пуста или отсутствует,
поэтому раздавать нечего.</p>
<p>Проверка состояния: <a href="/api/health">/api/health</a> ·
документация API: <a href="/docs">/docs</a></p>
</body></html>"""
