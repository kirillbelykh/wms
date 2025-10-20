"""append autoincrement in prod and cons model

Revision ID: b40f6275bfab
Revises: 47f0c632b5d1
Create Date: 2025-10-20 17:20:44.367579
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b40f6275bfab'
down_revision: Union[str, Sequence[str], None] = '47f0c632b5d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema: add autoincrement to productions.id and consumables.id"""
    # --- Productions ---
    op.execute("CREATE SEQUENCE IF NOT EXISTS productions_id_seq")
    op.execute("ALTER TABLE productions ALTER COLUMN id SET DEFAULT nextval('productions_id_seq')")
    op.execute("SELECT setval('productions_id_seq', COALESCE((SELECT MAX(id)+1 FROM productions), 1), false)")

    # --- Consumables ---
    op.execute("CREATE SEQUENCE IF NOT EXISTS consumables_id_seq")
    op.execute("ALTER TABLE consumables ALTER COLUMN id SET DEFAULT nextval('consumables_id_seq')")
    op.execute("SELECT setval('consumables_id_seq', COALESCE((SELECT MAX(id)+1 FROM consumables), 1), false)")


def downgrade() -> None:
    """Downgrade schema: remove autoincrement from productions.id and consumables.id"""
    op.execute("ALTER TABLE productions ALTER COLUMN id DROP DEFAULT")
    op.execute("DROP SEQUENCE IF EXISTS productions_id_seq")

    op.execute("ALTER TABLE consumables ALTER COLUMN id DROP DEFAULT")
    op.execute("DROP SEQUENCE IF EXISTS consumables_id_seq")