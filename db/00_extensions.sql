-- Расширения PostgreSQL, нужные приложению.
-- pg_trgm: оператор нечёткого сравнения строк (<%, similarity) для поиска клиентов
-- по наименованию. Индексы НЕ создаются (см. docs/database_migration.md, этап 13).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Схемы копий DataHub (имена 1:1 с источником) и схема технических таблиц приложения.
CREATE SCHEMA IF NOT EXISTS sbox_rsk_drt;
CREATE SCHEMA IF NOT EXISTS srd;
CREATE SCHEMA IF NOT EXISTS app;
