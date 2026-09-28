"""Проверки SQL и маппинга queries.py на тестовых моках (db/91_test_marts.sql)."""
from decimal import Decimal

import pytest

from app import queries


@pytest.fixture(autouse=True)
def _pool(app_db):
    return app_db


def test_search_dedup_rostelecom():
    rows = queries.search_clients("рост")
    inns = [r["inn"] for r in rows]
    assert inns.count("7707049388") == 1
    hit = next(r for r in rows if r["inn"] == "7707049388")
    assert "Ростелеком" in hit["name"] or "РОСТЕЛЕКОМ" in hit["name"].upper()


def test_search_inn_prefix_and_leading_zero():
    rzd = queries.search_clients("7708")
    assert any(r["inn"] == "7708503727" for r in rzd)
    leading = queries.search_clients("0278")
    assert any(r["inn"] == "0278938706" for r in leading)


def test_client_card_without_group():
    c = queries.get_client("7708503727")
    assert c["name"]
    assert c["group"] is None
    assert c["groups_found"] == 0


def test_client_card_with_group_and_dedup():
    c = queries.get_client("7707049388")
    assert c["source"] == "datahub"
    assert c["group"]["crm_id"] == "1-DDDX-39"


def test_group_max_not_multiplied_and_currency_split():
    g = queries.get_group("1-T15NKU4")
    assert g is not None
    currencies = {s["currency"] for s in g["summaries"]}
    assert currencies == {"RUB", "USD"}
    rub = next(s for s in g["summaries"] if s["currency"] == "RUB")
    assert rub["members"] == 4
    assert rub["total_limit"] == Decimal("27000000.00")
    assert rub["unified_limit"] == Decimal("68150000.000000")
    usd = next(s for s in g["summaries"] if s["currency"] == "USD")
    assert usd["members"] == 1


def test_group_exceeded():
    g = queries.get_group("1-X5XU2WD")
    assert g["summaries"][0]["is_exceeded"] is True


def test_group_member_without_card():
    g = queries.get_group("1-T15NKU4")
    ghost = next(m for m in g["members"] if m["inn"] == "1655187496")
    assert ghost["has_card"] is False


def test_limits_vtb_count_and_rest_from_mart():
    data = queries.get_limits("7702070139")
    assert len(data["limits"]) == 32
    assert all(isinstance(r["lim_value"], Decimal) or r["lim_value"] is None for r in data["limits"])


def test_limits_exceeded_and_pending_split():
    mts = queries.get_limits("7702045051")
    exceeded = [r for r in mts["limits"] if r["is_exceeded"]]
    assert exceeded
    assert exceeded[0]["rest_lim"] == Decimal("-30000.000000")

    pending = queries.get_limits("2130027046")
    assert pending["limits"] == []
    assert len(pending["applications"]) == 1
    assert pending["applications"][0]["start_date"] is not None

    null_dates = queries.get_limits("0278938706")
    assert null_dates["applications"][0]["start_date"] is None
    assert null_dates["applications"][0]["end_date"] is None


def test_egar_comment_joined():
    data = queries.get_limits("7750004175")
    by_id = {r["limit_id"]: r for r in data["limits"]}
    assert "КУАП" in (by_id["6189"]["comment"] or "")
    assert by_id["6191"]["comment"] is None


def test_meta_fresh():
    meta = queries.get_meta()
    assert meta["updated_at"] is not None
    assert meta["stale"] is False
    assert meta["stale_after_hours"] == 24
