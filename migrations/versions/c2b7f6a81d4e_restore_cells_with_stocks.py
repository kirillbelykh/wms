"""restore_cells_with_stocks

Revision ID: c2b7f6a81d4e
Revises: 9c8a7b6d5e4f
Create Date: 2026-07-01 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c2b7f6a81d4e"
down_revision: Union[str, Sequence[str], None] = "9c8a7b6d5e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE cells
        SET is_deleted = false
        WHERE is_deleted = true
          AND id IN (
              SELECT DISTINCT cell_id
              FROM stocks
              WHERE pairs_quantity > 0
          )
        """
    )


def downgrade() -> None:
    pass
