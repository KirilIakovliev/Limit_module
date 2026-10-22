"""Отображение живой копии витрин: пробелы, доли, карточка, дубли строк.

Только чтение. Строки витрин не меняются и не схлопываются.
"""
from decimal import Decimal

import pytest

from app import db, queries


@pytest.fixture(autouse=True)
def _pool(app_db):
    return app_db


def test_padded_currency_keeps_every_limit_row():
    row = db.fetch_one(
        """
        SELECT inn
        FROM t_lm_1_3_limits
        WHERE currency <> btrim(currency) AND inn IS NOT NULL
        LIMIT 1
        """
    )
    assert row, "в выгрузке нет лимита с пробелом в валюте"
    inn = row["inn"].strip()
    stored = db.fetch_one(
        "SELECT count(*) AS n FROM t_lm_1_3_limits WHERE btrim(inn) = %(inn)s",
        {"inn": inn},
    )["n"]
    data = queries.get_limits(inn)
    shown = data["limits"] + data["applications"]
    assert len(shown) == stored
    assert all(item["currency"] == (item["currency"] or "").strip() for item in shown)
    assert any(item["currency"] == "RUB" for item in shown)


def test_percent_amount_is_not_rounded_in_api():
    row = db.fetch_one(
        """
        SELECT btrim(inn) AS inn, lim_value
        FROM t_lm_1_3_limits
        WHERE btrim(currency) = '%' AND lim_value = 0.017
        LIMIT 1
        """
    )
    assert row
    data = queries.get_limits(row["inn"])
    values = [item["lim_value"] for item in data["limits"] if item["currency"] == "%"]
    assert Decimal("0.017000") in values


def test_duplicate_limit_id_is_returned_twice():
    row = db.fetch_one(
        """
        SELECT btrim(inn) AS inn, limit_id
        FROM t_lm_1_3_limits
        WHERE inn IS NOT NULL
        GROUP BY btrim(inn), limit_id
        HAVING count(*) > 1
        LIMIT 1
        """
    )
    assert row
    data = queries.get_limits(row["inn"])
    same = [item for item in data["limits"] + data["applications"] if item["limit_id"] == row["limit_id"]]
    stored = db.fetch_one(
        """
        SELECT count(*) AS n
        FROM t_lm_1_3_limits
        WHERE btrim(inn) = %(inn)s AND limit_id = %(limit_id)s
        """,
        {"inn": row["inn"], "limit_id": row["limit_id"]},
    )["n"]
    assert len(same) == stored
    assert stored >= 2


def test_egar_lm_source_is_readable():
    row = db.fetch_one(
        """
        SELECT btrim(uparty_inn_code) AS inn
        FROM t_lm_1_2_clients
        WHERE "source" = 'egar_lm'
        LIMIT 1
        """
    )
    assert row
    card = queries.get_client(row["inn"])
    assert card is not None
    assert card["source"] == "egar_lm"
    assert card["inn"] == row["inn"]
    assert card["name"]


def test_member_without_card_uses_single_limit_name():
    row = db.fetch_one(
        """
        SELECT g.group_crm_id1 AS crm_id, btrim(g.party_inn) AS inn
        FROM t_lm_1_2_gk_info g
        WHERE NOT EXISTS (
            SELECT 1 FROM t_lm_1_2_clients c
            WHERE btrim(c.uparty_inn_code) = btrim(g.party_inn)
        )
          AND (
            SELECT count(DISTINCT btrim(l.client_name))
            FROM t_lm_1_3_limits l
            WHERE btrim(l.inn) = btrim(g.party_inn)
              AND l.client_name IS NOT NULL
              AND btrim(l.client_name) <> ''
          ) = 1
        LIMIT 1
        """
    )
    assert row
    group = queries.get_group(row["crm_id"])
    member = next(item for item in group["members"] if item["inn"] == row["inn"])
    assert member["has_card"] is False
    assert member["name"]


def test_member_without_any_name_stays_empty():
    row = db.fetch_one(
        """
        SELECT g.group_crm_id1 AS crm_id, btrim(g.party_inn) AS inn
        FROM t_lm_1_2_gk_info g
        WHERE NOT EXISTS (
            SELECT 1 FROM t_lm_1_2_clients c
            WHERE btrim(c.uparty_inn_code) = btrim(g.party_inn)
        )
          AND NOT EXISTS (
            SELECT 1 FROM t_lm_1_3_limits l
            WHERE btrim(l.inn) = btrim(g.party_inn)
              AND l.client_name IS NOT NULL
              AND btrim(l.client_name) <> ''
          )
        LIMIT 1
        """
    )
    assert row
    group = queries.get_group(row["crm_id"])
    member = next(item for item in group["members"] if item["inn"] == row["inn"])
    assert member["has_card"] is False
    assert member["name"] is None
