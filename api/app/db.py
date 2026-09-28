"""
Единая точка подключения к PostgreSQL `limitmodule`.

Backend читает копии итоговых витрин DataHub напрямую (схема REPLICA_SCHEMA,
по умолчанию sbox_rsk_drt) и одну техническую таблицу app.load_log.
search_path задаётся на уровне соединения, поэтому SQL в queries.py пишется
с «голыми» именами таблиц — смена имени схемы на PROD не требует правок кода.

Никакого ORM: явный параметризованный SQL, строки — dict (row_factory=dict_row),
NUMERIC приходит как Decimal и дальше сериализуется без потери точности
(см. models.py).
"""
from __future__ import annotations

import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://abb:abb@db:5432/abb")
REPLICA_SCHEMA = os.getenv("REPLICA_SCHEMA", "sbox_rsk_drt")
APP_SCHEMA = "app"

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
