"""remove unique constraints from consumables, productions, supplies

Revision ID: 313fd32203a1
Revises: 14a2bfdef034
Create Date: 2025-10-20 19:21:02.980599

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '313fd32203a1'
down_revision: Union[str, Sequence[str], None] = '14a2bfdef034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove UNIQUE constraints."""
    # Consumables: name
    op.drop_constraint('uq_consumables_name', 'consumables', type_='unique')

    # Productions: name
    op.drop_constraint('uq_productions_name', 'productions', type_='unique')

    # Supplies: name
    op.drop_constraint('uq_supplies_name', 'supplies', type_='unique')


def downgrade() -> None:
    """Re-add UNIQUE constraints."""
    # Consumables: name
    op.create_unique_constraint('uq_consumables_name', 'consumables', ['name'])

    # Productions: name
    op.create_unique_constraint('uq_productions_name', 'productions', ['name'])

    # Supplies: name
    op.create_unique_constraint('uq_supplies_name', 'supplies', ['name'])