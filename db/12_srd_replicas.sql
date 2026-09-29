-- ============================================================================
-- Копии реплик источников DataHub (srd.corpgen_* и sbox_rsk_drt.t_util).
-- Структура 1:1 с DDL команды данных:
--   context/data/ddl/реплики таблиц из ДХ/*.txt
-- Backend их не читает (кандидаты для будущих GAP: номер договора, данные на дату).
-- Ограничений (PK/FK/NOT NULL/DEFAULT) в источнике нет — здесь тоже не добавляются.
-- ============================================================================

-- srd.corpgen_appl_sct definition
CREATE TABLE IF NOT EXISTS srd.corpgen_appl_sct (
	report_date DATE,
	appltype_code TEXT,
	appl_code TEXT,
	appl_src_code TEXT,
	appl_name TEXT,
	applno_code TEXT,
	applform_name TEXT,
	srcapplkind_code TEXT,
	srcapplkind_name TEXT,
	application_date DATE,
	srcproducttype_code TEXT,
	srcproduct_code TEXT,
	srcproduct_name TEXT,
	partytype_code TEXT,
	party_code TEXT,
	upartytype_code TEXT,
	uparty_code TEXT,
	uparty_inn_code TEXT,
	currency_code TEXT,
	srcapplstatus_code TEXT,
	srcapplstatus_name TEXT,
	dealtype_code TEXT,
	deal_code TEXT,
	dealno_code TEXT,
	request_nm_amt NUMERIC(19,4),
	appl_dealstart_date DATE,
	appl_dealend_date DATE,
	appl_dealratetype_code TEXT,
	deal_ratetype_code TEXT,
	appl_dealrate_pct NUMERIC(19,4),
	appl_subject_text TEXT,
	from_date DATE,
	to_date DATE,
	deleted_flag BOOLEAN,
	source_code TEXT,
	functionrun_insert_id BIGINT,
	functionrun_update_id BIGINT,
	sys_insert_stamp TIMESTAMP,
	sys_update_stamp TIMESTAMP,
	limit_status_code TEXT
);

-- srd.corpgen_clientgoldcards_sct definition
CREATE TABLE IF NOT EXISTS srd.corpgen_clientgoldcards_sct (
	uparty_inn_code TEXT,
	upartytype_code TEXT,
	uparty_code TEXT,
	uparty_short_name TEXT,
	uparty_ogrn_code TEXT,
	uparty_kpp_code TEXT,
	isbranch_flag TEXT,
	orgrnokvedadrnotnull_flag TEXT,
	orgrnokvedoradrnotnull_flag TEXT,
	lastappl_date DATE,
	eq_lastupdate_date DATE,
	crm_lastupdate_date DATE,
	orgrnnotnull_flag TEXT,
	okved_code TEXT,
	full_address_text TEXT,
	from_date DATE,
	to_date DATE,
	report_date DATE,
	deleted_flag BOOLEAN,
	source_code TEXT,
	functionrun_insert_id BIGINT,
	functionrun_update_id BIGINT,
	sys_insert_stamp TIMESTAMP,
	sys_update_stamp TIMESTAMP
);

-- srd.corpgen_iblimit_sct definition
CREATE TABLE IF NOT EXISTS srd.corpgen_iblimit_sct (
	limit_rootcat_name TEXT,
	limit_parentcat_name TEXT,
	limit_code TEXT,
	limit_name TEXT,
	limit_product_name TEXT,
	limit_cat_code TEXT,
	limit_cat_name TEXT,
	party_name TEXT,
	limit_type_code TEXT,
	limit_start_date DATE,
	limit_end_date DATE,
	currency_code TEXT,
	limit_nm_amt NUMERIC(19,4),
	limit_utilednm_amt NUMERIC(19,4),
	limit_restnm_amt NUMERIC(19,4),
	limit_srcstatus_name TEXT,
	limit_comment_text TEXT,
	from_date DATE,
	to_date DATE,
	report_date DATE,
	deleted_flag BOOLEAN,
	source_code TEXT,
	functionrun_insert_id BIGINT,
	functionrun_update_id BIGINT,
	sys_insert_stamp TIMESTAMP,
	sys_update_stamp TIMESTAMP,
	limit_status_code TEXT,
	limit_srclifestatus_name TEXT
);

-- srd.corpgen_party2group_ict definition
CREATE TABLE IF NOT EXISTS srd.corpgen_party2group_ict (
	partytype_code TEXT,
	party_code TEXT,
	party_src_code TEXT,
	grouptype_code TEXT,
	group_code TEXT,
	group_src_code TEXT,
	from_date DATE,
	to_date DATE,
	relationsource_code TEXT,
	infosystem_code TEXT,
	deleted_flag BOOLEAN,
	source_code TEXT,
	functionrun_insert_id BIGINT,
	functionrun_update_id BIGINT,
	sys_insert_stamp TIMESTAMP,
	sys_update_stamp TIMESTAMP
);

-- sbox_rsk_drt.t_util definition
-- Источник: «на стороне ДХ это будет вьюшка, в Лимитный модуль каждый день будет
-- приходить новый срез с новым report_date — дату актуальности остатков».
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.t_util (
	report_date DATE,
	partytype_code TEXT,
	party_code TEXT,
	party_short_name TEXT,
	inn_code TEXT,
	partytype_goldcard_code TEXT,
	party_goldcard_code TEXT,
	goldcard_short_name TEXT,
	goldcard_inn_code TEXT,
	dealtype_code TEXT,
	deal_code TEXT,
	dealtype_parent_code TEXT,
	deal_parent_code TEXT,
	deal_src_code TEXT,
	dealno_code TEXT,
	currency_iso_code TEXT,
	accountno_main_code TEXT,
	main_nm_amt NUMERIC(38,8),
	main_eq_amt NUMERIC(38,8),
	accountno_mainover_code TEXT,
	mainover_nm_amt NUMERIC(38,8),
	mainover_eq_amt NUMERIC(38,8),
	accountno_undebtlim_code TEXT,
	undebtlim_nm_amt NUMERIC(38,8),
	undebtlim_eq_amt NUMERIC(38,8)
);
