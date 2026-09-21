#!/usr/bin/env python3
"""
Обновление справочника компаний (ежедневно / еженедельно).

Запуск:
    docker compose exec api python scripts/refresh_companies.py --file /data/companies.csv

Источником может быть выгрузка ЕГРЮЛ, витрина DWH или внешний API —
меняется только функция fetch_source(). Всё остальное (staging-таблица,
UPSERT, деактивация исчезнувших записей, сброс кэша) остаётся тем же.
"""
import argparse
import csv
import os
import sys

import psycopg

DSN = os.getenv("DATABASE_URL", "postgresql://abb:abb@db:5432/abb")


def fetch_source(path: str | None) -> list[dict]:
    """Здесь читается реальный источник. Сейчас — CSV: name,inn,kpp,industry."""
    if not path:
        print("Источник не задан, обновлять нечего", file=sys.stderr)
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [
            {
                "name": r["name"].strip(),
                "inn": r["inn"].strip(),
                "kpp": (r.get("kpp") or "").strip() or None,
                "industry": (r.get("industry") or "").strip() or None,
            }
            for r in csv.DictReader(f)
            if r.get("inn", "").strip()
        ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="CSV со справочником")
    ap.add_argument("--deactivate-missing", action="store_true",
                    help="Пометить is_active = false у записей, которых нет в источнике")
    args = ap.parse_args()

    rows = fetch_source(args.file)
    if not rows:
        return 1

    with psycopg.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO company_sync_log DEFAULT VALUES RETURNING id")
        log_id = cur.fetchone()[0]

        # staging: грузим целиком, затем один UPSERT — справочник ни на секунду
        # не остаётся пустым, читатели всегда видят согласованные данные
        cur.execute("CREATE TEMP TABLE stage (LIKE companies INCLUDING DEFAULTS) ON COMMIT DROP")
        with cur.copy("COPY stage (name, inn, kpp, industry) FROM STDIN") as cp:
            for r in rows:
                cp.write_row((r["name"], r["inn"], r["kpp"], r["industry"]))

        cur.execute("""
            INSERT INTO companies (name, inn, kpp, industry, source, updated_at, is_active)
            SELECT name, inn, kpp, industry, 'sync', now(), TRUE FROM stage
            ON CONFLICT (inn) DO UPDATE SET
                name = EXCLUDED.name,
                kpp = EXCLUDED.kpp,
                industry = EXCLUDED.industry,
                is_active = TRUE,
                updated_at = now()
            WHERE companies.name IS DISTINCT FROM EXCLUDED.name
               OR companies.kpp  IS DISTINCT FROM EXCLUDED.kpp
               OR companies.industry IS DISTINCT FROM EXCLUDED.industry
               OR NOT companies.is_active
        """)
        touched = cur.rowcount

        deactivated = 0
        if args.deactivate_missing:
            cur.execute("""
                UPDATE companies SET is_active = FALSE, updated_at = now()
                WHERE is_active AND inn NOT IN (SELECT inn FROM stage)
            """)
            deactivated = cur.rowcount

        cur.execute("""
            UPDATE company_sync_log
            SET finished_at = now(), updated = %s, deactivated = %s,
                status = 'ok', message = %s
            WHERE id = %s
        """, (touched, deactivated, f"{len(rows)} строк в источнике", log_id))
        conn.commit()

    # инвалидация кэша подсказок
    if url := os.getenv("REDIS_URL"):
        try:
            import redis

            r = redis.Redis.from_url(url)
            for k in r.scan_iter(match="search:*", count=500):
                r.delete(k)
        except Exception as e:  # noqa: BLE001
            print(f"Кэш не сброшен: {e}", file=sys.stderr)

    print(f"Готово: изменено {touched}, деактивировано {deactivated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
