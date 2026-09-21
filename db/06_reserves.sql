-- ============================================================
-- Раздел «Информация о резервах»: позиции по стандартам учёта.
--
-- Два блока — РСБУ и МСФО. Внутри каждого: название продукта,
-- валюта лимита, сумма лимита, срок лимита, сумма резерва.
-- Позиции выводятся из установленных лимитов клиента, поэтому
-- сумма лимита в резервах всегда совпадает с разделом «Лимиты».
--
-- Файл идемпотентен и применяется при старте API.
--   docker compose exec -T db psql -U abb -d abb < db/06_reserves.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS reserve_positions (
    id             BIGSERIAL PRIMARY KEY,
    company_id     BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    standard       TEXT   NOT NULL CHECK (standard IN ('rsbu', 'ifrs')),
    product        TEXT   NOT NULL,                 -- название продукта
    currency       TEXT   NOT NULL DEFAULT 'RUB',   -- валюта лимита
    limit_amount   NUMERIC(20,2) NOT NULL,          -- сумма лимита
    term_months    INT,                             -- срок лимита
    reserve_amount NUMERIC(20,2) NOT NULL,          -- сумма резерва
    calc_date      DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS reserve_positions_company
    ON reserve_positions (company_id, standard);

-- ------------------------------------------------------------
-- Наполнение: три крупнейших лимита клиента в каждом стандарте.
-- Ставка резервирования по МСФО выше — оценка ожидаемых потерь
-- строже, чем нормативный расчёт по РСБУ.
-- ------------------------------------------------------------
WITH ranked AS (
    SELECT l.*,
           row_number() OVER (PARTITION BY l.company_id ORDER BY l.limit_amount DESC) AS rn
    FROM limits l
)
INSERT INTO reserve_positions (company_id, standard, product, currency,
                               limit_amount, term_months, reserve_amount)
SELECT r.company_id, s.standard, r.product, r.currency,
       r.limit_amount,
       (ARRAY[6, 12, 18, 24, 36])[1 + (r.id % 5)],
       round(r.limit_amount * (s.base + (r.id % 8) / 100.0)::numeric, 2)
FROM ranked r
CROSS JOIN (VALUES ('rsbu', 0.03), ('ifrs', 0.05)) AS s(standard, base)
WHERE r.rn <= 3
  AND NOT EXISTS (
      SELECT 1 FROM reserve_positions p
      WHERE p.company_id = r.company_id
        AND p.standard = s.standard
        AND p.product = r.product
  );

ANALYZE reserve_positions;
