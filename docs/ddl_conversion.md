# Соответствие DDL DataHub (Impala/Hive) ↔ PostgreSQL `limitmodule`

Источник истины по структуре: `context/data/ddl/*` (DDL команды данных).
Копии в PostgreSQL создаются **1:1**: те же схемы (`sbox_rsk_drt`, `srd`), те же имена таблиц и колонок,
тот же порядок колонок. Ограничения (PK / FK / UNIQUE / NOT NULL / DEFAULT / CHECK) **не добавляются** —
их нет в источнике. Все колонки nullable.

Файлы PostgreSQL DDL (локальный снимок): `db/local/10_sbox_rsk_drt_marts.sql`,
`db/local/11_sbox_rsk_drt_refs.sql`, `db/local/12_srd_replicas.sql`.
`app.load_log` создаёт Alembic (`api/alembic/versions/001_app_load_log.py`), не SQL в initdb.

## 1. Состав таблиц (13 таблиц, 216 колонок)

| # | Таблица PostgreSQL | Исходный файл | Колонок | Роль | Читает backend |
|---|---|---|---|---|---|
| 1 | `sbox_rsk_drt.t_lm_1_2_clients` | итоговые таблицы…/t_lm_1_2_clients.txt | 8 | Итоговая витрина: клиенты (поиск, карточка) | да |
| 2 | `sbox_rsk_drt.t_lm_1_2_gk_info` | итоговые таблицы…/t_lm_1_2_gk_info.txt | 10 | Итоговая витрина: группы компаний и единые лимиты | да |
| 3 | `sbox_rsk_drt.t_lm_1_3_limits` | итоговые таблицы…/t_lm_1_3_limits.txt | 19 | Итоговая витрина: лимиты КБ+ИБ и заявки | да |
| 4 | `sbox_rsk_drt.t_lm_egar_limits` | итоговые таблицы…/t_lm_egar_limits.txt | 19 | Итоговая витрина: лимиты ИБ (EGAR), комментарии | да (только `comment_egar`) |
| 5 | `sbox_rsk_drt.stg_file_client_limit` | ручные справочники…/stg_file_client_limit.txt | 11 | Ручной справочник: лимиты клиентов | нет |
| 6 | `sbox_rsk_drt.stg_file_egar_clients` | ручные справочники…/stg_file_egar_clients.txt | 5 | Ручной справочник: клиенты EGAR | нет |
| 7 | `sbox_rsk_drt.stg_file_group_limit` | ручные справочники…/stg_file_group_limit.txt | 8 | Ручной справочник: лимиты ГК | нет |
| 8 | `sbox_rsk_drt.stg_file_raroc` | ручные справочники…/stg_file_raroc.txt | 3 | Ручной справочник: RAROC | нет |
| 9 | `srd.corpgen_appl_sct` | реплики таблиц из ДХ/corpgen_appl_sct.txt | 40 | Реплика: заявки | нет |
| 10 | `srd.corpgen_clientgoldcards_sct` | реплики таблиц из ДХ/corpgen_clientgoldcards_sct.txt | 24 | Реплика: золотые карточки клиентов | нет |
| 11 | `srd.corpgen_iblimit_sct` | реплики таблиц из ДХ/corpgen_iblimit_sct.txt | 28 | Реплика: лимиты ИБ | нет |
| 12 | `srd.corpgen_party2group_ict` | реплики таблиц из ДХ/corpgen_party2group_ict.txt | 16 | Реплика: связь клиент ↔ группа | нет |
| 13 | `sbox_rsk_drt.t_util` | реплики таблиц из ДХ/t_util.txt | 25 | Реплика (в ДХ — view): ежедневный срез остатков по сделкам | нет |

Итого: 8+10+19+19+11+5+8+3+40+24+28+16+25 = **216** колонок.

## 2. Правила преобразования типов Impala/Hive → PostgreSQL

| Исходный тип | Кол-во колонок | PostgreSQL | Причина |
|---|---|---|---|
| `STRING(32767)` | 134 | `TEXT` | В PostgreSQL нет типа STRING. `32767` — техническое ограничение Impala на длину, семантики бизнес-длины не несёт; `VARCHAR(32767)` в PG ввёл бы искусственный лимит, `TEXT` хранит строку без ограничения и без потерь. |
| `VARCHAR(32767)` | 5 (только `stg_file_egar_clients`) | `TEXT` | Та же причина; единообразие со STRING. |
| `DECIMAL(p,s)` | 28 | `NUMERIC(p,s)` с теми же `p,s` | Точные десятичные, `NUMERIC` в PG — тот же тип; precision/scale переносятся дословно: 15,2 / 38,7 / 38,6 / 38,10 / 21,4 / 22,4 / 19,4 / 38,8. |
| `INT` | 2 (`t_lm_egar_limits.id`, `category_id`) | `INTEGER` | 32-bit signed в обоих движках. |
| `BIGINT` | 8 | `BIGINT` | 64-bit signed в обоих движках. |
| `BOOLEAN` | 4 | `BOOLEAN` | Совпадает. |
| `DATE` | 27 | `DATE` | Совпадает. |
| `TIMESTAMP` | 8 | `TIMESTAMP` (without time zone) | Impala TIMESTAMP не хранит зону; `TIMESTAMPTZ` добавил бы преобразование, которого нет в источнике. |

Идентификаторы: обратные кавычки Impala → двойные кавычки PostgreSQL. Регистр, пробелы, дефис и символы сохраняются:

- `` `source` ``, `` `type` `` → `"source"`, `"type"` (ключевые слова, в кавычках).
- `` `cовокупный лимит на гк` `` → `"cовокупный лимит на гк"` — **первая буква латинская `c` (U+0063)**, как в источнике. Не исправляется.
- `` `доступный совокупный лимит на гк` ``, `` `единый лимит по клиенту` ``, `` `утилиз-й единый лимит по клиенту` ``, `` `доступный единый лимит по клиенту` `` — дословно.
- `` `утилизированный совокупный лимит на гк` `` — **единственное вынужденное отклонение**: имя занимает 72 байта в UTF-8, предел идентификатора PostgreSQL — 63 байта (`NAMEDATALEN`), PostgreSQL молча обрезает его до `"утилизированный совокупный лимит "` (с хвостовым пробелом). В копии колонка объявлена как `"утилиз-й совокупный лимит на гк"` (57 байт) — сокращение по образцу, который команда данных сама применила в `утилиз-й единый лимит по клиенту`. См. GAP G11.
- `group_crm_id1` — дословно (с `1`).

## 3. Построчное соответствие

Формат: `колонка` — исходный тип → PG-тип. Логические ключи — по ЛМД (`context/business/ЛМД.pdf`), физически не создаются.

### 3.1 `sbox_rsk_drt.t_lm_1_2_clients` (логический ключ ЛМД: `uparty_inn_code`)

| Колонка | Impala | PostgreSQL | Смысл (ЛМД / пример_моки) |
|---|---|---|---|
| uparty_inn_code | STRING(32767) | TEXT | ИНН клиента (с ведущими нулями — строка) |
| uparty_code | STRING(32767) | TEXT | Код ЗК |
| uparty_short_name | STRING(32767) | TEXT | Краткое наименование |
| uparty_ogrn_code | STRING(32767) | TEXT | ОГРН |
| uparty_kpp_code | STRING(32767) | TEXT | КПП |
| okved_code | STRING(32767) | TEXT | Код ОКВЭД |
| ods_full_address | STRING(32767) | TEXT | Адрес |
| "source" | STRING(32767) | TEXT | Источник строки (`datahub` / `egar`) |

### 3.2 `sbox_rsk_drt.t_lm_1_2_gk_info` (логический ключ ЛМД: `group_crm_id` + `party_inn` + `currency`; в DDL колонка называется `group_crm_id1`)

| Колонка | Impala | PostgreSQL |
|---|---|---|
| group_name | STRING(32767) | TEXT |
| group_crm_id1 | STRING(32767) | TEXT |
| currency | STRING(32767) | TEXT |
| party_inn | STRING(32767) | TEXT |
| "cовокупный лимит на гк" | DECIMAL(15,2) | NUMERIC(15,2) |
| **"утилиз-й совокупный лимит на гк"** (источник: `утилизированный совокупный лимит на гк`) | DECIMAL(38,7) | NUMERIC(38,7) — см. GAP G11 |
| "доступный совокупный лимит на гк" | DECIMAL(38,6) | NUMERIC(38,6) |
| "единый лимит по клиенту" | DECIMAL(38,6) | NUMERIC(38,6) |
| "утилиз-й единый лимит по клиенту" | DECIMAL(38,6) | NUMERIC(38,6) |
| "доступный единый лимит по клиенту" | DECIMAL(38,6) | NUMERIC(38,6) |

Три колонки «… на гк» — значение уровня группы, повторяется в каждой строке участника (агрегировать `MAX`, не `SUM`).

### 3.3 `sbox_rsk_drt.t_lm_1_3_limits` (логический ключ ЛМД: `inn` + `limit_id`)

| Колонка | Impala | PostgreSQL |
|---|---|---|
| inn | STRING(32767) | TEXT |
| client_name | STRING(32767) | TEXT |
| gk_crm_id | STRING(32767) | TEXT |
| gk_name | STRING(32767) | TEXT |
| owner | STRING(32767) | TEXT |
| limit_id | STRING(32767) | TEXT |
| currency | STRING(32767) | TEXT |
| product | STRING(32767) | TEXT |
| start_date | DATE | DATE |
| end_date | DATE | DATE |
| src_status | STRING(32767) | TEXT |
| limit_status | STRING(32767) | TEXT |
| rate | DECIMAL(38,10) | NUMERIC(38,10) |
| lim_value | DECIMAL(38,6) | NUMERIC(38,6) |
| lim_utiled | DECIMAL(38,6) | NUMERIC(38,6) |
| rest_lim | DECIMAL(38,6) | NUMERIC(38,6) |
| client_limits | STRING(32767) | TEXT |
| lim_top | STRING(32767) | TEXT |
| client_raroc | DECIMAL(15,2) | NUMERIC(15,2) |

### 3.4 `sbox_rsk_drt.t_lm_egar_limits` (логический ключ ЛМД: `id`)

| Колонка | Impala | PostgreSQL |
|---|---|---|
| category_root | STRING(32767) | TEXT |
| category_parent | STRING(32767) | TEXT |
| id | INT | INTEGER |
| name | STRING(32767) | TEXT |
| product_type | STRING(32767) | TEXT |
| category_id | INT | INTEGER |
| limit_category | STRING(32767) | TEXT |
| client_name | STRING(32767) | TEXT |
| inn | STRING(32767) | TEXT |
| "type" | STRING(32767) | TEXT |
| start_date | DATE | DATE |
| end_date | DATE | DATE |
| value_currency_code | STRING(32767) | TEXT |
| value | DECIMAL(21,4) | NUMERIC(21,4) |
| current_value | DECIMAL(21,4) | NUMERIC(21,4) |
| rest_lim | DECIMAL(22,4) | NUMERIC(22,4) |
| source_status | STRING(32767) | TEXT |
| life_status_mapped | STRING(32767) | TEXT |
| comment_egar | STRING(32767) | TEXT |

### 3.5 `sbox_rsk_drt.stg_file_client_limit`

| Колонка | Impala | PostgreSQL |
|---|---|---|
| client_inn | STRING(32767) | TEXT |
| client_name | STRING(32767) | TEXT |
| group_name | STRING(32767) | TEXT |
| limit_product | STRING(32767) | TEXT |
| currency | STRING(32767) | TEXT |
| client_limit | DECIMAL(15,2) | NUMERIC(15,2) |
| limit_description | STRING(32767) | TEXT |
| managing_dep | STRING(32767) | TEXT |
| decision_date | DATE | DATE |
| group_crm_id | STRING(32767) | TEXT |
| actuality_comment | STRING(32767) | TEXT |

### 3.6 `sbox_rsk_drt.stg_file_egar_clients`

| Колонка | Impala | PostgreSQL |
|---|---|---|
| client_name | VARCHAR(32767) | TEXT |
| inn | VARCHAR(32767) | TEXT |
| gk_crm_id | VARCHAR(32767) | TEXT |
| foreign_id | VARCHAR(32767) | TEXT |
| comments | VARCHAR(32767) | TEXT |

### 3.7 `sbox_rsk_drt.stg_file_group_limit`

| Колонка | Impala | PostgreSQL |
|---|---|---|
| group_name | STRING(32767) | TEXT |
| group_limit | DECIMAL(15,2) | NUMERIC(15,2) |
| currency | STRING(32767) | TEXT |
| group_crm_id | STRING(32767) | TEXT |
| ancestor_inn | STRING(32767) | TEXT |
| comment_dkkr | STRING(32767) | TEXT |
| managing_dep | STRING(32767) | TEXT |
| decision_date | DATE | DATE |

### 3.8 `sbox_rsk_drt.stg_file_raroc`

| Колонка | Impala | PostgreSQL |
|---|---|---|
| report_dt | DATE | DATE |
| inn | STRING(32767) | TEXT |
| client_raroc | DECIMAL(15,2) | NUMERIC(15,2) |

### 3.9 `srd.corpgen_appl_sct` (40)

STRING → TEXT: appltype_code, appl_code, appl_src_code, appl_name, applno_code, applform_name, srcapplkind_code, srcapplkind_name, srcproducttype_code, srcproduct_code, srcproduct_name, partytype_code, party_code, upartytype_code, uparty_code, uparty_inn_code, currency_code, srcapplstatus_code, srcapplstatus_name, dealtype_code, deal_code, dealno_code, appl_dealratetype_code, deal_ratetype_code, appl_subject_text, source_code, limit_status_code.
DATE → DATE: report_date, application_date, appl_dealstart_date, appl_dealend_date, from_date, to_date.
DECIMAL(19,4) → NUMERIC(19,4): request_nm_amt, appl_dealrate_pct.
BOOLEAN: deleted_flag. BIGINT: functionrun_insert_id, functionrun_update_id. TIMESTAMP: sys_insert_stamp, sys_update_stamp.

### 3.10 `srd.corpgen_clientgoldcards_sct` (24)

STRING → TEXT: uparty_inn_code, upartytype_code, uparty_code, uparty_short_name, uparty_ogrn_code, uparty_kpp_code, isbranch_flag, orgrnokvedadrnotnull_flag, orgrnokvedoradrnotnull_flag, orgrnnotnull_flag, okved_code, full_address_text, source_code.
DATE: lastappl_date, eq_lastupdate_date, crm_lastupdate_date, from_date, to_date, report_date.
BOOLEAN: deleted_flag. BIGINT: functionrun_insert_id, functionrun_update_id. TIMESTAMP: sys_insert_stamp, sys_update_stamp.

### 3.11 `srd.corpgen_iblimit_sct` (28)

STRING → TEXT: limit_rootcat_name, limit_parentcat_name, limit_code, limit_name, limit_product_name, limit_cat_code, limit_cat_name, party_name, limit_type_code, currency_code, limit_srcstatus_name, limit_comment_text, source_code, limit_status_code, limit_srclifestatus_name.
DATE: limit_start_date, limit_end_date, from_date, to_date, report_date.
DECIMAL(19,4) → NUMERIC(19,4): limit_nm_amt, limit_utilednm_amt, limit_restnm_amt.
BOOLEAN: deleted_flag. BIGINT: functionrun_insert_id, functionrun_update_id. TIMESTAMP: sys_insert_stamp, sys_update_stamp.

### 3.12 `srd.corpgen_party2group_ict` (16)

STRING → TEXT: partytype_code, party_code, party_src_code, grouptype_code, group_code, group_src_code, relationsource_code, infosystem_code, source_code.
DATE: from_date, to_date. BOOLEAN: deleted_flag. BIGINT: functionrun_insert_id, functionrun_update_id. TIMESTAMP: sys_insert_stamp, sys_update_stamp.

### 3.13 `sbox_rsk_drt.t_util` (25)

DATE: report_date.
STRING → TEXT: partytype_code, party_code, party_short_name, inn_code, partytype_goldcard_code, party_goldcard_code, goldcard_short_name, goldcard_inn_code, dealtype_code, deal_code, dealtype_parent_code, deal_parent_code, deal_src_code, dealno_code, currency_iso_code, accountno_main_code, accountno_mainover_code, accountno_undebtlim_code.
DECIMAL(38,8) → NUMERIC(38,8): main_nm_amt, main_eq_amt, mainover_nm_amt, mainover_eq_amt, undebtlim_nm_amt, undebtlim_eq_amt.

Примечание источника: «на стороне ДХ это будет вьюшка, в Лимитный модуль каждый день будет приходить новый срез с новым report_date».

## 4. Техническая таблица приложения (не копия DataHub)

`app.load_log` — единственная таблица, принадлежащая приложению. Причина: БТ 2.2 / 2.5.3 требуют показывать
дату и время последнего обновления данных и предупреждать при отсутствии обновления > 24 ч; ни одна из 13 таблиц
не содержит временной метки загрузки копии. Для неё ограничения допустимы (PK, NOT NULL, DEFAULT), т.к. она не копия.
На TEST строку вставляет скрипт тест-данных; на PROD её должен писать механизм передачи (открытый вопрос команде данных).

## 5. GAP-лист: ЛМД ↔ DDL ↔ PostgreSQL

| # | Расхождение | Решение в PostgreSQL |
|---|---|---|
| G1 | ЛМД: `t_lm_1_2_gk_info.group_crm_id`; DDL: `group_crm_id1` | Колонка называется `group_crm_id1` (как в DDL). Вопрос команде данных. |
| G2 | ЛМД помечает PK: `uparty_inn_code`, `id`, `inn+limit_id`, `group_crm_id+party_inn+currency`; DDL ограничений не содержит | PK не создаются; ключи считаются логическими; дедупликация — в SQL backend'а (`DISTINCT ON` / `LIMIT 1`). |
| G3 | `cовокупный лимит на гк` — латинская `c` | Сохраняется дословно; SQL backend'а использует то же написание. |
| G4 | В `t_lm_1_2_gk_info` нет наименования участника | Имя участника берётся JOIN'ом из `t_lm_1_2_clients` (fallback `t_lm_1_3_limits.client_name`). |
| G5 | Ни в одной витрине нет метки актуальности | `app.load_log` (раздел 4). |
| G6 | `client_limits`, `lim_top` — STRING, хотя по смыслу суммы/проценты | Остаются TEXT; UI показывает как текст. |
| G7 | `t_lm_egar_limits.id` — INT, `t_lm_1_3_limits.limit_id` — STRING | Связь только через приведение `id::text = limit_id`; не физическая. |
| G8 | Единицы `cовокупный лимит на гк` (в примере `500` при утилизации `494 468`) | Не преобразуются; вопрос команде данных. |
| G9 | `stg_file_egar_clients` — VARCHAR вместо STRING | Оба → TEXT. |
| G10 | Бизнес-поля, которых нет в DDL: № договора, дата решения, комментарий КБ, срок заявки, PD, RWA, резервы РСБУ/МСФО, транши на дату, расшифровка ОКВЭД, «крышка» ГК | MISSING IN CURRENT DATAHUB DDL; в PostgreSQL не добавляются. |
| **G11** | `t_lm_1_2_gk_info.утилизированный совокупный лимит на гк` — 72 байта в UTF-8, предел идентификатора PostgreSQL 63 байта (`NAMEDATALEN`). При исполнении 1:1 PostgreSQL молча обрезает имя до `"утилизированный совокупный лимит "` (с хвостовым пробелом, NOTICE проверено на PG 16). | Единственное намеренное отклонение от DDL источника: колонка создаётся как `"утилиз-й совокупный лимит на гк"` (57 байт) — сокращение по образцу самой команды данных (`утилиз-й единый лимит по клиенту`). Механизм передачи копии должен маппить это имя. Вопрос команде данных: переименовать колонку в источнике или согласовать имя на стороне ЛМ. Остальные 5 «русских» имён укладываются в лимит (40–62 байта). |

## 6. Верификация

- `psql -v ON_ERROR_STOP=1 -f db/local/1x_*.sql` на чистой БД — без ошибок.
- `api/tests/test_schema.py` сравнивает `information_schema.columns` (имя, тип, precision/scale, порядок) с ожидаемым списком из этого документа и проверяет отсутствие PK/FK/NOT NULL на таблицах `sbox_rsk_drt.*` / `srd.*`.
