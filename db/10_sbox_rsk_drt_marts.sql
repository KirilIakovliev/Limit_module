-- ============================================================================
-- Копии итоговых витрин DataHub (sbox_rsk_drt), которые читает интерфейс.
-- Структура 1:1 с DDL команды данных:
--   context/data/ddl/итоговые таблицы в ДХ на которые будет смотреть интерфейс/*.txt
-- Преобразование типов Impala -> PostgreSQL: docs/ddl_conversion.md, раздел 2.
-- Ограничений (PK/FK/NOT NULL/DEFAULT) в источнике нет — здесь тоже не добавляются.
-- ============================================================================

-- sbox_rsk_drt.t_lm_1_2_clients definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.t_lm_1_2_clients (
	uparty_inn_code TEXT,
	uparty_code TEXT,
	uparty_short_name TEXT,
	uparty_ogrn_code TEXT,
	uparty_kpp_code TEXT,
	okved_code TEXT,
	ods_full_address TEXT,
	"source" TEXT
);

-- sbox_rsk_drt.t_lm_1_2_gk_info definition
-- ВНИМАНИЕ 1: в имени "cовокупный лимит на гк" первая буква — латинская c (U+0063), как в источнике.
-- ВНИМАНИЕ 2 (GAP G11, docs/ddl_conversion.md): исходное имя
--   `утилизированный совокупный лимит на гк` = 72 байта UTF-8, а предел идентификатора
--   PostgreSQL — 63 байта (NAMEDATALEN); PG молча обрезал бы его до
--   "утилизированный совокупный лимит " (с хвостовым пробелом). Поэтому здесь ЕДИНСТВЕННОЕ
--   намеренное отклонение от DDL источника: сокращение по образцу самой команды данных
--   (как в соседней колонке `утилиз-й единый лимит по клиенту`).
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.t_lm_1_2_gk_info (
	group_name TEXT,
	group_crm_id1 TEXT,
	currency TEXT,
	party_inn TEXT,
	"cовокупный лимит на гк" NUMERIC(15,2),
	"утилиз-й совокупный лимит на гк" NUMERIC(38,7),   -- источник: `утилизированный совокупный лимит на гк`
	"доступный совокупный лимит на гк" NUMERIC(38,6),
	"единый лимит по клиенту" NUMERIC(38,6),
	"утилиз-й единый лимит по клиенту" NUMERIC(38,6),
	"доступный единый лимит по клиенту" NUMERIC(38,6)
);

-- sbox_rsk_drt.t_lm_1_3_limits definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.t_lm_1_3_limits (
	inn TEXT,
	client_name TEXT,
	gk_crm_id TEXT,
	gk_name TEXT,
	owner TEXT,
	limit_id TEXT,
	currency TEXT,
	product TEXT,
	start_date DATE,
	end_date DATE,
	src_status TEXT,
	limit_status TEXT,
	rate NUMERIC(38,10),
	lim_value NUMERIC(38,6),
	lim_utiled NUMERIC(38,6),
	rest_lim NUMERIC(38,6),
	client_limits TEXT,
	lim_top TEXT,
	client_raroc NUMERIC(15,2)
);

-- sbox_rsk_drt.t_lm_egar_limits definition
CREATE TABLE IF NOT EXISTS sbox_rsk_drt.t_lm_egar_limits (
	category_root TEXT,
	category_parent TEXT,
	id INTEGER,
	name TEXT,
	product_type TEXT,
	category_id INTEGER,
	limit_category TEXT,
	client_name TEXT,
	inn TEXT,
	"type" TEXT,
	start_date DATE,
	end_date DATE,
	value_currency_code TEXT,
	value NUMERIC(21,4),
	current_value NUMERIC(21,4),
	rest_lim NUMERIC(22,4),
	source_status TEXT,
	life_status_mapped TEXT,
	comment_egar TEXT
);
