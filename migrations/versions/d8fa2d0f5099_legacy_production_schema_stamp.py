"""legacy production schema stamp

Revision ID: d8fa2d0f5099
Revises: c2b7f6a81d4e
Create Date: 2026-07-03 13:55:00.000000

"""
from typing import Sequence, Union


revision: str = "d8fa2d0f5099"
down_revision: Union[str, Sequence[str], None] = "c2b7f6a81d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
