"""
Единая точка подключения к PostgreSQL `limitmodule`.

Backend читает витрины на отображение напрямую (схема REPLICA_SCHEMA,
по умолчанию sbox_rsk_drt) и одну техническую таблицу app.load_log.
search_path задаётся на уровне соединения, поэтому SQL в queries.py пишется
с «голыми» именами таблиц — смена имени схемы на PROD не требует правок кода.

Никакого ORM: явный параметризованный SQL, строки — dict (row_factory=dict_row),
NUMERIC приходит как Decimal и дальше сериализуется без потери точности
(см. models.py).
"""
from __future__ import annotations

import os
from urllib.parse import quote_plus

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def build_database_url() -> str:
    """DSN из DATABASE_URL либо из POSTGRES_* — так меняют стенд и прод."""
    if url := os.getenv("DATABASE_URL"):
        return url
    user = os.getenv("POSTGRES_USER", "limitmodule_test")
    raw_password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    name = os.getenv("POSTGRES_DB", "limitmodule")
    if raw_password:
        return f"postgresql://{user}:{quote_plus(raw_password)}@{host}:{port}/{name}"
    return f"postgresql://{user}@{host}:{port}/{name}"


DATABASE_URL = build_database_url()
REPLICA_SCHEMA = os.getenv("REPLICA_SCHEMA", "sbox_rsk_drt")
APP_SCHEMA = "app"

# Имена из SQL карточки. Проверка — to_regclass, без CREATE.
MART_TABLES = (
    "t_lm_1_2_clients",
    "t_lm_1_2_gk_info",
    "t_lm_1_3_limits",
    "t_lm_egar_limits",
)


def _new_pool() -> ConnectionPool:
    return ConnectionPool(
        DATABASE_URL,
        min_size=1,
        max_size=int(os.getenv("DB_POOL_MAX", "10")),
        open=False,
        kwargs={
            "row_factory": dict_row,
            "options": f"-c search_path={REPLICA_SCHEMA},{APP_SCHEMA},public",
        },
    )


pool = _new_pool()


def open_pool(timeout: float = 30.0) -> None:
    global pool
    if getattr(pool, "closed", True):
        pool = _new_pool()
        pool.open()
    pool.wait(timeout=timeout)


def close_pool() -> None:
    global pool
    if not getattr(pool, "closed", True):
        pool.close()


def fetch_all(sql: str, params: dict | tuple | None = None) -> list[dict]:
    if getattr(pool, "closed", True):
        open_pool()
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(sql: str, params: dict | tuple | None = None) -> dict | None:
    if getattr(pool, "closed", True):
        open_pool()
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def execute(sql: str, params: dict | tuple | None = None) -> None:
    if getattr(pool, "closed", True):
        open_pool()
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


def missing_marts() -> list[str]:
    """Таблицы t_lm_*, которых нет в каталоге. CREATE не вызывается."""
    missing: list[str] = []
    for name in MART_TABLES:
        row = fetch_one(
            "SELECT to_regclass(%(q)s) AS r",
            {"q": f"{REPLICA_SCHEMA}.{name}"},
        )
        if not row or row["r"] is None:
            missing.append(name)
    return missing
