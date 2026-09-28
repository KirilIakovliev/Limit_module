"""
SQL к копиям итоговых витрин DataHub и функции доступа к данным.

Имена таблиц без схемы — search_path задаёт db.py (REPLICA_SCHEMA, app).
Каждый запрос читает витрины как есть: значения не пересчитываются
(rest_lim берётся из витрины, агрегаты уровня ГК — MAX, а не SUM).

Соответствие UI → SQL → колонка: docs/database_migration.md.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db

STALE_AFTER = timedelta(hours=24)

# ----------------------------------------------------------------------------
# Общие фрагменты
# ----------------------------------------------------------------------------
# Дедупликация клиентов: в t_lm_1_2_clients один ИНН может встречаться
# несколько раз (source = 'datahub' / 'egar'). Предпочитаем строку DataHub,
# затем ту, где заполнен ОГРН.
CLIENT_PREFERENCE = '("source" = \'datahub\') DESC, (uparty_ogrn_code IS NULL), uparty_short_name'

# ----------------------------------------------------------------------------
# Поиск и карточка клиента — t_lm_1_2_clients
# ----------------------------------------------------------------------------
SEARCH_SQL = f"""
WITH hits AS (
    SELECT DISTINCT ON (uparty_inn_code)
           uparty_inn_code, uparty_short_name, uparty_kpp_code
    FROM t_lm_1_2_clients
    WHERE uparty_inn_code IS NOT NULL
      AND ({{where}})
    ORDER BY uparty_inn_code, {CLIENT_PREFERENCE}
)
SELECT uparty_inn_code AS inn, uparty_short_name AS name, uparty_kpp_code AS kpp
FROM hits
ORDER BY NULLIF(position(%(q)s IN lower(uparty_short_name)), 0) NULLS LAST,
         uparty_short_name, uparty_inn_code
LIMIT %(limit)s
"""
SEARCH_BY_INN = SEARCH_SQL.format(where="uparty_inn_code LIKE %(prefix)s")
SEARCH_BY_NAME = SEARCH_SQL.format(where="uparty_short_name ILIKE %(sub)s")
# Запасной путь: опечатки (pg_trgm, оператор word_similarity).
SEARCH_FUZZY = SEARCH_SQL.format(where="%(q)s <%% lower(uparty_short_name)")

CLIENT_SQL = f"""
SELECT uparty_inn_code, uparty_code, uparty_short_name, uparty_ogrn_code,
       uparty_kpp_code, okved_code, ods_full_address, "source"
FROM t_lm_1_2_clients
WHERE uparty_inn_code = %(inn)s
ORDER BY {CLIENT_PREFERENCE}
LIMIT 1
"""

# ГК клиента: строки t_lm_1_2_gk_info по party_inn; fallback — gk_* из лимитов.
CLIENT_GROUP_SQL = """
SELECT group_crm_id1 AS crm_id, max(group_name) AS name
FROM t_lm_1_2_gk_info
WHERE party_inn = %(inn)s AND group_crm_id1 IS NOT NULL
GROUP BY group_crm_id1
ORDER BY group_crm_id1
"""
CLIENT_GROUP_FALLBACK_SQL = """
SELECT gk_crm_id AS crm_id, max(gk_name) AS name
FROM t_lm_1_3_limits
WHERE inn = %(inn)s AND gk_crm_id IS NOT NULL
GROUP BY gk_crm_id
ORDER BY gk_crm_id
"""

# ----------------------------------------------------------------------------
# Группа компаний — t_lm_1_2_gk_info
# ----------------------------------------------------------------------------
# Колонки «… на гк» повторяются в каждой строке участника -> MAX (НЕ SUM).
# Колонки «… по клиенту» уникальны по (клиент, валюта) -> SUM по группе.
GROUP_SUMMARY_SQL = """
SELECT group_crm_id1                                   AS crm_id,
       max(group_name)                                 AS name,
       currency,
       count(*)                                        AS members,
       max("cовокупный лимит на гк")                   AS total_limit,
       max("утилиз-й совокупный лимит на гк")          AS total_utilized,
       max("доступный совокупный лимит на гк")         AS total_available,
       sum("единый лимит по клиенту")                  AS unified_limit,
       sum("утилиз-й единый лимит по клиенту")         AS unified_utilized,
       sum("доступный единый лимит по клиенту")        AS unified_available
FROM t_lm_1_2_gk_info
WHERE group_crm_id1 = %(crm_id)s
GROUP BY group_crm_id1, currency
ORDER BY (currency = 'RUB') DESC, currency
"""

# Имя участника — из t_lm_1_2_clients (LATERAL ... LIMIT 1 исключает размножение
# строк при дублях), fallback — client_name из t_lm_1_3_limits.
GROUP_MEMBERS_SQL = f"""
SELECT g.party_inn                                     AS inn,
       coalesce(c.uparty_short_name, l.client_name)    AS name,
       g.currency,
       g."единый лимит по клиенту"                     AS unified_limit,
       g."утилиз-й единый лимит по клиенту"            AS unified_utilized,
       g."доступный единый лимит по клиенту"           AS unified_available,
       (c.uparty_inn_code IS NOT NULL)                 AS has_card
FROM t_lm_1_2_gk_info g
LEFT JOIN LATERAL (
    SELECT uparty_inn_code, uparty_short_name
    FROM t_lm_1_2_clients
    WHERE uparty_inn_code = g.party_inn
    ORDER BY {CLIENT_PREFERENCE}
    LIMIT 1
) c ON true
LEFT JOIN LATERAL (
    SELECT client_name FROM t_lm_1_3_limits
    WHERE inn = g.party_inn AND client_name IS NOT NULL
    LIMIT 1
) l ON true
WHERE g.group_crm_id1 = %(crm_id)s
ORDER BY (g.currency = 'RUB') DESC, g.currency, g."единый лимит по клиенту" DESC NULLS LAST, g.party_inn
"""

# ----------------------------------------------------------------------------
# Лимиты и потенциальные сделки — t_lm_1_3_limits (+ comment_egar)
# ----------------------------------------------------------------------------
LIMITS_SQL = """
SELECT l.inn, l.client_name, l.gk_crm_id, l.gk_name, l.owner, l.limit_id,
       l.currency, l.product, l.start_date, l.end_date, l.src_status, l.limit_status,
       l.rate, l.lim_value, l.lim_utiled, l.rest_lim, l.client_limits, l.lim_top, l.client_raroc,
       e.comment_egar
FROM t_lm_1_3_limits l
LEFT JOIN LATERAL (
    SELECT comment_egar
    FROM t_lm_egar_limits e
    WHERE l.owner ILIKE 'Инвестиционный%%'
      AND e.id::text = l.limit_id
      AND e.comment_egar IS NOT NULL
    LIMIT 1
) e ON true
WHERE l.inn = %(inn)s
ORDER BY l.owner, l.currency, l.lim_value DESC NULLS LAST, l.limit_id
"""

# Единые показатели клиента (по валютам) — уже посчитаны витриной, не SUM лимитов.
CLIENT_UNIFIED_SQL = """
SELECT group_crm_id1 AS group_crm_id, group_name, currency,
       "единый лимит по клиенту"             AS unified_limit,
       "утилиз-й единый лимит по клиенту"    AS unified_utilized,
       "доступный единый лимит по клиенту"   AS unified_available
FROM t_lm_1_2_gk_info
WHERE party_inn = %(inn)s
ORDER BY (currency = 'RUB') DESC, currency
"""

# ----------------------------------------------------------------------------
# Актуальность копии — app.load_log
# ----------------------------------------------------------------------------
META_SQL = "SELECT max(loaded_at) AS loaded_at, max(data_date) AS data_date FROM app.load_log"


# ----------------------------------------------------------------------------
# Функции доступа
# ----------------------------------------------------------------------------
def _strip(v):
    return v.strip() if isinstance(v, str) else v


def status_code(limit_status: str | None) -> str:
    """Код статуса по префиксу limit_status витрины:
    «Активен – …» / «Не активен – …» / «На рассмотрении – …»."""
    s = (limit_status or "").strip().lower()
    if s.startswith("не активен"):
        return "inactive"
    if s.startswith("активен"):
        return "active"
    if s.startswith("на рассмотрении"):
        return "pending"
    return "unknown"


def search_clients(q: str, limit: int = 8) -> list[dict]:
    q_norm = q.strip().lower()
    params = {"q": q_norm, "prefix": f"{q.strip()}%", "sub": f"%{q_norm}%", "limit": limit}
    rows = db.fetch_all(SEARCH_BY_INN if q_norm[:1].isdigit() else SEARCH_BY_NAME, params)
    if len(rows) < 3 and not q_norm[:1].isdigit():
        seen = {r["inn"] for r in rows}
        rows += [r for r in db.fetch_all(SEARCH_FUZZY, params) if r["inn"] not in seen]
        rows = rows[:limit]
    return [{k: _strip(v) for k, v in r.items()} for r in rows]


def get_client(inn: str) -> dict | None:
    r = db.fetch_one(CLIENT_SQL, {"inn": inn})
    if not r:
        return None
    groups = db.fetch_all(CLIENT_GROUP_SQL, {"inn": inn}) or db.fetch_all(CLIENT_GROUP_FALLBACK_SQL, {"inn": inn})
    return {
        "inn": r["uparty_inn_code"],
        "name": _strip(r["uparty_short_name"]),
        "code": _strip(r["uparty_code"]),
        "ogrn": _strip(r["uparty_ogrn_code"]),
        "kpp": _strip(r["uparty_kpp_code"]),
        "address": _strip(r["ods_full_address"]),
        "okved": _strip(r["okved_code"]),
        "source": _strip(r["source"]),
        "group": {"crm_id": groups[0]["crm_id"], "name": _strip(groups[0]["name"])} if groups else None,
        "groups_found": len(groups),
    }


def get_group(crm_id: str) -> dict | None:
    summaries = db.fetch_all(GROUP_SUMMARY_SQL, {"crm_id": crm_id})
    if not summaries:
        return None
    members = db.fetch_all(GROUP_MEMBERS_SQL, {"crm_id": crm_id})
    for s in summaries:
        s["currency"] = _strip(s["currency"])
        s["is_exceeded"] = (
            s["total_utilized"] is not None and s["total_limit"] is not None
            and s["total_utilized"] > s["total_limit"]
        )
    for m in members:
        m["currency"] = _strip(m["currency"])
        m["name"] = _strip(m["name"])
    return {
        "crm_id": crm_id,
        "name": _strip(next((s["name"] for s in summaries if s["name"]), None)),
        "summaries": summaries,
        "members": members,
    }


def get_limits(inn: str) -> dict:
    rows = db.fetch_all(LIMITS_SQL, {"inn": inn})
    limits, applications = [], []
    for r in rows:
        item = {
            "limit_id": r["limit_id"],
            "owner": _strip(r["owner"]),
            "product": _strip(r["product"]),
            "currency": _strip(r["currency"]),
            "status": _strip(r["limit_status"]),
            "status_code": status_code(r["limit_status"]),
            "src_status": _strip(r["src_status"]),
            "start_date": r["start_date"],
            "end_date": r["end_date"],
            "rate": r["rate"],
            "lim_value": r["lim_value"],
            "lim_utiled": r["lim_utiled"],
            "rest_lim": r["rest_lim"],
            "client_limits": _strip(r["client_limits"]),
            "lim_top": _strip(r["lim_top"]),
            "client_raroc": r["client_raroc"],
            "comment": _strip(r["comment_egar"]),
            "is_exceeded": (
                r["lim_utiled"] is not None and r["lim_value"] is not None
                and r["lim_utiled"] > r["lim_value"]
            ),
        }
        (applications if item["status_code"] == "pending" else limits).append(item)
    unified = db.fetch_all(CLIENT_UNIFIED_SQL, {"inn": inn})
    for u in unified:
        u["currency"] = _strip(u["currency"])
        u["group_name"] = _strip(u["group_name"])
    client_name = next((_strip(r["client_name"]) for r in rows if r["client_name"]), None)
    return {"inn": inn, "client_name": client_name, "limits": limits, "applications": applications, "unified": unified}


def get_meta() -> dict:
    r = db.fetch_one(META_SQL) or {}
    loaded_at = r.get("loaded_at")
    stale = loaded_at is None or (datetime.now(timezone.utc) - loaded_at) > STALE_AFTER
    return {
        "updated_at": loaded_at,
        "data_date": r.get("data_date"),
        "stale": stale,
        "stale_after_hours": int(STALE_AFTER.total_seconds() // 3600),
    }
