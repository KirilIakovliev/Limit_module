"""Восстановление локальной копии четырёх витрин DataHub.

Источник DDL: context/data/ddl_t_lm/ddl_t_lm.txt (Impala/Hive).
Источник строк: context/data/data_t_lm/t_lm_*_*.csv (UTF-8 BOM, CSV).

Скрипт работает только с локальной PostgreSQL на loopback. Удалённый стенд,
DataHub и любой хост вне 127.0.0.1/localhost он не открывает.

Запуск из каталога Limit_module:

    python tools/restore_local_marts.py --apply

Без --apply скрипт только проверяет подключение, зависимости и CSV.
CSV в git не копируются: читаются из соседнего каталога context/.
"""
from __future__ import annotations

import argparse
import csv
import ipaddress
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg

# Единственное отклонение имени: исходное длиннее предела идентификатора PostgreSQL
# (63 байта, NAMEDATALEN). Сокращение уже используется приложением и docs/ddl_conversion.md.
LONG_GK_UTIL = "утилизированный совокупный лимит на гк"
SHORT_GK_UTIL = "утилиз-й совокупный лимит на гк"
# Первая буква — латинская c, как в DDL источника. Не исправлять на кириллическую.
GK_TOTAL = "cовокупный лимит на гк"

MARTS = (
    "t_lm_1_2_clients",
    "t_lm_1_2_gk_info",
    "t_lm_1_3_limits",
    "t_lm_egar_limits",
)

# Имена колонок PostgreSQL в порядке DDL. Пустые ячейки CSV становятся NULL.
COLUMNS: dict[str, list[str]] = {
    "t_lm_1_2_clients": [
        "uparty_inn_code",
        "uparty_code",
        "uparty_short_name",
        "uparty_ogrn_code",
        "uparty_kpp_code",
        "okved_code",
        "ods_full_address",
        "source",
    ],
    "t_lm_1_2_gk_info": [
        "group_name",
        "group_crm_id1",
        "currency",
        "party_inn",
        GK_TOTAL,
        SHORT_GK_UTIL,
        "доступный совокупный лимит на гк",
        "единый лимит по клиенту",
        "утилиз-й единый лимит по клиенту",
        "доступный единый лимит по клиенту",
    ],
    "t_lm_1_3_limits": [
        "inn",
        "client_name",
        "gk_crm_id",
        "gk_name",
        "owner",
        "limit_id",
        "currency",
        "product",
        "start_date",
        "end_date",
        "src_status",
        "limit_status",
        "rate",
        "lim_value",
        "lim_utiled",
        "rest_lim",
        "client_limits",
        "lim_top",
        "client_raroc",
    ],
    "t_lm_egar_limits": [
        "category_root",
        "category_parent",
        "id",
        "name",
        "product_type",
        "category_id",
        "limit_category",
        "client_name",
        "inn",
        "type",
        "start_date",
        "end_date",
        "value_currency_code",
        "value",
        "current_value",
        "rest_lim",
        "source_status",
        "life_status_mapped",
        "comment_egar",
    ],
}

DATE_COLUMNS = {
    "t_lm_1_3_limits": {"start_date", "end_date"},
    "t_lm_egar_limits": {"start_date", "end_date"},
}
INT_COLUMNS = {"t_lm_egar_limits": {"id", "category_id"}}
NUMERIC_COLUMNS = {
    "t_lm_1_2_gk_info": {
        GK_TOTAL: (15, 2),
        SHORT_GK_UTIL: (38, 7),
        "доступный совокупный лимит на гк": (38, 6),
        "единый лимит по клиенту": (38, 6),
        "утилиз-й единый лимит по клиенту": (38, 6),
        "доступный единый лимит по клиенту": (38, 6),
    },
    "t_lm_1_3_limits": {
        "rate": (38, 10),
        "lim_value": (38, 6),
        "lim_utiled": (38, 6),
        "rest_lim": (38, 6),
        "client_raroc": (15, 2),
    },
    "t_lm_egar_limits": {
        "value": (21, 4),
        "current_value": (21, 4),
        "rest_lim": (22, 4),
    },
}

HEADER_RENAME = {LONG_GK_UTIL: SHORT_GK_UTIL}

DDL = f"""
CREATE TABLE sbox_rsk_drt.t_lm_1_2_clients (
    uparty_inn_code TEXT,
    uparty_code TEXT,
    uparty_short_name TEXT,
    uparty_ogrn_code TEXT,
    uparty_kpp_code TEXT,
    okved_code TEXT,
    ods_full_address TEXT,
    "source" TEXT
);

CREATE TABLE sbox_rsk_drt.t_lm_1_2_gk_info (
    group_name TEXT,
    group_crm_id1 TEXT,
    currency TEXT,
    party_inn TEXT,
    "{GK_TOTAL}" NUMERIC(15,2),
    "{SHORT_GK_UTIL}" NUMERIC(38,7),
    "доступный совокупный лимит на гк" NUMERIC(38,6),
    "единый лимит по клиенту" NUMERIC(38,6),
    "утилиз-й единый лимит по клиенту" NUMERIC(38,6),
    "доступный единый лимит по клиенту" NUMERIC(38,6)
);

CREATE TABLE sbox_rsk_drt.t_lm_1_3_limits (
    inn TEXT,
    client_name TEXT,
    gk_crm_id TEXT,
    gk_name TEXT,
    owner TEXT,
    limit_id TEXT,
    currency TEXT,
    product TEXT,
    start_date DATE,
    end_date DATE,
    src_status TEXT,
    limit_status TEXT,
    rate NUMERIC(38,10),
    lim_value NUMERIC(38,6),
    lim_utiled NUMERIC(38,6),
    rest_lim NUMERIC(38,6),
    client_limits TEXT,
    lim_top TEXT,
    client_raroc NUMERIC(15,2)
);

CREATE TABLE sbox_rsk_drt.t_lm_egar_limits (
    category_root TEXT,
    category_parent TEXT,
    id INTEGER,
    name TEXT,
    product_type TEXT,
    category_id INTEGER,
    limit_category TEXT,
    client_name TEXT,
    inn TEXT,
    "type" TEXT,
    start_date DATE,
    end_date DATE,
    value_currency_code TEXT,
    value NUMERIC(21,4),
    current_value NUMERIC(21,4),
    rest_lim NUMERIC(22,4),
    source_status TEXT,
    life_status_mapped TEXT,
    comment_egar TEXT
);
"""


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def default_csv_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "context" / "data" / "data_t_lm"


def assert_local_target(host: str, port: int) -> None:
    lowered = host.lower()
    if any(mark in lowered for mark in ("akbars", "datahub", "prod")):
        fail(f"Отказ: хост {host!r} не является локальной тестовой базой.")
    if lowered not in {"127.0.0.1", "localhost", "::1"}:
        fail(f"Отказ: разрешён только loopback, получен хост {host!r}.")
    if port == 5432:
        fail("Отказ: порт 5432 — служебный порт внутри контейнера, с хоста не используем.")


def assert_local_session(conn: psycopg.Connection) -> None:
    row = conn.execute(
        """
        SELECT current_database() AS db,
               current_user AS usr,
               inet_server_addr()::text AS addr,
               inet_server_port() AS port
        """
    ).fetchone()
    db, user, addr, port = row
    if db != "limitmodule" or user != "limitmodule_test":
        fail(f"Отказ: сессия {user}@{db}, ожидалась limitmodule_test@limitmodule.")
    if not addr:
        fail("Отказ: inet_server_addr() пуст, нельзя подтвердить локальный сервер.")
    ip = ipaddress.ip_address(addr.split("/", 1)[0])
    if not (ip.is_private or ip.is_loopback):
        fail(f"Отказ: сервер отвечает с публичного адреса {addr}.")
    print(f"Сессия: {user}@{db} via {addr}:{port}")


def dependent_objects(conn: psycopg.Connection) -> list[tuple]:
    return conn.execute(
        """
        SELECT DISTINCT n.nspname, c.relname, c.relkind::text
        FROM pg_depend d
        JOIN pg_rewrite rw ON rw.oid = d.objid
        JOIN pg_class c ON c.oid = rw.ev_class
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class ref ON ref.oid = d.refobjid
        JOIN pg_namespace rn ON rn.oid = ref.relnamespace
        WHERE rn.nspname = 'sbox_rsk_drt'
          AND ref.relname = ANY(%s)
          AND c.oid <> ref.oid
        UNION
        SELECT n.nspname, c.relname, 'fk'
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class ref ON ref.oid = con.confrelid
        JOIN pg_namespace rn ON rn.oid = ref.relnamespace
        WHERE con.contype = 'f'
          AND rn.nspname = 'sbox_rsk_drt'
          AND ref.relname = ANY(%s)
        """,
        (list(MARTS), list(MARTS)),
    ).fetchall()


def resolve_csv(directory: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for table in MARTS:
        matches = sorted(directory.glob(f"{table}_*.csv"))
        if len(matches) != 1:
            fail(f"{table}: ожидался один CSV, найдено {len(matches)} в {directory}")
        found[table] = matches[0]
    return found


def parse_decimal(raw: str, precision: int, scale: int, where: str) -> Decimal:
    token = raw.strip().replace(" ", "").replace("\u00a0", "")
    if "," in token and "." not in token:
        token = token.replace(",", ".")
    try:
        value = Decimal(token)
    except InvalidOperation:
        fail(f"{where}: нечисловое значение")
    tup = value.as_tuple()
    frac = max(0, -tup.exponent)
    whole = len(tup.digits) - frac
    if whole > precision - scale or frac > scale:
        fail(f"{where}: число не входит в NUMERIC({precision},{scale})")
    return value


def parse_cell(table: str, column: str, raw: str, row_no: int):
    if raw == "":
        return None
    where = f"{table} строка {row_no} колонка {column}"
    if column in DATE_COLUMNS.get(table, ()):
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            fail(f"{where}: дата не в формате YYYY-MM-DD")
    if column in INT_COLUMNS.get(table, ()):
        try:
            return int(raw)
        except ValueError:
            fail(f"{where}: ожидалось целое")
    spec = NUMERIC_COLUMNS.get(table, {}).get(column)
    if spec:
        return parse_decimal(raw, spec[0], spec[1], where)
    return raw


def load_rows(path: Path, table: str) -> list[tuple]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
    renamed = [HEADER_RENAME.get(name, name) for name in header]
    expected = COLUMNS[table]
    if renamed != expected:
        fail(f"{table}: заголовок CSV не совпал с DDL.\n  csv={renamed}\n  ddl={expected}")
    rows: list[tuple] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row_no, source in enumerate(reader, start=2):
            mapped = {HEADER_RENAME.get(key, key): value for key, value in source.items()}
            rows.append(tuple(parse_cell(table, column, mapped[column], row_no) for column in expected))
    return rows


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def copy_table(conn: psycopg.Connection, table: str, rows: list[tuple]) -> None:
    column_list = ", ".join(quote_ident(column) for column in COLUMNS[table])
    sql = f"COPY sbox_rsk_drt.{table} ({column_list}) FROM STDIN"
    with conn.cursor() as cur:
        with cur.copy(sql) as copy:
            for row in rows:
                copy.write_row(row)


def record_load(conn: psycopg.Connection, counts: dict[str, int], files: dict[str, Path]) -> None:
    data_date = date(2026, 10, 21)
    for table, count in counts.items():
        conn.execute(
            """
            INSERT INTO app.load_log (table_name, loaded_at, data_date, row_count, note)
            VALUES (%s, now(), %s, %s, %s)
            """,
            (
                table,
                data_date,
                count,
                f"local restore {files[table].name}; пустые ячейки CSV -> NULL; {LONG_GK_UTIL} -> {SHORT_GK_UTIL}",
            ),
        )


def verify(conn: psycopg.Connection, expected: dict[str, int]) -> None:
    print("Проверка строк:")
    for table, count in expected.items():
        actual = conn.execute(f"SELECT count(*) FROM sbox_rsk_drt.{table}").fetchone()[0]
        mark = "ok" if actual == count else "РАСХОЖДЕНИЕ"
        print(f"  {table}: {actual} ({mark}, csv {count})")
        if actual != count:
            fail("число строк после COPY не совпало с CSV")
    constraints = conn.execute(
        """
        SELECT n.nspname, c.relname, con.contype
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sbox_rsk_drt'
          AND c.relname = ANY(%s)
        """,
        (list(MARTS),),
    ).fetchall()
    if constraints:
        fail(f"на витринах появились ограничения, которых нет в источнике: {constraints}")
    print("Ограничений на витринах нет.")
    gk_name = conn.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'sbox_rsk_drt'
          AND table_name = 't_lm_1_2_gk_info'
          AND ordinal_position = 6
        """
    ).fetchone()[0]
    if gk_name != SHORT_GK_UTIL:
        fail(f"колонка утилизации ГК называется {gk_name!r}")
    print(f"Колонка утилизации ГК: {gk_name} ({len(gk_name.encode())} байт)")


def main() -> None:
    if len(LONG_GK_UTIL.encode()) <= 63:
        fail("ожидалось, что длинное имя утилизации ГК не влезает в NAMEDATALEN")
    if ord(GK_TOTAL[0]) != 0x63:
        fail("первая буква совокупного лимита должна остаться латинской c")

    parser = argparse.ArgumentParser(description="Локальное восстановление витрин t_lm_*")
    parser.add_argument("--apply", action="store_true", help="удалить четыре витрины и загрузить CSV")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5434)
    parser.add_argument("--dbname", default="limitmodule")
    parser.add_argument("--user", default="limitmodule_test")
    parser.add_argument("--password", default="localdev")
    parser.add_argument("--csv-dir", type=Path, default=default_csv_dir())
    args = parser.parse_args()

    assert_local_target(args.host, args.port)
    files = resolve_csv(args.csv_dir)
    parsed = {table: load_rows(path, table) for table, path in files.items()}
    for table, rows in parsed.items():
        print(f"CSV {files[table].name}: {len(rows)} строк, {len(COLUMNS[table])} колонок")

    conn = psycopg.connect(
        host=args.host,
        port=args.port,
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        connect_timeout=5,
    )
    try:
        assert_local_session(conn)
        dependents = dependent_objects(conn)
        if dependents:
            fail(f"Отказ: у витрин есть зависимые объекты, удаление остановлено: {dependents}")
        print("Зависимых view и внешних ключей нет.")
        if not args.apply:
            print("Пробный прогон. Для загрузки добавьте --apply.")
            return
        # SELECT выше уже открыл транзакцию. Без rollback() блок transaction()
        # станет savepoint и close() откатит DROP/COPY вместе с ним.
        conn.rollback()
        expected = {table: len(rows) for table, rows in parsed.items()}
        with conn.transaction():
            for table in MARTS:
                conn.execute(f"DROP TABLE IF EXISTS sbox_rsk_drt.{table}")
            conn.execute(DDL)
            for table, rows in parsed.items():
                copy_table(conn, table, rows)
            record_load(conn, expected, files)
            verify(conn, expected)
        verify(conn, expected)
        print("Загрузка зафиксирована.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
