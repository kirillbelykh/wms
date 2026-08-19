"""add_manual_chz_and_production_consumables

Revision ID: 4a6b0d7f2d21
Revises: 18a1c0ab1f48
Create Date: 2026-06-26 18:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4a6b0d7f2d21"
down_revision: Union[str, Sequence[str], None] = "18a1c0ab1f48"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "production_supply_request_items",
        sa.Column("consumed_quantity", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "production_chz_request_items",
        sa.Column("item_color", sa.String(length=50), nullable=True),
    )

    op.create_table(
        "manual_chz_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="requested"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column("external_request_id", sa.String(length=255), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("ready_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "manual_chz_request_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("pairs_quantity", sa.Integer(), nullable=False),
        sa.Column("item_title", sa.String(length=255), nullable=False),
        sa.Column("item_size", sa.String(length=50), nullable=True),
        sa.Column("item_color", sa.String(length=50), nullable=True),
        sa.Column("item_venchik", sa.String(length=50), nullable=True),
        sa.Column("batch_number", sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["request_id"], ["manual_chz_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.alter_column("production_supply_request_items", "consumed_quantity", server_default=None)


def downgrade() -> None:
    op.drop_table("manual_chz_request_items")
    op.drop_table("manual_chz_requests")
    op.drop_column("production_chz_request_items", "item_color")
    op.drop_column("production_supply_request_items", "consumed_quantity")
