"""Выгрузка карточки: книга, фильтры, очередь и контракт HTTP."""
import threading
import time
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from pydantic import ValidationError

from app.export_book import Filters, Snapshot, load_snapshot, ordered, visible_limits, write_workbook
from app.export_jobs import FAILED, ExportRequest, ExportRunner, ExportBusy


def _client():
    return {
        "inn": "7702070139",
        "name": "=Банк ВТБ",
        "ogrn": "1027739609391",
        "kpp": "784201001",
        "address": "Санкт-Петербург",
        "okved": "64.19",
        "group": {"crm_id": "1-VTB", "name": "ГК ВТБ"},
    }


def _limits():
    comment = "=1+1\n+cmd\n-1\n@sum\n" + ("я" * 40000)
    return {
        "limits": [
            {
                "owner": "Инвестиционный блок",
                "product": "Облигации",
                "status": "Активен",
                "status_code": "active",
                "currency": "RUB",
                "start_date": date(2025, 9, 12),
                "end_date": date(2026, 9, 11),
                "lim_value": Decimal("21000000.50"),
                "lim_utiled": Decimal("1000"),
                "rest_lim": Decimal("20999000.50"),
                "rate": Decimal("12.5"),
                "client_raroc": Decimal("1.2"),
                "comment": comment,
                "lim_top": "крышка",
            },
            {
                "owner": "Корпоративный блок",
                "product": "Закрытый продукт",
                "status": "Не активен",
                "status_code": "inactive",
                "currency": "RUB",
                "start_date": date(2025, 9, 12),
                "end_date": date(2026, 3, 11),
                "lim_value": Decimal("5"),
                "lim_utiled": None,
                "rest_lim": None,
                "rate": None,
                "client_raroc": None,
                "comment": None,
                "lim_top": None,
            },
        ],
        "applications": [{
            "product": "ЦФА",
            "status": "На рассмотрении",
            "currency": "RUB",
            "owner": "Корпоративный блок",
            "start_date": date(2026, 1, 30),
            "end_date": date(2026, 12, 31),
            "lim_value": Decimal("500000"),
            "comment": "=CMD()",
        }],
    }


def _snap(filters=None, limits=None, group=None):
    return Snapshot(
        client=_client(),
        meta={"updated_at": "2026-10-02T12:03:49Z"},
        limits=_limits() if limits is None else limits,
        group=group if group is not None else {
            "summaries": [{"currency": "RUB", "unified_limit": Decimal("213450000"), "unified_utilized": Decimal("1"), "unified_available": Decimal("2"), "total_limit": Decimal("24100000")}],
            "members": [{"inn": "7702070139", "name": "Банк ВТБ (ПАО)", "currency": "RUB", "unified_limit": Decimal("100"), "unified_utilized": Decimal("1"), "unified_available": Decimal("2")}],
        },
        filters=filters or Filters("2026-10-12", "2026-10-12", True),
        formed="12.10.2026 17:00",
    )


def _xml(path: Path) -> str:
    with zipfile.ZipFile(path) as book:
        return "\n".join(
            book.read(name).decode("utf-8")
            for name in book.namelist()
            if name.startswith("xl/") and name.endswith(".xml")
        )


def _sheet_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as book:
        root = ET.fromstring(book.read("xl/workbook.xml"))
    return [node.attrib["name"] for node in root.iter() if node.tag.endswith("sheet")]


def _row(path: Path, sheet: str, number: int) -> list[str]:
    with zipfile.ZipFile(path) as book:
        xml = book.read(sheet).decode("utf-8")
    start = xml.find(f'<row r="{number}"')
    end = xml.find("</row>", start)
    chunk = xml[start:end]
    values = []
    cursor = 0
    while True:
        token = chunk.find("<t", cursor)
        if token < 0:
            break
        open_end = chunk.find(">", token)
        close = chunk.find("</t>", open_end)
        values.append(chunk[open_end + 1:close])
        cursor = close + 4
    return values


def test_section_order_and_single_sheet(tmp_path):
    one = tmp_path / "one.xlsx"
    write_workbook(one, _snap(), ["limits"], lambda *_: None)
    assert _sheet_names(one) == ["Лимиты"]
    headers = _row(one, "xl/worksheets/sheet1.xml", 7)
    assert headers[:9] == [
        "Владелец", "Продукт", "Статус", "Сумма", "Утилизация", "Доступный",
        "Валюта", "Дата установления", "Дата окончания",
    ]
    assert "ОУЛ" in headers and headers.index("ОУЛ") < headers.index("Ставка")

    book = tmp_path / "all.xlsx"
    seen = []
    write_workbook(book, _snap(), ["reserves", "info", "applications", "limits"], lambda pct, stage: seen.append((pct, stage)))
    assert _sheet_names(book) == ["Общая информация", "Лимиты", "Лимиты на рассмотрении", "Резервы"]
    assert _row(book, "xl/worksheets/sheet3.xml", 7)[:2] == ["Продукт", "Статус"]
    assert [stage for _, stage in seen] == [
        "Формируем лист «Общая информация»",
        "Формируем лист «Лимиты»",
        "Формируем лист «Лимиты на рассмотрении»",
        "Формируем лист «Резервы»",
        "Собираем файл",
    ]
    assert [pct for pct, _ in seen] == sorted(pct for pct, _ in seen)


def test_limits_filters_match_the_screen(tmp_path):
    today = Filters("2026-10-12", "2026-10-12", True)
    closed = tmp_path / "closed.xlsx"
    write_workbook(closed, _snap(today), ["limits"], lambda *_: None)
    text = _xml(closed)
    assert "Показывать закрытые лимиты: да" in text
    assert "полный снимок на сегодня" in text
    assert "Закрытый продукт" in text
    assert "Облигации" in text

    earlier = Filters("2026-05-01", "2026-10-12", False)
    narrowed = tmp_path / "narrow.xlsx"
    write_workbook(narrowed, _snap(earlier), ["limits"], lambda *_: None)
    body = _xml(narrowed)
    assert "Облигации" in body
    assert "Закрытый продукт" not in body
    assert "Показывать закрытые лимиты: нет" in body
    assert "по сроку действия" in body
    assert "autoFilter" in body


def test_text_is_not_a_formula_and_survives_cyrillic(tmp_path):
    path = tmp_path / "safe.xlsx"
    write_workbook(path, _snap(), ["limits", "applications", "reserves"], lambda *_: None)
    xml = _xml(path)
    assert "<f>" not in xml and "<f " not in xml
    assert "=Банк ВТБ" in xml
    assert "=1+1" in xml
    assert "+cmd" in xml
    assert "@sum" in xml
    kept = 32767 - len("=1+1\n+cmd\n-1\n@sum\n")
    assert "я" * kept in xml
    assert "я" * (kept + 1) not in xml
    assert "=CMD()" not in xml
    assert "Источник данных не подключён." in xml
    assert "02.10.2026 12:03" in xml
    assert "7702070139" in xml
    with zipfile.ZipFile(path) as book:
        assert "xl/sharedStrings.xml" not in book.namelist() or "<f" not in book.read("xl/sharedStrings.xml").decode()


def test_writer_options_are_safe(monkeypatch, tmp_path):
    import xlsxwriter
    seen = {}
    real = xlsxwriter.Workbook

    def factory(path, options=None):
        seen["options"] = options
        return real(path, options)

    monkeypatch.setattr(xlsxwriter, "Workbook", factory)
    write_workbook(tmp_path / "opt.xlsx", _snap(limits={"limits": [], "applications": []}, group={"summaries": [], "members": []}), ["reserves"], lambda *_: None)
    assert seen["options"]["constant_memory"] is True
    assert seen["options"]["strings_to_formulas"] is False
    assert seen["options"]["strings_to_urls"] is False


def test_large_limits_sheet(tmp_path):
    rows = [{
        "owner": "Блок",
        "product": f"Продукт {index}",
        "status": "Активен",
        "status_code": "active",
        "currency": "RUB",
        "start_date": date(2025, 9, 12),
        "end_date": date(2026, 9, 11),
        "lim_value": Decimal(index),
        "lim_utiled": Decimal(0),
        "rest_lim": Decimal(index),
        "rate": None,
        "client_raroc": None,
        "comment": None,
        "lim_top": None,
    } for index in range(1200)]
    path = tmp_path / "large.xlsx"
    write_workbook(path, _snap(limits={"limits": rows, "applications": []}), ["limits"], lambda *_: None)
    assert "Продукт 1199" in _xml(path)


def test_visible_limits_rules():
    rows = _limits()["limits"]
    assert len(visible_limits(rows, Filters("2026-10-12", "2026-10-12", True))) == 2
    assert len(visible_limits(rows, Filters("2026-10-12", "2026-10-12", False))) == 1
    assert len(visible_limits(rows, Filters("2026-05-01", "2026-10-12", True))) == 1
    assert visible_limits(rows, Filters("", "2026-10-12", True)) == rows


def test_snapshot_queries_selected_sections_once():
    class Source:
        def __init__(self):
            self.calls = []

        def get_meta(self):
            self.calls.append("meta")
            return {"updated_at": None}

        def get_limits(self, inn):
            self.calls.append(("limits", inn))
            return {"limits": [], "applications": []}

        def get_group(self, crm_id):
            self.calls.append(("group", crm_id))
            return {"summaries": [], "members": []}

    source = Source()
    load_snapshot(_client(), ["reserves", "limits", "info", "applications"], Filters(), source)
    assert source.calls == ["meta", ("limits", "7702070139"), ("group", "1-VTB")]

    bare = Source()
    load_snapshot({"inn": "1", "name": "А", "group": None}, ["reserves"], Filters(), bare)
    assert bare.calls == ["meta"]
    assert ordered(["applications", "info"]) == ("info", "applications")


def test_runner_dedupes_and_caps_identical_work():
    gate = threading.Event()
    entered = threading.Event()

    def work(job, touch, directory: Path):
        touch(job, status="building", progress=40, stage="Формируем лист «Лимиты»")
        if job.sections == ("limits",):
            entered.set()
            gate.wait(2)
        path = directory / f"{job.id}.xlsx"
        path.write_bytes(b"pk")
        touch(job, status="ready", progress=100, stage="Готово", path=path)

    runner = ExportRunner(work=work, max_active=1, queue_limit=2, ttl=30)
    filters = Filters("2026-10-12", "2026-10-12", True)
    first = runner.submit(_client(), ["limits"], filters)
    assert entered.wait(2)
    again = runner.submit(_client(), ["limits"], filters)
    assert again.id == first.id
    second = runner.submit(_client(), ["reserves"], filters)
    assert second.id != first.id
    waiting = runner.view(second.id)
    assert waiting is not None and waiting.status == "queued"
    with pytest.raises(ExportBusy):
        runner.submit({"inn": "0000000000", "name": "Другая"}, ["info"], filters)
    gate.set()
    for _ in range(40):
        left = runner.view(first.id)
        right = runner.view(second.id)
        if left and right and left.status == "ready" and right.status == "ready":
            break
        time.sleep(0.05)
    ready = runner.view(first.id)
    assert ready is not None and ready.status == "ready" and ready.progress == 100
    assert ready.filename == "limit_module_7702070139_2026-10-12.xlsx"


def test_runner_deletes_the_file_after_ttl():
    def work(job, touch, directory: Path):
        path = directory / f"{job.id}.xlsx"
        path.write_bytes(b"pk")
        touch(job, status="ready", progress=100, stage="Готово", path=path)

    runner = ExportRunner(work=work, ttl=0.05)
    job = runner.submit(_client(), ["info"], Filters())
    path = None
    for _ in range(40):
        view = runner.view(job.id)
        if view and view.status == "ready":
            path = view.path
            break
        time.sleep(0.01)
    assert path is not None and path.exists()
    time.sleep(0.08)
    assert runner.view(job.id) is None
    assert not path.exists()


def test_runner_hides_the_exception():
    def work(job, touch, directory):
        raise RuntimeError("secret boom")

    runner = ExportRunner(work=work, max_active=1)
    job = runner.submit(_client(), ["info"], Filters())
    for _ in range(40):
        view = runner.view(job.id)
        if view and view.status == "failed":
            break
        time.sleep(0.02)
    assert view.status == "failed"
    assert view.stage == FAILED
    assert "secret" not in view.stage


def test_request_allowlist():
    with pytest.raises(ValidationError):
        ExportRequest.model_validate({"sections": ["sheet"], "filters": {}})
    with pytest.raises(ValidationError):
        ExportRequest.model_validate({"sections": ["info", "info"]})
    with pytest.raises(ValidationError):
        ExportRequest.model_validate({"sections": ["limits"], "filters": {"as_of": "12.10.2026"}})
    body = ExportRequest.model_validate({"sections": ["limits", "reserves"], "filters": {"as_of": "2026-10-12", "show_closed": False}})
    assert [item.value for item in body.sections] == ["limits", "reserves"]


@pytest.fixture
def api(app_pool):
    from fastapi.testclient import TestClient
    from app.export_jobs import runner
    from app.main import app
    runner.reset()
    with TestClient(app) as client:
        yield client
    runner.reset()


def _wait(api, export_id: str) -> dict:
    last = {}
    for _ in range(80):
        last = api.get(f"/api/exports/{export_id}").json()
        if last["status"] in ("ready", "failed"):
            return last
        time.sleep(0.05)
    return last


def test_http_export_downloads_selected_sheets_once(api, monkeypatch, tmp_path):
    from app import queries
    names = {"client": "get_client", "limits": "get_limits", "group": "get_group", "meta": "get_meta"}
    counts = dict.fromkeys(names, 0)
    real = {key: getattr(queries, name) for key, name in names.items()}

    def wrap(key):
        def inner(*args, **kwargs):
            counts[key] += 1
            return real[key](*args, **kwargs)
        return inner

    for key, name in names.items():
        monkeypatch.setattr(queries, name, wrap(key))

    created = api.post("/api/clients/7702070139/exports", json={
        "sections": ["info", "limits", "applications", "reserves"],
        "filters": {"as_of": "2026-10-12", "today": "2026-10-12", "show_closed": False},
    })
    assert created.status_code == 202
    export_id = created.json()["export_id"]
    status = _wait(api, export_id)
    assert status["status"] == "ready"
    assert status["progress"] == 100
    assert status["stage"] == "Готово"
    assert "Traceback" not in status["stage"]

    downloaded = api.get(f"/api/exports/{export_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert "limit_module_7702070139_2026-10-12.xlsx" in downloaded.headers["content-disposition"]
    target = tmp_path / "card.xlsx"
    target.write_bytes(downloaded.content)
    assert _sheet_names(target) == ["Общая информация", "Лимиты", "Лимиты на рассмотрении", "Резервы"]
    body = _xml(target)
    assert "Показывать закрытые лимиты: нет" in body
    assert "<f>" not in body and "<f " not in body
    assert api.get(f"/api/exports/{export_id}/download").status_code == 404
    assert counts == {"client": 1, "limits": 1, "group": 1, "meta": 1}


def test_http_rejects_unknown_company_and_section(api):
    assert api.post("/api/clients/0000000000/exports", json={"sections": ["info"]}).status_code == 404
    assert api.post("/api/clients/7702070139/exports", json={"sections": ["events"]}).status_code == 422
    assert api.get("/api/exports/not-a-uuid").status_code == 422
