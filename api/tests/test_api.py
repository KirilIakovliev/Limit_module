"""HTTP-контракт новых endpoints."""
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_search_and_card(client):
    r = client.get("/api/clients", params={"q": "рост"})
    assert r.status_code == 200
    inns = [x["inn"] for x in r.json()]
    assert inns.count("7707049388") == 1

    card = client.get("/api/clients/7707049388")
    assert card.status_code == 200
    body = card.json()
    assert body["inn"] == "7707049388"
    assert body["group"]["crm_id"] == "1-DDDX-39"
    assert "okved_name" not in body


def test_client_404(client):
    r = client.get("/api/clients/0000000000")
    assert r.status_code == 404
    assert "не найден" in r.json()["detail"]


def test_leading_zero_inn(client):
    r = client.get("/api/clients/0278938706")
    assert r.status_code == 200
    assert r.json()["inn"] == "0278938706"


def test_group_currencies(client):
    r = client.get("/api/groups/1-T15NKU4")
    assert r.status_code == 200
    body = r.json()
    assert {s["currency"] for s in body["summaries"]} == {"RUB", "USD"}
    rub = next(s for s in body["summaries"] if s["currency"] == "RUB")
    assert Decimal(rub["total_limit"]) == Decimal("27000000")
    assert isinstance(rub["unified_limit"], str)


def test_limits_decimal_string_and_nulls(client):
    r = client.get("/api/clients/7750004175/limits")
    assert r.status_code == 200
    body = r.json()
    assert body["applications"] == []
    row = next(x for x in body["limits"] if x["limit_id"] == "6189")
    assert isinstance(row["lim_value"], str)
    assert row["end_date"] is None
    assert row["comment"]


def test_meta_shape(client):
    r = client.get("/api/meta")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"updated_at", "data_date", "stale", "stale_after_hours"}
    assert body["stale"] is False
    assert "directory" not in body


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["db"] is True
