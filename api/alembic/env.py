"""Alembic: только схема app. URL — DATABASE_URL или POSTGRES_*."""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool, text

from app.db import build_database_url

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

url = build_database_url()
if url.startswith("postgresql://"):
    url = "postgresql+psycopg://" + url[len("postgresql://") :]


def run_migrations_offline() -> None:
    context.configure(url=url, literal_binds=True, version_table_schema="app")
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        connection.commit()
        context.configure(
            connection=connection,
            version_table_schema="app",
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
