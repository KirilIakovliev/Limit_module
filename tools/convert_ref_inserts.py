#!/usr/bin/env python3
"""
Конвертация реальных INSERT-выгрузок ручных справочников DataHub
(context/data/ddl/Инсерты для ручных справочников/*.sql) в компактный
детерминированный db/local/90_test_refs.sql для TEST-БД.

Что делает:
  * читает каждый INSERT INTO sbox_rsk_drt.<таблица> (...) VALUES (...),(...);
  * парсит кортежи (строки в одинарных кавычках с экранированием '',
    NULL, числа) — без изменения порядка строк и состава колонок;
  * обрезает CHAR-дополнение пробелами/переводами строк по краям строковых
    значений (в источнике значения дополнены до фиксированной ширины);
    пустая после обрезки строка -> NULL;
  * внутренние символы (кавычки, переносы, «грязные» ИНН, 'Юани', 'Отсутствует'
    и т.п.) сохраняются как есть — это реальные данные.

Что НЕ делает: не добавляет и не переименовывает колонки, не чистит данные,
не меняет типы. Структура строго по DDL источника.

Запуск (из корня Limit_module):
    python3 tools/convert_ref_inserts.py \
        "../context/data/ddl/Инсерты для ручных справочников" db/local/90_test_refs.sql
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HEADER_RE = re.compile(
    r"INSERT\s+INTO\s+(?P<table>[\w.]+)\s*\((?P<cols>[^)]*)\)\s*VALUES",
    re.IGNORECASE,
)


class Parser:
    def __init__(self, text: str):
        self.s = text
        self.i = 0
        self.n = len(text)

    def skip_ws(self) -> None:
        while self.i < self.n and self.s[self.i] in " \t\r\n":
            self.i += 1

    def parse_value(self) -> str | None:
        """Возвращает SQL-литерал (уже нормализованный) или None для NULL."""
        self.skip_ws()
        c = self.s[self.i]
        if c == "'":
            self.i += 1
            buf = []
            while True:
                ch = self.s[self.i]
                if ch == "'":
                    if self.i + 1 < self.n and self.s[self.i + 1] == "'":
                        buf.append("'")
                        self.i += 2
                        continue
                    self.i += 1
                    break
                buf.append(ch)
                self.i += 1
            raw = "".join(buf)
            trimmed = raw.strip(" \t\r\n")
            if trimmed == "":
                return None
            return "'" + trimmed.replace("'", "''") + "'"
        # NULL / число / прочий bare-токен до , или )
        j = self.i
        while j < self.n and self.s[j] not in ",)":
            j += 1
        tok = self.s[self.i:j].strip()
        self.i = j
        if tok.upper() == "NULL":
            return None
        return tok

    def parse_tuple(self) -> list[str | None]:
        self.skip_ws()
        assert self.s[self.i] == "(", f"ожидалась '(' на позиции {self.i}"
        self.i += 1
        vals = []
        while True:
            vals.append(self.parse_value())
            self.skip_ws()
            ch = self.s[self.i]
            self.i += 1
            if ch == ",":
                continue
            if ch == ")":
                return vals
            raise ValueError(f"неожиданный символ {ch!r} на позиции {self.i}")

    def parse_statement_rows(self) -> list[list[str | None]]:
        rows = []
        while True:
            rows.append(self.parse_tuple())
            self.skip_ws()
            if self.i >= self.n:
                return rows
            ch = self.s[self.i]
            if ch == ",":
                self.i += 1
                continue
            if ch == ";":
                self.i += 1
                return rows
            return rows


def convert_file(path: Path) -> tuple[str, list[str], list[list[str | None]]]:
    text = path.read_text(encoding="utf-8")
    table = None
    cols: list[str] = []
    rows: list[list[str | None]] = []
    pos = 0
    while True:
        m = HEADER_RE.search(text, pos)
        if not m:
            break
        table = m.group("table")
        cols = [c.strip() for c in m.group("cols").split(",")]
        p = Parser(text)
        p.i = m.end()
        stmt_rows = p.parse_statement_rows()
        for r in stmt_rows:
            if len(r) != len(cols):
                raise ValueError(f"{path.name}: {len(r)} значений при {len(cols)} колонках")
        rows.extend(stmt_rows)
        pos = p.i
    if table is None:
        raise ValueError(f"{path.name}: INSERT не найден")
    return table, cols, rows


def render(table: str, cols: list[str], rows: list[list[str | None]], src: str) -> str:
    out = [f"-- {table}: {len(rows)} строк, источник {src}"]
    out.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES")
    body = []
    for r in rows:
        body.append("(" + ",".join("NULL" if v is None else v for v in r) + ")")
    out.append(",\n".join(body) + ";")
    return "\n".join(out) + "\n"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src_dir = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    files = sorted(src_dir.glob("*.sql"))
    if not files:
        print(f"в {src_dir} нет *.sql", file=sys.stderr)
        return 1
    parts = [
        "-- ============================================================================",
        "-- ТЕСТОВЫЕ ДАННЫЕ: реальные выгрузки ручных справочников DataHub (READY).",
        "-- Сгенерировано tools/convert_ref_inserts.py — НЕ редактировать вручную.",
        "-- Отличие от источника: обрезано CHAR-дополнение пробелами по краям строк,",
        "-- пустые строки -> NULL. Состав строк/колонок и «грязные» значения сохранены.",
        "-- ============================================================================",
        "",
    ]
    for f in files:
        table, cols, rows = convert_file(f)
        parts.append(render(table, cols, rows, f.name))
        print(f"{f.name}: {table} {len(cols)} колонок, {len(rows)} строк")
    dst.write_text("\n".join(parts), encoding="utf-8")
    print(f"записано {dst} ({dst.stat().st_size // 1024} КБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
