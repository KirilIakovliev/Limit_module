-- ============================================================
-- Миграция: быстрый поиск подсказок напрямую в Postgres.
-- Накатывается на существующую базу без пересоздания:
--   docker compose exec -T db psql -U abb -d abb < db/03_search_index.sql
-- ============================================================

-- Нормализованное имя: без организационной формы, нижним регистром.
-- Пользователь печатает «магн», а в базе «ООО Магнит» — без этого
-- префиксный поиск не найдёт ничего.
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS search_name TEXT
    GENERATED ALWAYS AS (
        lower(regexp_replace(name, '^(ООО|АО|ПАО|ЗАО|ГК|ИП|ОАО)\s+', ''))
    ) STORED;

-- btree с text_pattern_ops обслуживает LIKE 'префикс%' и, что важнее,
-- отдаёт строки уже отсортированными — LIMIT 8 останавливает скан
-- после восьмой строки вместо сортировки всех совпадений.
CREATE INDEX IF NOT EXISTS companies_search_prefix
    ON companies (search_name text_pattern_ops);

-- GIN на триграммах — для запасного пути: опечатки и совпадение в середине.
CREATE INDEX IF NOT EXISTS companies_search_trgm
    ON companies USING gin (search_name gin_trgm_ops);

ANALYZE companies;
