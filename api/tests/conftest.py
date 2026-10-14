"""
Общие фикстуры тестов. Тесты идут против живой TEST-БД, поднятой из db/local/*.sql
и Alembic (docker compose up). DSN — из переменной окружения DATABASE_URL, по умолчанию
порт 5433 из docker-compose.yml (для docker-compose.local.yml — 5434).
"""
import os
import sys
from pathlib import Path
from typing import NoReturn

import psycopg
import pytest
from psycopg.rows import dict_row

# чтобы `import app.*` работал при запуске `pytest` из каталога api/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_STRICT_DB_MSG = (
    "Test database is required but unavailable.\n"
    "Start the local environment with docker compose before running the strict test suite."
)


def _require_test_db() -> bool:
    return os.getenv("REQUIRE_TEST_DB", "").strip() == "1"


def _can_connect(dsn: str) -> bool:
    try:
        with psycopg.connect(dsn, connect_timeout=1) as c:
            c.execute("SELECT 1")
    except Exception:  # noqa: BLE001
        return False
    return True


def _db_unavailable() -> NoReturn:
    """Обычный pytest пропускает suite. REQUIRE_TEST_DB=1 — ошибка, не skip."""
    if _require_test_db():
        pytest.exit(_STRICT_DB_MSG, returncode=1)
    pytest.skip("TEST-БД недоступна")


def pytest_sessionstart(session):
    if _require_test_db() and not _can_connect(DSN):
        pytest.exit(_STRICT_DB_MSG, returncode=1)


def _default_dsn() -> str:
    user = os.getenv("POSTGRES_USER", "limitmodule_test")
    password = os.getenv("POSTGRES_PASSWORD", "localdev")
    db = os.getenv("POSTGRES_DB", "limitmodule")
    for port in (5433, 5434):
        dsn = f"postgresql://{user}:{password}@localhost:{port}/{db}"
        try:
            with psycopg.connect(dsn, connect_timeout=1) as c:
                c.execute("SELECT 1")
            return dsn
        except Exception:  # noqa: BLE001
            continue
    return f"postgresql://{user}:{password}@localhost:5433/{db}"


if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = _default_dsn()
os.environ.setdefault("REPLICA_SCHEMA", "sbox_rsk_drt")

DSN = os.environ["DATABASE_URL"]
REPLICA_SCHEMA = os.environ["REPLICA_SCHEMA"]


@pytest.fixture(scope="session")
def conn():
    try:
        c = psycopg.connect(DSN, row_factory=dict_row, connect_timeout=3)
    except Exception:  # noqa: BLE001
        _db_unavailable()
    c.execute(f"SET search_path TO {REPLICA_SCHEMA}, app, public")
    yield c
    c.close()


@pytest.fixture(scope="session")
def app_db(conn):
    """Открывает пул app.db для функций queries.py."""
    from app import db
    db.open_pool(timeout=10)
    yield
    db.close_pool()


@pytest.fixture(scope="session")
def app_pool():
    """Открывает пул app.db для queries.py / TestClient."""
    from app import db
    try:
        db.open_pool(timeout=10)
    except Exception:  # noqa: BLE001
        _db_unavailable()
    yield
    db.close_pool()
