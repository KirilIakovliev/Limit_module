"""
Общие фикстуры тестов. Тесты идут против живой TEST-БД, поднятой из db/*.sql
(docker compose up). DSN — из переменной окружения DATABASE_URL, по умолчанию
порт 5433 из docker-compose.yml (для docker-compose.local.yml — 5434).
"""
import os
import sys
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

# чтобы `import app.*` работал при запуске `pytest` из каталога api/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _default_dsn() -> str:
    for port in (5433, 5434):
        dsn = f"postgresql://abb:abb@localhost:{port}/abb"
        try:
            with psycopg.connect(dsn, connect_timeout=1) as c:
                c.execute("SELECT 1")
            return dsn
        except Exception:  # noqa: BLE001
            continue
    return "postgresql://abb:abb@localhost:5433/abb"


if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = _default_dsn()
os.environ.setdefault("REPLICA_SCHEMA", "sbox_rsk_drt")

DSN = os.environ["DATABASE_URL"]
REPLICA_SCHEMA = os.environ["REPLICA_SCHEMA"]


@pytest.fixture(scope="session")
def conn():
    try:
        c = psycopg.connect(DSN, row_factory=dict_row, connect_timeout=3)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"TEST-БД недоступна ({DSN}): {e}")
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
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"пул к TEST-БД не открылся ({DSN}): {e}")
    yield
    db.close_pool()
