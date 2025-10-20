"""
last update (20 oct 16:51 safe version)

Revision ID: ebc5c6fd2b85
Revises: 603f33cd5c70
Create Date: 2025-10-20 16:51:43.252207
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy import text  # Добавлен импорт для text()

# revision identifiers, used by Alembic.
revision = 'ebc5c6fd2b85'
down_revision = '603f33cd5c70'
branch_labels = None
depends_on = None


def column_exists(conn, table_name, column_name):
    inspector = Inspector.from_engine(conn)
    cols = [c["name"] for c in inspector.get_columns(table_name)]
    return column_name in cols


def fk_exists(conn, table_name, fk_name):
    inspector = Inspector.from_engine(conn)
    fks = [fk['name'] for fk in inspector.get_foreign_keys(table_name)]
    return fk_name in fks


def upgrade():
    conn = op.get_bind()

    # --- Cells ---
    with op.batch_alter_table("cells") as batch_op:
        if not column_exists(conn, "cells", "supply_id"):
            batch_op.add_column(sa.Column("supply_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "cells", "production_id"):
            batch_op.add_column(sa.Column("production_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "cells", "consumable_id"):
            batch_op.add_column(sa.Column("consumable_id", sa.Integer(), nullable=True))
        if column_exists(conn, "cells", "item_id"):
            batch_op.drop_column("item_id")

        # FK
        if not fk_exists(conn, "cells", "fk_cells_supply_id"):
            batch_op.create_foreign_key("fk_cells_supply_id", "supplies", ["supply_id"], ["id"])
        if not fk_exists(conn, "cells", "fk_cells_production_id"):
            batch_op.create_foreign_key("fk_cells_production_id", "productions", ["production_id"], ["id"])
        if not fk_exists(conn, "cells", "fk_cells_consumable_id"):
            batch_op.create_foreign_key("fk_cells_consumable_id", "consumables", ["consumable_id"], ["id"])

    # --- Batches ---
    with op.batch_alter_table("batches") as batch_op:
        if not column_exists(conn, "batches", "production_id"):
            batch_op.add_column(sa.Column("production_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "batches", "consumable_id"):
            batch_op.add_column(sa.Column("consumable_id", sa.Integer(), nullable=True))
        if column_exists(conn, "batches", "item_id"):
            batch_op.drop_column("item_id")

        if not fk_exists(conn, "batches", "fk_batches_production_id"):
            batch_op.create_foreign_key("fk_batches_production_id", "productions", ["production_id"], ["id"])
        if not fk_exists(conn, "batches", "fk_batches_consumable_id"):
            batch_op.create_foreign_key("fk_batches_consumable_id", "consumables", ["consumable_id"], ["id"])

    # --- Barcodes ---
    with op.batch_alter_table("barcodes") as batch_op:
        if not column_exists(conn, "barcodes", "supply_id"):
            batch_op.add_column(sa.Column("supply_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "barcodes", "production_id"):
            batch_op.add_column(sa.Column("production_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "barcodes", "consumable_id"):
            batch_op.add_column(sa.Column("consumable_id", sa.Integer(), nullable=True))
        if column_exists(conn, "barcodes", "item_id"):
            batch_op.drop_column("item_id")

        if not fk_exists(conn, "barcodes", "fk_barcodes_supply_id"):
            batch_op.create_foreign_key("fk_barcodes_supply_id", "supplies", ["supply_id"], ["id"])
        if not fk_exists(conn, "barcodes", "fk_barcodes_production_id"):
            batch_op.create_foreign_key("fk_barcodes_production_id", "productions", ["production_id"], ["id"])
        if not fk_exists(conn, "barcodes", "fk_barcodes_consumable_id"):
            batch_op.create_foreign_key("fk_barcodes_consumable_id", "consumables", ["consumable_id"], ["id"])

    # --- Receivings ---
    with op.batch_alter_table("receivings") as batch_op:
        if not column_exists(conn, "receivings", "supply_id"):
            batch_op.add_column(sa.Column("supply_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "receivings", "production_id"):
            batch_op.add_column(sa.Column("production_id", sa.Integer(), nullable=True))
        if not column_exists(conn, "receivings", "consumable_id"):
            batch_op.add_column(sa.Column("consumable_id", sa.Integer(), nullable=True))
        if column_exists(conn, "receivings", "item_id"):
            batch_op.drop_column("item_id")

        if not fk_exists(conn, "receivings", "fk_receivings_supply_id"):
            batch_op.create_foreign_key("fk_receivings_supply_id", "supplies", ["supply_id"], ["id"])
        if not fk_exists(conn, "receivings", "fk_receivings_production_id"):
            batch_op.create_foreign_key("fk_receivings_production_id", "productions", ["production_id"], ["id"])
        if not fk_exists(conn, "receivings", "fk_receivings_consumable_id"):
            batch_op.create_foreign_key("fk_receivings_consumable_id", "consumables", ["consumable_id"], ["id"])

    # --- Drop old items table if exists ---
    # Исправленный запрос: обернут в text()
    if "items" in [t[0] for t in conn.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    ).fetchall()]:  # Изменено: t[0] вместо t["table_name"], так как запрос возвращает кортежи
        op.drop_table("items")


def downgrade():
    pass