"""Ждёт Postgres; с аргументом load_log — ещё app.load_log. Без образа postgres."""
from __future__ import annotations

import sys
import time

import psycopg

from .db import build_database_url


def main() -> None:
    need_log = "load_log" in sys.argv
    url = build_database_url()
    while True:
        try:
            with psycopg.connect(url, connect_timeout=5) as conn:
                if not need_log:
                    conn.execute("SELECT 1")
                    print("база отвечает", flush=True)
                    return
                row = conn.execute("SELECT to_regclass('app.load_log')").fetchone()
                if row and row[0]:
                    print("app.load_log есть", flush=True)
                    return
                print("жду app.load_log...", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"жду базу: {exc}", flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main()
