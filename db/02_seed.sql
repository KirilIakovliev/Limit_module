-- ============================================================
-- Демо-данные. setseed делает генерацию воспроизводимой.
-- ============================================================
SELECT setseed(0.42);

INSERT INTO companies (name, inn, kpp, industry) VALUES
('Магнит',                '2309085638', '230901001', 'Розничная торговля'),
('Магнитогорский МК',      '7414003633', '745501001', 'Металлургия'),
('Мосэнерго',              '7705035012', '770501001', 'Электроэнергетика'),
('Московская биржа',       '7702077840', '770201001', 'Финансы'),
('Норильский никель',      '8401005730', '840101001', 'Металлургия'),
('Новатэк',                '6316031581', '631601001', 'Нефть и газ'),
('Роснефть',               '7706107510', '770601001', 'Нефть и газ'),
('Ростелеком',             '7707049388', '784001001', 'Телекоммуникации'),
('Северсталь',             '3528000597', '352801001', 'Металлургия'),
('Сегежа Групп',           '7714487093', '771401001', 'Лесная промышленность'),
('Сибур Холдинг',          '7727547261', '772701001', 'Химия и нефтехимия'),
('Татнефть',               '1644003838', '164401001', 'Нефть и газ'),
('Транснефть',             '7706061801', '770601002', 'Транспорт'),
('Фосагро',                '7736216869', '773601001', 'Химия и нефтехимия'),
('Аэрофлот',               '7712040126', '771201001', 'Авиаперевозки'),
('Алроса',                 '1433000147', '143301001', 'Добыча полезных ископаемых'),
('Полюс',                  '2434000335', '243401001', 'Добыча полезных ископаемых'),
('Позитив Текнолоджиз',    '7718668887', '771801001', 'ИТ и разработка ПО'),
('Яндекс',                 '7736207543', '773601002', 'ИТ и разработка ПО'),
('ММК-Метиз',              '7414002238', '741401001', 'Металлургия');

-- ------------------------------------------------------------
-- Финансовые показатели: сначала считаем связный набор величин,
-- затем разворачиваем его в строки таблицы через LATERAL VALUES.
-- ------------------------------------------------------------
WITH scale AS (
    SELECT id AS company_id, ((0.2 + random() * 3.0) * 8000000)::numeric AS s
    FROM companies
),
raw AS (
    SELECT sc.company_id,
           y.year,
           round((sc.s * (0.82 + 0.09 * (y.year - 2021)) * (0.92 + random() * 0.22))::numeric, 2) AS revenue,
           (0.60 + random() * 0.15)::numeric AS cost_share,
           (0.05 + random() * 0.05)::numeric AS sell_share,
           (0.80 + random() * 0.90)::numeric AS asset_mult,
           (0.34 + random() * 0.20)::numeric AS eq_share,
           (0.10 + random() * 0.12)::numeric AS lt_share,
           (0.04 + random() * 0.05)::numeric AS cash_share,
           (0.08 + random() * 0.09)::numeric AS inv_share,
           (0.12 + random() * 0.11)::numeric AS recv_share,
           (0.86 + random() * 0.12)::numeric AS pretax_k
    FROM scale sc CROSS JOIN generate_series(2021, 2024) AS y(year)
),
fin AS (
    SELECT company_id, year, revenue,
           round(revenue * cost_share, 2)                       AS cost,
           round(revenue * sell_share, 2)                       AS selling,
           round(revenue * asset_mult, 2)                       AS assets,
           round(revenue * asset_mult * eq_share, 2)            AS equity,
           round(revenue * asset_mult * lt_share, 2)            AS lt_liab,
           round(revenue * asset_mult * cash_share, 2)          AS cash,
           round(revenue * asset_mult * inv_share, 2)           AS inventory,
           round(revenue * asset_mult * recv_share, 2)          AS receivables,
           pretax_k
    FROM raw
),
calc AS (
    SELECT f.*,
           revenue - cost                                          AS gross,
           revenue - cost - selling                                AS op_profit,
           round((revenue - cost - selling) * pretax_k, 2)         AS pretax,
           round((revenue - cost - selling) * pretax_k * 0.8, 2)   AS net,
           cash + inventory + receivables                          AS current_assets,
           assets - (cash + inventory + receivables)               AS noncurrent_assets,
           assets - equity - lt_liab                               AS st_liab
    FROM fin f
)
INSERT INTO financial_indicators (company_id, group_code, ord, label, kind, year, value)
SELECT c.company_id, v.group_code, v.ord, v.label, v.kind, c.year, v.value
FROM calc c
CROSS JOIN LATERAL (VALUES
    ('balance', 1, 'Активы, всего',                    'money', c.assets),
    ('balance', 2, 'Внеоборотные активы',              'money', c.noncurrent_assets),
    ('balance', 3, 'Оборотные активы',                 'money', c.current_assets),
    ('balance', 4, 'Запасы',                           'money', c.inventory),
    ('balance', 5, 'Дебиторская задолженность',        'money', c.receivables),
    ('balance', 6, 'Денежные средства и эквиваленты',  'money', c.cash),
    ('balance', 7, 'Капитал и резервы',                'money', c.equity),
    ('balance', 8, 'Долгосрочные обязательства',       'money', c.lt_liab),
    ('balance', 9, 'Краткосрочные обязательства',      'money', c.st_liab),

    ('results', 1, 'Выручка',                          'money', c.revenue),
    ('results', 2, 'Себестоимость продаж',             'money', c.cost),
    ('results', 3, 'Валовая прибыль',                  'money', c.gross),
    ('results', 4, 'Коммерческие и управленческие расходы', 'money', c.selling),
    ('results', 5, 'Прибыль от продаж',                'money', c.op_profit),
    ('results', 6, 'Прибыль до налогообложения',       'money', c.pretax),
    ('results', 7, 'Чистая прибыль',                   'money', c.net),

    ('ratios',  1, 'Рентабельность продаж',            'pct',   round(c.net / NULLIF(c.revenue,0) * 100, 2)),
    ('ratios',  2, 'Рентабельность активов',           'pct',   round(c.net / NULLIF(c.assets,0) * 100, 2)),
    ('ratios',  3, 'Рентабельность капитала',          'pct',   round(c.net / NULLIF(c.equity,0) * 100, 2)),
    ('ratios',  4, 'Текущая ликвидность',              'ratio', round(c.current_assets / NULLIF(c.st_liab,0), 2)),
    ('ratios',  5, 'Коэффициент автономии',            'ratio', round(c.equity / NULLIF(c.assets,0), 2)),
    ('ratios',  6, 'Долг / Чистая прибыль',            'ratio', round((c.lt_liab + c.st_liab) / NULLIF(c.net,0), 2))
) AS v(group_code, ord, label, kind, value);

-- ------------------------------------------------------------
-- Лимиты: суммы в диапазоне 1 млн — 1 млрд ₽
-- ------------------------------------------------------------
-- random() внутри LATERAL-подзапроса вычислился бы один раз на компанию,
-- поэтому суммы генерируем в CTE — там значение своё для каждой строки
WITH raw_limits AS (
    SELECT c.id AS company_id,
           p.product,
           round((1000000 + random() * 999000000)::numeric, 2) AS limit_amount
    FROM companies c
    CROSS JOIN LATERAL (VALUES
        ('Возобновляемая кредитная линия'),
        ('Овердрафт'),
        ('Банковские гарантии'),
        ('Аккредитивы'),
        ('Торговое финансирование')
    ) AS p(product)
)
INSERT INTO limits (company_id, product, limit_amount, used_amount, valid_until)
SELECT company_id,
       product,
       limit_amount,
       round(limit_amount * (0.15 + random() * 0.7)::numeric, 2),
       CURRENT_DATE + ((90 + random() * 640)::int)
FROM raw_limits;

INSERT INTO sublimits (limit_id, company_id, name, amount, used_amount, tenor_months)
SELECT l.id, l.company_id, s.name,
       round(l.limit_amount * s.share::numeric, 2),
       round(l.limit_amount * s.share::numeric * (0.1 + random() * 0.75)::numeric, 2),
       (ARRAY[3,6,12,18,24,36])[1 + floor(random() * 6)::int]
FROM limits l
CROSS JOIN LATERAL (VALUES
    ('Транш до 6 месяцев', 0.25),
    ('Транш до 12 месяцев', 0.35),
    ('Транш свыше 12 месяцев', 0.20)
) AS s(name, share);

INSERT INTO reserves (company_id, category, quality_group, amount, rate_pct)
SELECT c.id, r.category,
       (ARRAY['I','II','III'])[1 + floor(random()*3)::int],
       round((1000000 + random() * 400000000)::numeric, 2),
       round((0.5 + random() * 20)::numeric, 2)
FROM companies c
CROSS JOIN LATERAL (VALUES
    ('Резерв на возможные потери по ссудам'),
    ('Резерв по условным обязательствам кредитного характера'),
    ('Резерв под обесценение прочих активов')
) AS r(category);

INSERT INTO company_sync_log (finished_at, inserted, status, message)
SELECT now(), count(*), 'ok', 'initial seed' FROM companies;
