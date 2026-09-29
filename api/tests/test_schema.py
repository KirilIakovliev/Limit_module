"""
Сверка структуры TEST-БД с DDL команды данных (context/data/ddl/*).

EXPECTED — снимок исходных DDL после преобразования типов по docs/ddl_conversion.md
(раздел 2), в исходном порядке колонок. Снимок сгенерирован из .txt файлов источника;
при обновлении DDL источника его нужно перегенерировать (см. docs/ddl_conversion.md, раздел 6).

Проверяется:
  * состав таблиц, имена/порядок колонок, типы, precision/scale NUMERIC;
  * все колонки nullable, нет PK/FK/UNIQUE/CHECK на копиях (в источнике их нет);
  * присутствие логических ключей из ЛМД (физически не создаются);
  * единственное задокументированное отклонение имён (GAP G11).
"""
import pytest

# GAP G11: имя источника > 63 байт (предел идентификатора PostgreSQL) -> сокращённое имя в копии.
RENAMED = {
    ("sbox_rsk_drt.t_lm_1_2_gk_info", "утилизированный совокупный лимит на гк"): "утилиз-й совокупный лимит на гк",
}

# (имя колонки в источнике, data_type, numeric_precision, numeric_scale)
EXPECTED = {
    "sbox_rsk_drt.t_lm_1_2_clients": [
        ("uparty_inn_code", "text", None, None),
        ("uparty_code", "text", None, None),
        ("uparty_short_name", "text", None, None),
        ("uparty_ogrn_code", "text", None, None),
        ("uparty_kpp_code", "text", None, None),
        ("okved_code", "text", None, None),
        ("ods_full_address", "text", None, None),
        ("source", "text", None, None),
    ],
    "sbox_rsk_drt.t_lm_1_2_gk_info": [
        ("group_name", "text", None, None),
        ("group_crm_id1", "text", None, None),
        ("currency", "text", None, None),
        ("party_inn", "text", None, None),
        ("cовокупный лимит на гк", "numeric", 15, 2),  # латинская c, как в источнике
        ("утилизированный совокупный лимит на гк", "numeric", 38, 7),
        ("доступный совокупный лимит на гк", "numeric", 38, 6),
        ("единый лимит по клиенту", "numeric", 38, 6),
        ("утилиз-й единый лимит по клиенту", "numeric", 38, 6),
        ("доступный единый лимит по клиенту", "numeric", 38, 6),
    ],
    "sbox_rsk_drt.t_lm_1_3_limits": [
        ("inn", "text", None, None),
        ("client_name", "text", None, None),
        ("gk_crm_id", "text", None, None),
        ("gk_name", "text", None, None),
        ("owner", "text", None, None),
        ("limit_id", "text", None, None),
        ("currency", "text", None, None),
        ("product", "text", None, None),
        ("start_date", "date", None, None),
        ("end_date", "date", None, None),
        ("src_status", "text", None, None),
        ("limit_status", "text", None, None),
        ("rate", "numeric", 38, 10),
        ("lim_value", "numeric", 38, 6),
        ("lim_utiled", "numeric", 38, 6),
        ("rest_lim", "numeric", 38, 6),
        ("client_limits", "text", None, None),
        ("lim_top", "text", None, None),
        ("client_raroc", "numeric", 15, 2),
    ],
    "sbox_rsk_drt.t_lm_egar_limits": [
        ("category_root", "text", None, None),
        ("category_parent", "text", None, None),
        ("id", "integer", None, None),
        ("name", "text", None, None),
        ("product_type", "text", None, None),
        ("category_id", "integer", None, None),
        ("limit_category", "text", None, None),
        ("client_name", "text", None, None),
        ("inn", "text", None, None),
        ("type", "text", None, None),
        ("start_date", "date", None, None),
        ("end_date", "date", None, None),
        ("value_currency_code", "text", None, None),
        ("value", "numeric", 21, 4),
        ("current_value", "numeric", 21, 4),
        ("rest_lim", "numeric", 22, 4),
        ("source_status", "text", None, None),
        ("life_status_mapped", "text", None, None),
        ("comment_egar", "text", None, None),
    ],
    "sbox_rsk_drt.stg_file_client_limit": [
        ("client_inn", "text", None, None),
        ("client_name", "text", None, None),
        ("group_name", "text", None, None),
        ("limit_product", "text", None, None),
        ("currency", "text", None, None),
        ("client_limit", "numeric", 15, 2),
        ("limit_description", "text", None, None),
        ("managing_dep", "text", None, None),
        ("decision_date", "date", None, None),
        ("group_crm_id", "text", None, None),
        ("actuality_comment", "text", None, None),
    ],
    "sbox_rsk_drt.stg_file_egar_clients": [
        ("client_name", "text", None, None),
        ("inn", "text", None, None),
        ("gk_crm_id", "text", None, None),
        ("foreign_id", "text", None, None),
        ("comments", "text", None, None),
    ],
    "sbox_rsk_drt.stg_file_group_limit": [
        ("group_name", "text", None, None),
        ("group_limit", "numeric", 15, 2),
        ("currency", "text", None, None),
        ("group_crm_id", "text", None, None),
        ("ancestor_inn", "text", None, None),
        ("comment_dkkr", "text", None, None),
        ("managing_dep", "text", None, None),
        ("decision_date", "date", None, None),
    ],
    "sbox_rsk_drt.stg_file_raroc": [
        ("report_dt", "date", None, None),
        ("inn", "text", None, None),
        ("client_raroc", "numeric", 15, 2),
    ],
    "srd.corpgen_appl_sct": [
        ("report_date", "date", None, None),
        ("appltype_code", "text", None, None),
        ("appl_code", "text", None, None),
        ("appl_src_code", "text", None, None),
        ("appl_name", "text", None, None),
        ("applno_code", "text", None, None),
        ("applform_name", "text", None, None),
        ("srcapplkind_code", "text", None, None),
        ("srcapplkind_name", "text", None, None),
        ("application_date", "date", None, None),
        ("srcproducttype_code", "text", None, None),
        ("srcproduct_code", "text", None, None),
        ("srcproduct_name", "text", None, None),
        ("partytype_code", "text", None, None),
        ("party_code", "text", None, None),
        ("upartytype_code", "text", None, None),
        ("uparty_code", "text", None, None),
        ("uparty_inn_code", "text", None, None),
        ("currency_code", "text", None, None),
        ("srcapplstatus_code", "text", None, None),
        ("srcapplstatus_name", "text", None, None),
        ("dealtype_code", "text", None, None),
        ("deal_code", "text", None, None),
        ("dealno_code", "text", None, None),
        ("request_nm_amt", "numeric", 19, 4),
        ("appl_dealstart_date", "date", None, None),
        ("appl_dealend_date", "date", None, None),
        ("appl_dealratetype_code", "text", None, None),
        ("deal_ratetype_code", "text", None, None),
        ("appl_dealrate_pct", "numeric", 19, 4),
        ("appl_subject_text", "text", None, None),
        ("from_date", "date", None, None),
        ("to_date", "date", None, None),
        ("deleted_flag", "boolean", None, None),
        ("source_code", "text", None, None),
        ("functionrun_insert_id", "bigint", None, None),
        ("functionrun_update_id", "bigint", None, None),
        ("sys_insert_stamp", "timestamp without time zone", None, None),
        ("sys_update_stamp", "timestamp without time zone", None, None),
        ("limit_status_code", "text", None, None),
    ],
    "srd.corpgen_clientgoldcards_sct": [
        ("uparty_inn_code", "text", None, None),
        ("upartytype_code", "text", None, None),
        ("uparty_code", "text", None, None),
        ("uparty_short_name", "text", None, None),
        ("uparty_ogrn_code", "text", None, None),
        ("uparty_kpp_code", "text", None, None),
        ("isbranch_flag", "text", None, None),
        ("orgrnokvedadrnotnull_flag", "text", None, None),
        ("orgrnokvedoradrnotnull_flag", "text", None, None),
        ("lastappl_date", "date", None, None),
        ("eq_lastupdate_date", "date", None, None),
        ("crm_lastupdate_date", "date", None, None),
        ("orgrnnotnull_flag", "text", None, None),
        ("okved_code", "text", None, None),
        ("full_address_text", "text", None, None),
        ("from_date", "date", None, None),
        ("to_date", "date", None, None),
        ("report_date", "date", None, None),
        ("deleted_flag", "boolean", None, None),
        ("source_code", "text", None, None),
        ("functionrun_insert_id", "bigint", None, None),
        ("functionrun_update_id", "bigint", None, None),
        ("sys_insert_stamp", "timestamp without time zone", None, None),
        ("sys_update_stamp", "timestamp without time zone", None, None),
    ],
    "srd.corpgen_iblimit_sct": [
        ("limit_rootcat_name", "text", None, None),
        ("limit_parentcat_name", "text", None, None),
        ("limit_code", "text", None, None),
        ("limit_name", "text", None, None),
        ("limit_product_name", "text", None, None),
        ("limit_cat_code", "text", None, None),
        ("limit_cat_name", "text", None, None),
        ("party_name", "text", None, None),
        ("limit_type_code", "text", None, None),
        ("limit_start_date", "date", None, None),
        ("limit_end_date", "date", None, None),
        ("currency_code", "text", None, None),
        ("limit_nm_amt", "numeric", 19, 4),
        ("limit_utilednm_amt", "numeric", 19, 4),
        ("limit_restnm_amt", "numeric", 19, 4),
        ("limit_srcstatus_name", "text", None, None),
        ("limit_comment_text", "text", None, None),
        ("from_date", "date", None, None),
        ("to_date", "date", None, None),
        ("report_date", "date", None, None),
        ("deleted_flag", "boolean", None, None),
        ("source_code", "text", None, None),
        ("functionrun_insert_id", "bigint", None, None),
        ("functionrun_update_id", "bigint", None, None),
        ("sys_insert_stamp", "timestamp without time zone", None, None),
        ("sys_update_stamp", "timestamp without time zone", None, None),
        ("limit_status_code", "text", None, None),
        ("limit_srclifestatus_name", "text", None, None),
    ],
    "srd.corpgen_party2group_ict": [
        ("partytype_code", "text", None, None),
        ("party_code", "text", None, None),
        ("party_src_code", "text", None, None),
        ("grouptype_code", "text", None, None),
        ("group_code", "text", None, None),
        ("group_src_code", "text", None, None),
        ("from_date", "date", None, None),
        ("to_date", "date", None, None),
        ("relationsource_code", "text", None, None),
        ("infosystem_code", "text", None, None),
        ("deleted_flag", "boolean", None, None),
        ("source_code", "text", None, None),
        ("functionrun_insert_id", "bigint", None, None),
        ("functionrun_update_id", "bigint", None, None),
        ("sys_insert_stamp", "timestamp without time zone", None, None),
        ("sys_update_stamp", "timestamp without time zone", None, None),
    ],
    "sbox_rsk_drt.t_util": [
        ("report_date", "date", None, None),
        ("partytype_code", "text", None, None),
        ("party_code", "text", None, None),
        ("party_short_name", "text", None, None),
        ("inn_code", "text", None, None),
        ("partytype_goldcard_code", "text", None, None),
        ("party_goldcard_code", "text", None, None),
        ("goldcard_short_name", "text", None, None),
        ("goldcard_inn_code", "text", None, None),
        ("dealtype_code", "text", None, None),
        ("deal_code", "text", None, None),
        ("dealtype_parent_code", "text", None, None),
        ("deal_parent_code", "text", None, None),
        ("deal_src_code", "text", None, None),
        ("dealno_code", "text", None, None),
        ("currency_iso_code", "text", None, None),
        ("accountno_main_code", "text", None, None),
        ("main_nm_amt", "numeric", 38, 8),
        ("main_eq_amt", "numeric", 38, 8),
        ("accountno_mainover_code", "text", None, None),
        ("mainover_nm_amt", "numeric", 38, 8),
        ("mainover_eq_amt", "numeric", 38, 8),
        ("accountno_undebtlim_code", "text", None, None),
        ("undebtlim_nm_amt", "numeric", 38, 8),
        ("undebtlim_eq_amt", "numeric", 38, 8),
    ],
}

# Логические ключи по ЛМД (физически не создаются, только проверка наличия колонок)
LOGICAL_KEYS = {
    "sbox_rsk_drt.t_lm_1_2_clients": ["uparty_inn_code"],
    "sbox_rsk_drt.t_lm_1_2_gk_info": ["group_crm_id1", "party_inn", "currency"],
    "sbox_rsk_drt.t_lm_1_3_limits": ["inn", "limit_id"],
    "sbox_rsk_drt.t_lm_egar_limits": ["id"],
}


def _actual_columns(conn, schema, table):
    return conn.execute(
        """
        SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema, table),
    ).fetchall()


def test_total_column_count_matches_source():
    assert sum(len(v) for v in EXPECTED.values()) == 216
    assert len(EXPECTED) == 13


@pytest.mark.parametrize("full_name", sorted(EXPECTED))
def test_table_matches_source_ddl(conn, full_name):
    schema, table = full_name.split(".")
    actual = _actual_columns(conn, schema, table)
    assert actual, f"таблица {full_name} отсутствует в TEST-БД"

    expected = [
        (RENAMED.get((full_name, name), name), dtype, prec, scale)
        for name, dtype, prec, scale in EXPECTED[full_name]
    ]
    # precision/scale значимы только для NUMERIC; для integer/bigint каталог отдаёт 32/64.
    got = [
        (
            r["column_name"],
            r["data_type"],
            r["numeric_precision"] if r["data_type"] == "numeric" else None,
            r["numeric_scale"] if r["data_type"] == "numeric" else None,
        )
        for r in actual
    ]
    assert got == expected, f"{full_name}: структура отличается от DDL источника"
    assert all(r["is_nullable"] == "YES" for r in actual), f"{full_name}: в источнике все колонки nullable"


def test_no_constraints_on_replicas(conn):
    names = [full.split(".", 1)[1] for full in EXPECTED]
    rows = conn.execute(
        """
        SELECT table_schema, table_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema IN ('sbox_rsk_drt', 'srd')
          AND table_name = ANY(%s)
          AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
        """,
        (names,),
    ).fetchall()
    assert rows == [], f"на копиях DataHub не должно быть ограничений: {rows}"


def test_no_indexes_on_replicas(conn):
    """Индексы допускаются только по итогам этапа 13 (EXPLAIN ANALYZE) и должны быть
    задокументированы; на этом этапе их нет."""
    names = [full.split(".", 1)[1] for full in EXPECTED]
    rows = conn.execute(
        """
        SELECT schemaname, tablename, indexname
        FROM pg_indexes
        WHERE schemaname IN ('sbox_rsk_drt','srd')
          AND tablename = ANY(%s)
        """,
        (names,),
    ).fetchall()
    assert rows == [], f"незадокументированные индексы на копиях: {rows}"


@pytest.mark.parametrize("full_name,keys", sorted(LOGICAL_KEYS.items()))
def test_logical_keys_present(conn, full_name, keys):
    schema, table = full_name.split(".")
    names = {r["column_name"] for r in _actual_columns(conn, schema, table)}
    missing = [k for k in keys if k not in names]
    assert not missing, f"{full_name}: нет колонок логического ключа ЛМД {missing}"


def test_app_load_log_exists(conn):
    cols = {r["column_name"] for r in _actual_columns(conn, "app", "load_log")}
    assert {"table_name", "loaded_at", "data_date", "row_count", "note"} <= cols


def test_only_one_application_table(conn):
    rows = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'app' AND table_type='BASE TABLE'"
    ).fetchall()
    assert [r["table_name"] for r in rows] == ["load_log"]


def test_no_views_in_replica_or_app_schemas(conn):
    rows = conn.execute(
        "SELECT table_schema, table_name FROM information_schema.views WHERE table_schema IN ('sbox_rsk_drt','srd','app')"
    ).fetchall()
    assert rows == [], f"VIEW-слой не предусмотрен архитектурой: {rows}"
