"""add batch date to production order items

Revision ID: 0ec019b4f811
Revises: d8fa2d0f5099
Create Date: 2026-06-23 08:58:08.268959

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "0ec019b4f811"
down_revision: Union[str, Sequence[str], None] = "d8fa2d0f5099"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    columns = inspect(op.get_bind()).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def upgrade() -> None:
    if not _has_column("production_order_items", "batch_number"):
        op.add_column(
            "production_order_items",
            sa.Column("batch_number", sa.String(length=50), nullable=True),
        )
    if not _has_column("production_order_items", "production_date"):
        op.add_column(
            "production_order_items",
            sa.Column("production_date", sa.Date(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("production_order_items", "production_date"):
        op.drop_column("production_order_items", "production_date")
    if _has_column("production_order_items", "batch_number"):
        op.drop_column("production_order_items", "batch_number")
