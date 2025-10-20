"""remove item and append 3 other models

Revision ID: ca02f2133299
Revises: 2d1de118bed9
Create Date: 2025-10-20 14:36:35.124367
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca02f2133299'
down_revision: Union[str, Sequence[str], None] = '2d1de118bed9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Удаляем старую таблицу suppliers с зависимостями
    op.execute("DROP TABLE IF EXISTS suppliers CASCADE")

    # Создаем новую базовую таблицу items
    op.create_table(
        'items',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), sa.ForeignKey('materials.id'), nullable=True),
        sa.Column('size_id', sa.Integer(), sa.ForeignKey('sizes.id'), nullable=True),
        sa.Column('unit_id', sa.Integer(), sa.ForeignKey('units.id'), nullable=True),
        sa.Column('manufacturer_id', sa.Integer(), sa.ForeignKey('manufacturers.id'), nullable=True),
    )
    op.create_index(op.f('ix_items_id'), 'items', ['id'], unique=False)

    # Таблицы-наследники
    op.create_table(
        'consumables',
        sa.Column('id', sa.Integer(), sa.ForeignKey('items.id'), primary_key=True)
    )

    op.create_table(
        'productions',
        sa.Column('id', sa.Integer(), sa.ForeignKey('items.id'), primary_key=True)
    )

    op.create_table(
        'supplies',
        sa.Column('id', sa.Integer(), sa.ForeignKey('items.id'), primary_key=True)
    )

    # Обновляем внешние ключи в связанных таблицах
    # BAR CODES
    op.add_column('barcodes', sa.Column('item_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'barcodes', 'items', ['item_id'], ['id'])
    op.drop_column('barcodes', 'supply_id')

    # BATCHES
    op.add_column('batches', sa.Column('item_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'batches', 'items', ['item_id'], ['id'])
    op.drop_column('batches', 'supply_id')

    # CELLS
    op.add_column('cells', sa.Column('item_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'cells', 'items', ['item_id'], ['id'])
    op.drop_column('cells', 'supply_id')

    # RECEIVINGS
    op.add_column('receivings', sa.Column('item_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'receivings', 'items', ['item_id'], ['id'])
    op.drop_column('receivings', 'supply_id')


def downgrade() -> None:
    """Downgrade schema."""
    # Возвращаем обратно структуру suppliers
    op.add_column('receivings', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.create_foreign_key(op.f('receivings_supply_id_fkey'), 'receivings', 'suppliers', ['supply_id'], ['id'])
    op.drop_column('receivings', 'item_id')

    op.add_column('cells', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.create_foreign_key(op.f('cells_supply_id_fkey'), 'cells', 'suppliers', ['supply_id'], ['id'])
    op.drop_column('cells', 'item_id')

    op.add_column('batches', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.create_foreign_key(op.f('batches_supply_id_fkey'), 'batches', 'suppliers', ['supply_id'], ['id'])
    op.drop_column('batches', 'item_id')

    op.add_column('barcodes', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.create_foreign_key(op.f('barcodes_supply_id_fkey'), 'barcodes', 'suppliers', ['supply_id'], ['id'])
    op.drop_column('barcodes', 'item_id')

    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('manufacturer_id', sa.Integer(), sa.ForeignKey('manufacturers.id')),
        sa.Column('material_id', sa.Integer(), sa.ForeignKey('materials.id')),
        sa.Column('unit_id', sa.Integer(), sa.ForeignKey('units.id')),
        sa.Column('size_id', sa.Integer(), sa.ForeignKey('sizes.id')),
    )
    op.create_index(op.f('ix_suppliers_name'), 'suppliers', ['name'], unique=False)
    op.create_index(op.f('ix_suppliers_id'), 'suppliers', ['id'], unique=False)

    op.drop_table('supplies')
    op.drop_table('productions')
    op.drop_table('consumables')
    op.drop_index(op.f('ix_items_id'), table_name='items')
    op.drop_table('items')