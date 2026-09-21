-- ============================================================
-- Группы компаний, единый лимит и атрибуты карточки клиента.
--
-- Те же операции продублированы в ensure_schema() в app/main.py,
-- поэтому на работающей базе они применятся при старте API.
-- Файл нужен, чтобы схему можно было накатить и вручную:
--   docker compose exec -T db psql -U abb -d abb < db/04_groups.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS company_groups (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    unified_limit       NUMERIC(20,2) NOT NULL DEFAULT 0,  -- сумма единого лимита
    available_limit     NUMERIC(20,2) NOT NULL DEFAULT 0,  -- единый доступный лимит
    utilized_limit      NUMERIC(20,2) NOT NULL DEFAULT 0,  -- единый утилизированный лимит
    total_limit         NUMERIC(20,2) NOT NULL DEFAULT 0,  -- совокупный лимит
    utilization_cap_pct NUMERIC(6,2)  NOT NULL DEFAULT 85  -- «крышка» по утилизации
);

-- атрибутный состав карточки клиента
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ogrn       VARCHAR(15);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS okved      TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS okved_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS group_id   BIGINT REFERENCES company_groups(id);
CREATE INDEX IF NOT EXISTS companies_group ON companies (group_id);

-- единый сублимит компании внутри группы
CREATE TABLE IF NOT EXISTS group_sublimits (
    company_id       BIGINT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    group_id         BIGINT NOT NULL REFERENCES company_groups(id) ON DELETE CASCADE,
    sublimit_amount  NUMERIC(20,2) NOT NULL,   -- сумма единого сублимита
    available_amount NUMERIC(20,2) NOT NULL,   -- единый доступный сублимит
    utilized_amount  NUMERIC(20,2) NOT NULL    -- единый утилизированный сублимит
);

-- ------------------------------------------------------------
-- Наполнение. Идемпотентно: повторный запуск ничего не дублирует.
-- Часть компаний намеренно оставлена без группы — интерфейс должен
-- показывать «Отсутствует».
-- ------------------------------------------------------------
INSERT INTO company_groups (name) VALUES
    ('ГК «Северная сталь»'),
    ('ГК «Энергоресурс»'),
    ('ГК «Технополис»'),
    ('ГК «Полярный ресурс»')
ON CONFLICT (name) DO NOTHING;

UPDATE companies c SET group_id = g.id
FROM company_groups g
WHERE g.name = 'ГК «Северная сталь»'
  AND c.inn IN ('3528000597', '7414003633', '7414002238')
  AND c.group_id IS DISTINCT FROM g.id;

UPDATE companies c SET group_id = g.id
FROM company_groups g
WHERE g.name = 'ГК «Энергоресурс»'
  AND c.inn IN ('7705035012', '7706107510', '1644003838', '7706061801')
  AND c.group_id IS DISTINCT FROM g.id;

UPDATE companies c SET group_id = g.id
FROM company_groups g
WHERE g.name = 'ГК «Технополис»'
  AND c.inn IN ('7736207543', '7718668887', '7707049388')
  AND c.group_id IS DISTINCT FROM g.id;

UPDATE companies c SET group_id = g.id
FROM company_groups g
WHERE g.name = 'ГК «Полярный ресурс»'
  AND c.inn IN ('1433000147', '2434000335', '7736216869', '8401005730')
  AND c.group_id IS DISTINCT FROM g.id;

-- атрибуты: выводятся из id, поэтому повторный запуск даёт те же значения
UPDATE companies SET
    ogrn = COALESCE(ogrn, '1' || lpad(((id * 7919 + 1000000) % 1000000000000)::text, 12, '0')),
    address = COALESCE(address, (ARRAY[
        '101000, г. Москва, ул. Мясницкая, д. 12, стр. 1',
        '190000, г. Санкт-Петербург, наб. реки Мойки, д. 58',
        '620014, г. Екатеринбург, ул. Малышева, д. 51',
        '630007, г. Новосибирск, ул. Советская, д. 5',
        '350000, г. Краснодар, ул. Красная, д. 176',
        '455000, г. Магнитогорск, ул. Кирова, д. 93',
        '162600, г. Череповец, ул. Мира, д. 30',
        '423450, г. Альметьевск, ул. Ленина, д. 75'
    ])[1 + (id % 8)]),
    okved = COALESCE(okved, CASE
        WHEN industry = 'Металлургия'                 THEN '24.10'
        WHEN industry = 'Нефть и газ'                 THEN '06.10'
        WHEN industry = 'Розничная торговля'          THEN '47.11'
        WHEN industry = 'ИТ и разработка ПО'          THEN '62.01'
        WHEN industry = 'Электроэнергетика'           THEN '35.11'
        WHEN industry = 'Транспорт'                   THEN '49.50'
        WHEN industry = 'Финансы'                     THEN '64.19'
        WHEN industry = 'Химия и нефтехимия'          THEN '20.15'
        WHEN industry = 'Авиаперевозки'               THEN '51.10'
        WHEN industry = 'Лесная промышленность'       THEN '16.10'
        ELSE '46.90' END),
    okved_name = COALESCE(okved_name, industry)
WHERE ogrn IS NULL OR address IS NULL OR okved IS NULL OR okved_name IS NULL;

-- единые сублимиты участников группы
INSERT INTO group_sublimits (company_id, group_id, sublimit_amount, available_amount, utilized_amount)
SELECT c.id, c.group_id,
       amount,
       round(amount - used, 2),
       round(used, 2)
FROM companies c
CROSS JOIN LATERAL (
    SELECT round((150000000 + (c.id * 37117 % 850000000))::numeric, 2) AS amount
) a
CROSS JOIN LATERAL (
    SELECT round(a.amount * (0.2 + (c.id * 13 % 60) / 100.0)::numeric, 2) AS used
) u
WHERE c.group_id IS NOT NULL
ON CONFLICT (company_id) DO NOTHING;

-- сводные значения группы считаются из сублимитов участников
UPDATE company_groups g SET
    unified_limit   = totals.amount,
    utilized_limit  = totals.used,
    available_limit = totals.amount - totals.used,
    total_limit     = round(totals.amount * 1.15, 2),
    utilization_cap_pct = 85
FROM (
    SELECT group_id,
           sum(sublimit_amount) AS amount,
           sum(utilized_amount) AS used
    FROM group_sublimits GROUP BY group_id
) totals
WHERE totals.group_id = g.id;
