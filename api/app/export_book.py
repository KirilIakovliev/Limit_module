"""Один workbook карточки: раздел → строки тех же query-функций → лист.

XlsxWriter пишет файл построчно (constant_memory). Текстовые ячейки не становятся
формулами. Расчёт лимитов, остатка и резервов здесь не повторяется.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from . import queries

ORDER = ("info", "limits", "applications", "reserves")
TITLES = {
    "info": "Общая информация",
    "limits": "Лимиты",
    "applications": "Лимиты на рассмотрении",
    "reserves": "Резервы",
}
NO_DATA = "нет данных"
DASH = "—"
CELL_LIMIT = 32767


@dataclass(frozen=True)
class Filters:
    as_of: str = ""
    today: str = ""
    show_closed: bool = True


@dataclass(frozen=True)
class Snapshot:
    client: dict
    meta: dict
    limits: dict | None
    group: dict | None
    filters: Filters
    formed: str


def ordered(sections) -> tuple[str, ...]:
    chosen = {item.value if hasattr(item, "value") else item for item in sections}
    return tuple(name for name in ORDER if name in chosen)


def load_snapshot(client: dict, sections, filters: Filters, source=queries) -> Snapshot:
    """Компания уже загружена. Общие запросы — один раз на выбранные разделы."""
    chosen = set(ordered(sections))
    meta = source.get_meta()
    limits = source.get_limits(client["inn"]) if chosen & {"limits", "applications"} else None
    group = None
    crm_id = (client.get("group") or {}).get("crm_id")
    if crm_id and chosen & {"info", "limits"}:
        group = source.get_group(crm_id)
    return Snapshot(client, meta, limits, group, filters, _formed_now())


def covers_date(row: dict, day: str, today: str) -> bool:
    """Как на вкладке: сегодня — весь снимок API, иначе срок start/end."""
    if not day or (today and day == today):
        return True
    start = _iso_day(row.get("start_date"))
    end = _iso_day(row.get("end_date"))
    if start and start > day:
        return False
    if end and end < day:
        return False
    return True


def visible_limits(rows: list[dict], filters: Filters) -> list[dict]:
    return [
        row for row in rows
        if covers_date(row, filters.as_of, filters.today)
        and (filters.show_closed or row.get("status_code") != "inactive")
    ]


def write_workbook(path: Path, snap: Snapshot, sections, progress) -> None:
    import xlsxwriter

    chosen = ordered(sections)
    book = xlsxwriter.Workbook(str(path), {
        "constant_memory": True,
        "strings_to_formulas": False,
        "strings_to_urls": False,
    })
    try:
        styles = _styles(book)
        total = len(chosen)
        for index, section in enumerate(chosen):
            progress(20 + int(70 * index / total), f"Формируем лист «{TITLES[section]}»")
            _WRITERS[section](book.add_worksheet(TITLES[section]), snap, styles)
        progress(95, "Собираем файл")
    finally:
        book.close()
    os.chmod(path, 0o600)


def limits_filter_text(filters: Filters) -> str:
    closed = "да" if filters.show_closed else "нет"
    if not filters.as_of:
        scope = "все строки снимка"
    elif filters.today and filters.as_of == filters.today:
        scope = "полный снимок на сегодня"
    else:
        scope = "по сроку действия"
    return f"Дата: {_show_day(filters.as_of)}; Показывать закрытые лимиты: {closed}; {scope}"


def _formed_now() -> str:
    return datetime.now().strftime("%d.%m.%Y %H:%M")


def _styles(book):
    return {
        "label": book.add_format({"bold": True, "font_color": "#5C6B63"}),
        "text": book.add_format({"valign": "top"}),
        "wrap": book.add_format({"valign": "top", "text_wrap": True}),
        "header": book.add_format({
            "bold": True,
            "bg_color": "#E7F6EE",
            "bottom": 1,
            "bottom_color": "#B7E2C8",
            "valign": "top",
        }),
        "money": book.add_format({"num_format": "#,##0.00####", "valign": "top"}),
        "rate": book.add_format({"num_format": "0.00", "valign": "top"}),
        "day": book.add_format({"num_format": "dd.mm.yyyy", "valign": "top"}),
    }


def _preamble(ws, snap: Snapshot, filters: str, styles) -> int:
    freshness = _stamp(snap.meta.get("updated_at"))
    rows = (
        ("Компания", snap.client.get("name") or DASH),
        ("ИНН", snap.client.get("inn") or DASH),
        ("Дата формирования", snap.formed),
        ("Дата актуализации данных", freshness),
        ("Фильтры", filters),
    )
    for index, (label, value) in enumerate(rows):
        ws.write_string(index, 0, label, styles["label"])
        ws.write_string(index, 1, _plain(value) or DASH, styles["text"])
    ws.set_column(0, 0, 32)
    ws.set_column(1, 1, 36)
    return 6


def _write_info(ws, snap: Snapshot, styles) -> None:
    header = _preamble(ws, snap, "раздел карточки", styles)
    fields = (
        ("Наименование компании", snap.client.get("name") or DASH),
        ("ИНН", snap.client.get("inn") or DASH),
        ("ОГРН", snap.client.get("ogrn") or DASH),
        ("КПП", snap.client.get("kpp") or DASH),
        ("Адрес", snap.client.get("address") or DASH),
        ("ОКВЭД", snap.client.get("okved") or DASH),
        ("Группа компаний", (snap.client.get("group") or {}).get("name") or "Отсутствует"),
    )
    _header(ws, header, ("Атрибут", "Значение"), styles)
    row = header + 1
    for label, value in fields:
        ws.write_string(row, 0, label, styles["text"])
        ws.write_string(row, 1, _plain(value) or DASH, styles["wrap"])
        row += 1
    attribute_last = row - 1
    ws.freeze_panes(header + 1, 0)
    row += 1
    ws.write_string(row, 0, "Единый лимит", styles["label"])
    row += 1
    _header(ws, row, ("Показатель", "Валюта", "Сумма"), styles)
    row += 1
    summaries = (snap.group or {}).get("summaries") or []
    metrics = (
        ("Сумма единого лимита", "unified_limit"),
        ("Единый утилизированный лимит", "unified_utilized"),
        ("Единый доступный лимит", "unified_available"),
        ("Совокупный лимит", "total_limit"),
    )
    if summaries:
        for summary in summaries:
            for title, field in metrics:
                ws.write_string(row, 0, title, styles["text"])
                ws.write_string(row, 1, _plain(summary.get("currency")) or DASH, styles["text"])
                _money(ws, row, 2, summary.get(field), styles)
                row += 1
    ws.write_string(row, 0, "«Крышка»", styles["text"])
    ws.write_string(row, 1, DASH, styles["text"])
    ws.write_string(row, 2, NO_DATA, styles["text"])
    row += 2
    ws.write_string(row, 0, "Компании в структуре ГК", styles["label"])
    row += 1
    columns = (
        "Наименование", "ИНН", "Валюта", "Сумма единого лимита",
        "Единый утилизированный лимит", "Единый доступный лимит", "Совокупный лимит", "«Крышка»",
    )
    _header(ws, row, columns, styles)
    for index, width in enumerate((36, 16, 24, 24, 28, 26, 22, 16)):
        ws.set_column(index, index, width)
    companies = row
    row += 1
    for member in (snap.group or {}).get("members") or []:
        ws.write_string(row, 0, _plain(member.get("name")) or DASH, styles["text"])
        ws.write_string(row, 1, _plain(member.get("inn")) or DASH, styles["text"])
        ws.write_string(row, 2, _plain(member.get("currency")) or DASH, styles["text"])
        _money(ws, row, 3, member.get("unified_limit"), styles)
        _money(ws, row, 4, member.get("unified_utilized"), styles)
        _money(ws, row, 5, member.get("unified_available"), styles)
        ws.write_string(row, 6, NO_DATA, styles["text"])
        ws.write_string(row, 7, NO_DATA, styles["text"])
        row += 1
    if row > companies + 1:
        ws.autofilter(companies, 0, row - 1, len(columns) - 1)
    else:
        ws.autofilter(header, 0, attribute_last, 1)


def _write_limits(ws, snap: Snapshot, styles) -> None:
    header = _preamble(ws, snap, limits_filter_text(snap.filters), styles)
    columns = (
        ("Владелец", "text", "owner"),
        ("Продукт", "text", "product"),
        ("Статус", "text", "status"),
        ("Сумма", "money", "lim_value"),
        ("Утилизация", "money", "lim_utiled"),
        ("Доступный", "money", "rest_lim"),
        ("Валюта", "text", "currency"),
        ("Дата установления", "date", "start_date"),
        ("Дата окончания", "date", "end_date"),
        ("ОУЛ", "fixed", NO_DATA),
        ("Дата решения ОУЛ", "fixed", NO_DATA),
        ("Ставка", "rate", "rate"),
        ("RAROC", "rate", "client_raroc"),
        ("Комментарий", "wrap", "comment"),
        ("Крышка", "wrap", "lim_top"),
    )
    _header(ws, header, [name for name, _, _ in columns], styles)
    for index, width in enumerate((28, 22, 36, 24, 24, 24, 12, 20, 18, 16, 22, 12, 12, 40, 24)):
        ws.set_column(index, index, width)
    rows = visible_limits((snap.limits or {}).get("limits") or [], snap.filters)
    row = header + 1
    for item in rows:
        _record(ws, row, item, columns, styles)
        row += 1
    last = max(header, row - 1)
    ws.autofilter(header, 0, last, len(columns) - 1)
    ws.freeze_panes(header + 1, 0)
    row = last + 2
    ws.write_string(row, 0, "Единый сублимит", styles["label"])
    row += 1
    _header(ws, row, (
        "Валюта", "Сумма единого лимита", "Единый доступный лимит",
        "Единый утилизированный лимит", "Совокупный лимит",
    ), styles)
    row += 1
    summaries = (snap.group or {}).get("summaries") or []
    if not summaries:
        ws.write_string(row, 0, "Нет данных группы", styles["text"])
        return
    for summary in summaries:
        ws.write_string(row, 0, _plain(summary.get("currency")) or DASH, styles["text"])
        _money(ws, row, 1, summary.get("unified_limit"), styles)
        _money(ws, row, 2, summary.get("unified_available"), styles)
        _money(ws, row, 3, summary.get("unified_utilized"), styles)
        _money(ws, row, 4, summary.get("total_limit"), styles)
        row += 1


def _write_applications(ws, snap: Snapshot, styles) -> None:
    header = _preamble(ws, snap, "без отбора по дате; комментарий нет в витрине", styles)
    columns = (
        ("Продукт", "text", "product"),
        ("Статус", "text", "status"),
        ("Сумма", "money", "lim_value"),
        ("Валюта", "text", "currency"),
        ("Дата начала", "date", "start_date"),
        ("Дата окончания", "date", "end_date"),
        ("Владелец", "text", "owner"),
        ("Комментарий", "fixed", DASH),
    )
    _header(ws, header, [name for name, _, _ in columns], styles)
    for index, width in enumerate((22, 36, 24, 12, 16, 18, 28, 18)):
        ws.set_column(index, index, width)
    row = header + 1
    for item in (snap.limits or {}).get("applications") or []:
        _record(ws, row, item, columns, styles)
        row += 1
    ws.autofilter(header, 0, max(header, row - 1), len(columns) - 1)
    ws.freeze_panes(header + 1, 0)


def _write_reserves(ws, snap: Snapshot, styles) -> None:
    header = _preamble(ws, snap, "источник не подключён", styles)
    ws.write_string(header, 0, "Источник данных не подключён.", styles["text"])
    ws.freeze_panes(1, 0)


_WRITERS = {
    "info": _write_info,
    "limits": _write_limits,
    "applications": _write_applications,
    "reserves": _write_reserves,
}


def _header(ws, row: int, titles, styles) -> None:
    for column, title in enumerate(titles):
        ws.write_string(row, column, title, styles["header"])


def _record(ws, row: int, item: dict, columns, styles) -> None:
    for column, (_, kind, source) in enumerate(columns):
        if kind == "fixed":
            ws.write_string(row, column, source, styles["text"])
        elif kind == "money":
            _money(ws, row, column, item.get(source), styles)
        elif kind == "date":
            _date(ws, row, column, item.get(source), styles)
        elif kind == "rate":
            _rate(ws, row, column, item.get(source), styles)
        else:
            ws.write_string(row, column, _plain(item.get(source)) or DASH, styles["wrap" if kind == "wrap" else "text"])


def _money(ws, row: int, column: int, value, styles) -> None:
    number = _number(value)
    if number is None:
        ws.write_string(row, column, DASH, styles["text"])
    else:
        ws.write_number(row, column, number, styles["money"])


def _rate(ws, row: int, column: int, value, styles) -> None:
    number = _number(value)
    if number is None:
        ws.write_string(row, column, DASH, styles["text"])
    else:
        ws.write_number(row, column, number, styles["rate"])


def _date(ws, row: int, column: int, value, styles) -> None:
    parsed = _as_datetime(value)
    if parsed is None:
        ws.write_string(row, column, DASH, styles["text"])
    else:
        ws.write_datetime(row, column, parsed, styles["day"])


def _number(value):
    if value is None or value == "":
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


def _as_datetime(value):
    day = _iso_day(value)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        return None
    year, month, day_num = (int(part) for part in day.split("-"))
    try:
        return datetime(year, month, day_num)
    except ValueError:
        return None


def _iso_day(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _show_day(value: str) -> str:
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value or "")
    return f"{match.group(3)}.{match.group(2)}.{match.group(1)}" if match else DASH


def _stamp(value) -> str:
    if value is None:
        return DASH
    text = value.isoformat() if hasattr(value, "isoformat") else str(value)
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})", text)
    return f"{match.group(3)}.{match.group(2)}.{match.group(1)} {match.group(4)}:{match.group(5)}" if match else text


def _plain(value) -> str:
    if value is None:
        return ""
    text = "".join(ch for ch in str(value) if ch in "\t\n\r" or ord(ch) >= 32)
    return text[:CELL_LIMIT]
