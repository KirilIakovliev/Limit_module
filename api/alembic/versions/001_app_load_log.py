"""Схема app и таблица load_log.

Revision ID: 001_app_load_log
Revises:
"""
from typing import Sequence, Union

from alembic import op

revision: str = "001_app_load_log"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.load_log (
	id          BIGSERIAL PRIMARY KEY,
	table_name  TEXT NOT NULL,
	loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
	data_date   DATE,
	row_count   BIGINT,
	note        TEXT
);
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app.load_log;")
