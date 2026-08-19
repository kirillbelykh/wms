"""normalize legacy production task type

Revision ID: 8f3c1b6e4d21
Revises: 7d0c0a9b1f42
Create Date: 2026-07-03 10:16:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "8f3c1b6e4d21"
down_revision: Union[str, Sequence[str], None] = "7d0c0a9b1f42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE production_orders
        SET task_type = 'packaging'
        WHERE task_type IS NULL
           OR task_type = ''
           OR task_type = 'default'
        """
    )


def downgrade() -> None:
    pass
