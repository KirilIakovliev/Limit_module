"""Локальная строка app.load_log после Alembic. На стенд не запускать."""
from __future__ import annotations

from . import db


def main() -> None:
    db.open_pool()
    if db.fetch_one("SELECT 1 AS x FROM app.load_log LIMIT 1"):
        return
    db.execute(
        """
        INSERT INTO app.load_log (table_name, loaded_at, data_date, note)
        VALUES ('*', now(), CURRENT_DATE - 1, 'TEST: local fixtures db/local/90 + 91')
        """
    )


if __name__ == "__main__":
    main()
