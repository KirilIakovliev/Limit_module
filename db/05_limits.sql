-- ============================================================
-- Раздел «Лимиты»: установленные лимиты по блокам и заявки.
--
-- Термины — по глоссарию Банка:
--   Единый сублимит — совокупность лимитов корпоративного и
--   инвестиционного блоков, установленных на конкретного клиента,
--   поэтому он не хранится, а считается суммой лимитов клиента.
--
-- Файл идемпотентен и выполняется при старте API вместе с остальными.
--   docker compose exec -T db psql -U abb -d abb < db/05_limits.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Установленные лимиты: блок, статус, совокупный лимит, «крышка»
-- ------------------------------------------------------------
ALTER TABLE limits ADD COLUMN IF NOT EXISTS block TEXT NOT NULL DEFAULT 'corporate';
ALTER TABLE limits ADD COLUMN IF NOT EXISTS total_limit NUMERIC(20,2);
ALTER TABLE limits ADD COLUMN IF NOT EXISTS utilization_cap_pct NUMERIC(6,2) NOT NULL DEFAULT 85;

ALTER TABLE limits DROP CONSTRAINT IF EXISTS limits_block_check;
ALTER TABLE limits ADD CONSTRAINT limits_block_check
    CHECK (block IN ('corporate', 'investment'));

UPDATE limits SET total_limit = round(limit_amount * 1.15, 2) WHERE total_limit IS NULL;

-- продукты инвестиционного блока для каждой компании
INSERT INTO limits (company_id, product, block, limit_amount, used_amount,
                    currency, valid_until, status, total_limit, utilization_cap_pct)
SELECT c.id, p.product, 'investment',
       round(amount, 2),
       round(amount * (0.15 + (c.id * 17 % 55) / 100.0)::numeric, 2),
       'RUB',
       CURRENT_DATE + ((180 + c.id * 11 % 700)::int),
       'active',
       round(amount * 1.15, 2),
       85
FROM companies c
CROSS JOIN LATERAL (VALUES
    ('Синдицированный кредит'),
    ('Проектное финансирование')
) AS p(product)
CROSS JOIN LATERAL (
    SELECT (200000000 + (c.id * 53) % 900000000)::numeric AS amount
) AS a
WHERE NOT EXISTS (
    SELECT 1 FROM limits l
    WHERE l.company_id = c.id AND l.product = p.product
);

-- ------------------------------------------------------------
-- 2. Заявки на рассмотрении
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS limit_applications (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product      TEXT NOT NULL,                     -- тип лимита
    status       TEXT NOT NULL DEFAULT 'На рассмотрении',
    currency     TEXT NOT NULL DEFAULT 'RUB',
    term_months  INT,                               -- срок лимита
    amount       NUMERIC(20,2),
    comment      TEXT,
    created_at   DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS limit_applications_company ON limit_applications (company_id);

-- ------------------------------------------------------------
-- 3. Новые компании — чтобы заявки были и по уже заведённым
--    клиентам, и по недавно появившимся
-- ------------------------------------------------------------
INSERT INTO companies (name, inn, kpp, industry) VALUES
('Балтийский терминал',  '7801567234', '780101001', 'Транспорт'),
('Агроальянс Юг',        '2311456789', '231101001', 'Сельское хозяйство'),
('Стройпуть',            '5407123456', '540701001', 'Строительство'),
('Дальресурс',           '2540987654', '254001001', 'Добыча полезных ископаемых'),
-- длинные наименования: на них проверяется, что карточки верхней строки
-- подстраиваются под текст и не рвут его на части
('Российские железные дороги',                              '7708503727', '770801001', 'Транспорт'),
('Объединённая судостроительная корпорация',                '7838395215', '783801001', 'Судостроение'),
('Новолипецкий металлургический комбинат',                  '4823006703', '482301001', 'Металлургия'),
('Межрегиональная распределительная сетевая компания Центра','6901067107', '690101001', 'Электроэнергетика')
ON CONFLICT (inn) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Данные для компаний, у которых их ещё нет (новые из п.3).
--    Формулы те же, что в 02_seed.sql, но детерминированы по id.
-- ------------------------------------------------------------
WITH fresh AS (
    SELECT c.id, ((c.id * 7919) % 100) / 100.0 AS k
    FROM companies c
    WHERE NOT EXISTS (SELECT 1 FROM financial_indicators f WHERE f.company_id = c.id)
),
raw AS (
    SELECT f.id AS company_id, y.year, f.k,
           round((8000000 * (0.4 + f.k * 2.4) * (0.82 + 0.09 * (y.year - 2021)))::numeric, 2) AS revenue
    FROM fresh f CROSS JOIN generate_series(2021, 2024) AS y(year)
),
calc AS (
    SELECT company_id, year, revenue,
           round(revenue * (0.60 + k * 0.15)::numeric, 2)                     AS cost,
           round(revenue * (0.05 + k * 0.05)::numeric, 2)                     AS selling,
           round(revenue * (0.80 + k * 0.90)::numeric, 2)                     AS assets,
           round(revenue * (0.80 + k * 0.90)::numeric * (0.34 + k * 0.20)::numeric, 2) AS equity,
           round(revenue * (0.80 + k * 0.90)::numeric * (0.10 + k * 0.12)::numeric, 2) AS lt_liab,
           round(revenue * (0.80 + k * 0.90)::numeric * (0.04 + k * 0.05)::numeric, 2) AS cash,
           round(revenue * (0.80 + k * 0.90)::numeric * (0.08 + k * 0.09)::numeric, 2) AS inventory,
           round(revenue * (0.80 + k * 0.90)::numeric * (0.12 + k * 0.11)::numeric, 2) AS receivables
    FROM raw
),
final AS (
    SELECT *,
           revenue - cost                                   AS gross,
           revenue - cost - selling                         AS op_profit,
           round((revenue - cost - selling) * 0.92, 2)      AS pretax,
           round((revenue - cost - selling) * 0.92 * 0.8, 2) AS net,
           cash + inventory + receivables                   AS current_assets,
           assets - (cash + inventory + receivables)        AS noncurrent_assets,
           assets - equity - lt_liab                        AS st_liab
    FROM calc
)
INSERT INTO financial_indicators (company_id, group_code, ord, label, kind, year, value)
SELECT f.company_id, v.group_code, v.ord, v.label, v.kind, f.year, v.value
FROM final f
CROSS JOIN LATERAL (VALUES
    ('balance', 1, 'Активы, всего',                    'money', f.assets),
    ('balance', 2, 'Внеоборотные активы',              'money', f.noncurrent_assets),
    ('balance', 3, 'Оборотные активы',                 'money', f.current_assets),
    ('balance', 4, 'Запасы',                           'money', f.inventory),
    ('balance', 5, 'Дебиторская задолженность',        'money', f.receivables),
    ('balance', 6, 'Денежные средства и эквиваленты',  'money', f.cash),
    ('balance', 7, 'Капитал и резервы',                'money', f.equity),
    ('balance', 8, 'Долгосрочные обязательства',       'money', f.lt_liab),
    ('balance', 9, 'Краткосрочные обязательства',      'money', f.st_liab),
    ('results', 1, 'Выручка',                          'money', f.revenue),
    ('results', 2, 'Себестоимость продаж',             'money', f.cost),
    ('results', 3, 'Валовая прибыль',                  'money', f.gross),
    ('results', 4, 'Коммерческие и управленческие расходы', 'money', f.selling),
    ('results', 5, 'Прибыль от продаж',                'money', f.op_profit),
    ('results', 6, 'Прибыль до налогообложения',       'money', f.pretax),
    ('results', 7, 'Чистая прибыль',                   'money', f.net),
    ('ratios',  1, 'Рентабельность продаж',            'pct',   round(f.net / NULLIF(f.revenue,0) * 100, 2)),
    ('ratios',  2, 'Рентабельность активов',           'pct',   round(f.net / NULLIF(f.assets,0) * 100, 2)),
    ('ratios',  3, 'Рентабельность капитала',          'pct',   round(f.net / NULLIF(f.equity,0) * 100, 2)),
    ('ratios',  4, 'Текущая ликвидность',              'ratio', round(f.current_assets / NULLIF(f.st_liab,0), 2)),
    ('ratios',  5, 'Коэффициент автономии',            'ratio', round(f.equity / NULLIF(f.assets,0), 2)),
    ('ratios',  6, 'Долг / Чистая прибыль',            'ratio', round((f.lt_liab + f.st_liab) / NULLIF(f.net,0), 2))
) AS v(group_code, ord, label, kind, value);

-- лимиты корпоративного блока для новых компаний
INSERT INTO limits (company_id, product, block, limit_amount, used_amount,
                    currency, valid_until, status, total_limit, utilization_cap_pct)
SELECT c.id, p.product, 'corporate',
       round(amount, 2),
       round(amount * (0.2 + (c.id * 29 % 60) / 100.0)::numeric, 2),
       'RUB', CURRENT_DATE + ((120 + c.id * 7 % 600)::int), 'active',
       round(amount * 1.15, 2), 85
FROM companies c
CROSS JOIN LATERAL (VALUES
    ('Возобновляемая кредитная линия'),
    ('Овердрафт'),
    ('Банковские гарантии')
) AS p(product)
CROSS JOIN LATERAL (SELECT (100000000 + (c.id * 41) % 700000000)::numeric AS amount) AS a
WHERE NOT EXISTS (SELECT 1 FROM limits l WHERE l.company_id = c.id AND l.block = 'corporate');

-- резервы для новых компаний
INSERT INTO reserves (company_id, category, quality_group, amount, rate_pct)
SELECT c.id, r.category,
       (ARRAY['I','II','III'])[1 + (c.id % 3)],
       round((1000000 + (c.id * 137) % 400000000)::numeric, 2),
       round((0.5 + (c.id * 7 % 190) / 10.0)::numeric, 2)
FROM companies c
CROSS JOIN LATERAL (VALUES
    ('Резерв на возможные потери по ссудам'),
    ('Резерв по условным обязательствам кредитного характера'),
    ('Резерв под обесценение прочих активов')
) AS r(category)
WHERE NOT EXISTS (SELECT 1 FROM reserves x WHERE x.company_id = c.id);

-- транши по лимитам новых компаний
INSERT INTO sublimits (limit_id, company_id, name, amount, used_amount, tenor_months)
SELECT l.id, l.company_id, s.name,
       round(l.limit_amount * s.share::numeric, 2),
       round(l.limit_amount * s.share::numeric * (0.1 + (l.id * 13 % 70) / 100.0)::numeric, 2),
       (ARRAY[3,6,12,18,24,36])[1 + (l.id % 6)]
FROM limits l
CROSS JOIN LATERAL (VALUES
    ('Транш до 6 месяцев', 0.25),
    ('Транш до 12 месяцев', 0.35),
    ('Транш свыше 12 месяцев', 0.20)
) AS s(name, share)
WHERE NOT EXISTS (SELECT 1 FROM sublimits x WHERE x.limit_id = l.id);

-- ------------------------------------------------------------
-- 5. Заявки: и по давним клиентам, и по недавно заведённым
-- ------------------------------------------------------------
INSERT INTO limit_applications (company_id, product, status, currency, term_months, amount, comment, created_at)
SELECT c.id, a.product, 'На рассмотрении', 'RUB', a.term,
       round((50000000 + (c.id * 97) % 450000000)::numeric, 2),
       a.comment,
       CURRENT_DATE - ((c.id * 3 % 45)::int)
FROM companies c
CROSS JOIN LATERAL (VALUES
    ('Возобновляемая кредитная линия', 24, 'Ожидается решение кредитного комитета'),
    ('Банковские гарантии',            12, 'Запрошены уточнения по обеспечению'),
    ('Проектное финансирование',       60, 'На рассмотрении инвестиционного блока')
) AS a(product, term, comment)
WHERE (c.id % 3 = 2 OR c.inn IN ('7801567234', '2311456789', '5407123456', '2540987654'))
  AND NOT EXISTS (
      SELECT 1 FROM limit_applications la
      WHERE la.company_id = c.id AND la.product = a.product
  );

-- атрибутный состав для компаний, заведённых в этом файле:
-- 04_groups.sql выполняется раньше и их ещё не видит
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
        WHEN industry = 'Металлургия'           THEN '24.10'
        WHEN industry = 'Транспорт'             THEN '49.50'
        WHEN industry = 'Электроэнергетика'     THEN '35.11'
        WHEN industry = 'Судостроение'          THEN '30.11'
        WHEN industry = 'Сельское хозяйство'    THEN '01.11'
        WHEN industry = 'Строительство'         THEN '41.20'
        ELSE '46.90' END),
    okved_name = COALESCE(okved_name, industry)
WHERE ogrn IS NULL OR address IS NULL OR okved IS NULL OR okved_name IS NULL;

ANALYZE limits;
ANALYZE limit_applications;
