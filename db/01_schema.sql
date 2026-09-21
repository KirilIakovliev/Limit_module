-- ============================================================
-- Лимитный модуль АББ — схема БД
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- Справочник компаний (обновляется джобом refresh_companies.py)
-- ------------------------------------------------------------
CREATE TABLE companies (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    inn         VARCHAR(12) NOT NULL UNIQUE,
    kpp         VARCHAR(9),
    industry    TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    source      TEXT        NOT NULL DEFAULT 'seed',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- поиск по названию: триграммы держат опечатки и середину слова
CREATE INDEX companies_name_trgm ON companies USING gin (name gin_trgm_ops);
-- поиск по ИНН: префиксный + триграммный
CREATE INDEX companies_inn_prefix ON companies (inn varchar_pattern_ops);
CREATE INDEX companies_inn_trgm   ON companies USING gin (inn gin_trgm_ops);
CREATE INDEX companies_active     ON companies (is_active);

-- журнал обновлений справочника
CREATE TABLE company_sync_log (
    id          BIGSERIAL PRIMARY KEY,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    inserted    INT DEFAULT 0,
    updated     INT DEFAULT 0,
    deactivated INT DEFAULT 0,
    status      TEXT DEFAULT 'running',
    message     TEXT
);

-- ------------------------------------------------------------
-- Уровень «Основная информация»: баланс / финрезультаты / коэффициенты
-- ------------------------------------------------------------
CREATE TABLE financial_indicators (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    group_code  TEXT   NOT NULL CHECK (group_code IN ('balance','results','ratios')),
    ord         INT    NOT NULL,
    label       TEXT   NOT NULL,
    kind        TEXT   NOT NULL CHECK (kind IN ('money','pct','ratio')),
    year        INT    NOT NULL,
    value       NUMERIC(20,2)
);
CREATE INDEX fin_company_group ON financial_indicators (company_id, group_code, ord, year);

-- ------------------------------------------------------------
-- Уровень «Лимиты»
-- ------------------------------------------------------------
CREATE TABLE limits (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product       TEXT   NOT NULL,
    limit_amount  NUMERIC(20,2) NOT NULL,
    used_amount   NUMERIC(20,2) NOT NULL,
    currency      TEXT   NOT NULL DEFAULT 'RUB',
    valid_until   DATE,
    status        TEXT   NOT NULL DEFAULT 'active'
);
CREATE INDEX limits_company ON limits (company_id);

-- ------------------------------------------------------------
-- Уровень «Сублимиты» — принадлежат конкретному лимиту
-- ------------------------------------------------------------
CREATE TABLE sublimits (
    id            BIGSERIAL PRIMARY KEY,
    limit_id      BIGINT NOT NULL REFERENCES limits(id) ON DELETE CASCADE,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          TEXT   NOT NULL,
    amount        NUMERIC(20,2) NOT NULL,
    used_amount   NUMERIC(20,2) NOT NULL,
    tenor_months  INT
);
CREATE INDEX sublimits_company ON sublimits (company_id);

-- ------------------------------------------------------------
-- Уровень «Информация о резервах»
-- ------------------------------------------------------------
CREATE TABLE reserves (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category      TEXT   NOT NULL,
    quality_group TEXT,
    amount        NUMERIC(20,2) NOT NULL,
    rate_pct      NUMERIC(6,2),
    calc_date     DATE   NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX reserves_company ON reserves (company_id);
