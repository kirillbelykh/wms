"""merge heads

Revision ID: 14a2bfdef034
Revises: 086c3636290b, b40f6275bfab
Create Date: 2025-10-20 19:11:45.725470

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14a2bfdef034'
down_revision: Union[str, Sequence[str], None] = ('086c3636290b', 'b40f6275bfab')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
