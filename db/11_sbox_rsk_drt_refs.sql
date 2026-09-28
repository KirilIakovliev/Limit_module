-- ============================================================================
-- Копии ручных справочников DataHub (sbox_rsk_drt.stg_file_*).
-- Структура 1:1 с DDL команды данных:
--   context/data/ddl/ручные справочники к созданию в ЛМ/*.txt
-- Backend их не читает: значения уже включены в итоговые витрины t_lm_*.
-- Ограничений (PK/FK/NOT NULL/DEFAULT) в источнике нет — здесь тоже не добавляются.
-- ============================================================================

-- sbox_rsk_drt.stg_file_client_limit definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.stg_file_client_limit (
	client_inn TEXT,
	client_name TEXT,
	group_name TEXT,
	limit_product TEXT,
	currency TEXT,
	client_limit NUMERIC(15,2),
	limit_description TEXT,
	managing_dep TEXT,
	decision_date DATE,
	group_crm_id TEXT,
	actuality_comment TEXT
);

-- sbox_rsk_drt.stg_file_egar_clients definition (в источнике VARCHAR(32767) -> TEXT)
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.stg_file_egar_clients (
	client_name TEXT,
	inn TEXT,
	gk_crm_id TEXT,
	foreign_id TEXT,
	comments TEXT
);

-- sbox_rsk_drt.stg_file_group_limit definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.stg_file_group_limit (
	group_name TEXT,
	group_limit NUMERIC(15,2),
	currency TEXT,
	group_crm_id TEXT,
	ancestor_inn TEXT,
	comment_dkkr TEXT,
	managing_dep TEXT,
	decision_date DATE
);

-- sbox_rsk_drt.stg_file_raroc definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.stg_file_raroc (
	report_dt DATE,
	inn TEXT,
	client_raroc NUMERIC(15,2)
);
