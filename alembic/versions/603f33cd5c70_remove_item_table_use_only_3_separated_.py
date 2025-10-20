"""
remove item table, use only 3 separated unit models

Revision ID: 603f33cd5c70
Revises: 4fe693522b39
Create Date: 2025-10-20 16:35:04.146938
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '603f33cd5c70'
down_revision: Union[str, Sequence[str], None] = '4fe693522b39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # === ШАГ 1: Удаляем все внешние ключи, ссылающиеся на items ===
    op.drop_constraint('consumables_id_fkey', 'consumables', type_='foreignkey')
    op.drop_constraint('productions_id_fkey', 'productions', type_='foreignkey')
    op.drop_constraint('supplies_id_fkey', 'supplies', type_='foreignkey')
    op.drop_constraint('barcodes_item_id_fkey', 'barcodes', type_='foreignkey')
    op.drop_constraint('cells_item_id_fkey', 'cells', type_='foreignkey')
    op.drop_constraint('receivings_item_id_fkey', 'receivings', type_='foreignkey')

    # === ШАГ 2: Теперь можно удалить таблицу items ===
    op.drop_index(op.f('ix_items_id'), table_name='items')
    op.drop_table('items')

    # === ШАГ 3: Добавляем новые колонки и FK в таблицы ===

    # --- barcodes ---
    op.add_column('barcodes', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.add_column('barcodes', sa.Column('production_id', sa.Integer(), nullable=True))
    op.add_column('barcodes', sa.Column('consumable_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_barcodes_supply_id', 'barcodes', 'supplies', ['supply_id'], ['id'])
    op.create_foreign_key('fk_barcodes_production_id', 'barcodes', 'productions', ['production_id'], ['id'])
    op.create_foreign_key('fk_barcodes_consumable_id', 'barcodes', 'consumables', ['consumable_id'], ['id'])
    op.drop_column('barcodes', 'item_id')

    # --- batches ---
    op.add_column('batches', sa.Column('production_id', sa.Integer(), nullable=True))
    op.add_column('batches', sa.Column('consumable_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_batches_production_id', 'batches', 'productions', ['production_id'], ['id'])
    op.create_foreign_key('fk_batches_consumable_id', 'batches', 'consumables', ['consumable_id'], ['id'])

    # --- cells ---
    op.add_column('cells', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.add_column('cells', sa.Column('production_id', sa.Integer(), nullable=True))
    op.add_column('cells', sa.Column('consumable_id', sa.Integer(), nullable=True))
    op.alter_column('cells', 'capacity',
                    existing_type=sa.DOUBLE_PRECISION(precision=53),
                    nullable=False)
    op.drop_index(op.f('ix_cells_name'), table_name='cells')
    op.create_unique_constraint('uq_cells_name', 'cells', ['name'])
    op.create_foreign_key('fk_cells_production_id', 'cells', 'productions', ['production_id'], ['id'])
    op.create_foreign_key('fk_cells_consumable_id', 'cells', 'consumables', ['consumable_id'], ['id'])
    op.create_foreign_key('fk_cells_supply_id', 'cells', 'supplies', ['supply_id'], ['id'])
    op.drop_column('cells', 'item_id')

    # --- consumables ---
    op.add_column('consumables', sa.Column('name', sa.String(), nullable=False))
    op.add_column('consumables', sa.Column('description', sa.String(), nullable=True))
    op.add_column('consumables', sa.Column('quantity', sa.Float(), nullable=True))
    op.add_column('consumables', sa.Column('size_id', sa.Integer(), nullable=True))
    op.add_column('consumables', sa.Column('manufacturer_id', sa.Integer(), nullable=True))
    op.add_column('consumables', sa.Column('material_id', sa.Integer(), nullable=True))
    op.add_column('consumables', sa.Column('unit_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_consumables_id'), 'consumables', ['id'], unique=False)
    op.create_unique_constraint('uq_consumables_name', 'consumables', ['name'])
    op.create_foreign_key('fk_consumables_manufacturer_id', 'consumables', 'manufacturers', ['manufacturer_id'], ['id'])
    op.create_foreign_key('fk_consumables_size_id', 'consumables', 'sizes', ['size_id'], ['id'])
    op.create_foreign_key('fk_consumables_unit_id', 'consumables', 'units', ['unit_id'], ['id'])
    op.create_foreign_key('fk_consumables_material_id', 'consumables', 'materials', ['material_id'], ['id'])

    # --- productions ---
    op.add_column('productions', sa.Column('name', sa.String(), nullable=False))
    op.add_column('productions', sa.Column('description', sa.String(), nullable=True))
    op.add_column('productions', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('productions', sa.Column('end_date', sa.Date(), nullable=True))
    op.add_column('productions', sa.Column('quantity', sa.Float(), nullable=True))
    op.add_column('productions', sa.Column('size_id', sa.Integer(), nullable=True))
    op.add_column('productions', sa.Column('manufacturer_id', sa.Integer(), nullable=True))
    op.add_column('productions', sa.Column('material_id', sa.Integer(), nullable=True))
    op.add_column('productions', sa.Column('unit_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_productions_id'), 'productions', ['id'], unique=False)
    op.create_unique_constraint('uq_productions_name', 'productions', ['name'])
    op.create_foreign_key('fk_productions_material_id', 'productions', 'materials', ['material_id'], ['id'])
    op.create_foreign_key('fk_productions_unit_id', 'productions', 'units', ['unit_id'], ['id'])
    op.create_foreign_key('fk_productions_size_id', 'productions', 'sizes', ['size_id'], ['id'])
    op.create_foreign_key('fk_productions_manufacturer_id', 'productions', 'manufacturers', ['manufacturer_id'], ['id'])

    # --- receivings ---
    op.add_column('receivings', sa.Column('supply_id', sa.Integer(), nullable=True))
    op.add_column('receivings', sa.Column('production_id', sa.Integer(), nullable=True))
    op.add_column('receivings', sa.Column('consumable_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_receivings_supply_id', 'receivings', 'supplies', ['supply_id'], ['id'])
    op.create_foreign_key('fk_receivings_production_id', 'receivings', 'productions', ['production_id'], ['id'])
    op.create_foreign_key('fk_receivings_consumable_id', 'receivings', 'consumables', ['consumable_id'], ['id'])
    op.drop_column('receivings', 'item_id')

    # --- supplies ---
    # --- supplies ---
    # Шаг 1: Добавляем колонку как NULL
    op.add_column('supplies', sa.Column('name', sa.String(), nullable=True))

    # Шаг 2: Заполняем значения (например, по ID или дефолт)
    op.execute("UPDATE supplies SET name = 'Supply #' || id WHERE name IS NULL")

    # Шаг 3: Делаем NOT NULL
    op.alter_column('supplies', 'name', nullable=False)
    op.add_column('supplies', sa.Column('description', sa.String(), nullable=True))
    op.add_column('supplies', sa.Column('quantity', sa.Float(), nullable=True))
    op.add_column('supplies', sa.Column('size_id', sa.Integer(), nullable=True))
    op.add_column('supplies', sa.Column('manufacturer_id', sa.Integer(), nullable=True))
    op.add_column('supplies', sa.Column('material_id', sa.Integer(), nullable=True))
    op.add_column('supplies', sa.Column('unit_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_supplies_id'), 'supplies', ['id'], unique=False)
    op.create_unique_constraint('uq_supplies_name', 'supplies', ['name'])
    op.create_foreign_key('fk_supplies_size_id', 'supplies', 'sizes', ['size_id'], ['id'])
    op.create_foreign_key('fk_supplies_material_id', 'supplies', 'materials', ['material_id'], ['id'])
    op.create_foreign_key('fk_supplies_unit_id', 'supplies', 'units', ['unit_id'], ['id'])
    op.create_foreign_key('fk_supplies_manufacturer_id', 'supplies', 'manufacturers', ['manufacturer_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    # === Обратные операции: сначала удаляем новые FK и колонки, потом воссоздаём items ===

    # --- supplies ---
    op.drop_constraint('fk_supplies_manufacturer_id', 'supplies', type_='foreignkey')
    op.drop_constraint('fk_supplies_unit_id', 'supplies', type_='foreignkey')
    op.drop_constraint('fk_supplies_material_id', 'supplies', type_='foreignkey')
    op.drop_constraint('fk_supplies_size_id', 'supplies', type_='foreignkey')
    op.drop_constraint('uq_supplies_name', 'supplies', type_='unique')
    op.drop_index(op.f('ix_supplies_id'), table_name='supplies')
    op.drop_column('supplies', 'unit_id')
    op.drop_column('supplies', 'material_id')
    op.drop_column('supplies', 'manufacturer_id')
    op.drop_column('supplies', 'size_id')
    op.drop_column('supplies', 'quantity')
    op.drop_column('supplies', 'description')
    op.drop_column('supplies', 'name')

    # --- receivings ---
    op.drop_constraint('fk_receivings_consumable_id', 'receivings', type_='foreignkey')
    op.drop_constraint('fk_receivings_production_id', 'receivings', type_='foreignkey')
    op.drop_constraint('fk_receivings_supply_id', 'receivings', type_='foreignkey')
    op.add_column('receivings', sa.Column('item_id', sa.INTEGER(), nullable=False))
    op.create_foreign_key('receivings_item_id_fkey', 'receivings', 'items', ['item_id'], ['id'])
    op.drop_column('receivings', 'consumable_id')
    op.drop_column('receivings', 'production_id')
    op.drop_column('receivings', 'supply_id')

    # --- productions ---
    op.drop_constraint('fk_productions_manufacturer_id', 'productions', type_='foreignkey')
    op.drop_constraint('fk_productions_size_id', 'productions', type_='foreignkey')
    op.drop_constraint('fk_productions_unit_id', 'productions', type_='foreignkey')
    op.drop_constraint('fk_productions_material_id', 'productions', type_='foreignkey')
    op.drop_constraint('uq_productions_name', 'productions', type_='unique')
    op.drop_index(op.f('ix_productions_id'), table_name='productions')
    op.drop_column('productions', 'unit_id')
    op.drop_column('productions', 'material_id')
    op.drop_column('productions', 'manufacturer_id')
    op.drop_column('productions', 'size_id')
    op.drop_column('productions', 'quantity')
    op.drop_column('productions', 'end_date')
    op.drop_column('productions', 'start_date')
    op.drop_column('productions', 'description')
    op.drop_column('productions', 'name')

    # --- consumables ---
    op.drop_constraint('fk_consumables_material_id', 'consumables', type_='foreignkey')
    op.drop_constraint('fk_consumables_unit_id', 'consumables', type_='foreignkey')
    op.drop_constraint('fk_consumables_size_id', 'consumables', type_='foreignkey')
    op.drop_constraint('fk_consumables_manufacturer_id', 'consumables', type_='foreignkey')
    op.drop_constraint('uq_consumables_name', 'consumables', type_='unique')
    op.drop_index(op.f('ix_consumables_id'), table_name='consumables')
    op.drop_column('consumables', 'unit_id')
    op.drop_column('consumables', 'material_id')
    op.drop_column('consumables', 'manufacturer_id')
    op.drop_column('consumables', 'size_id')
    op.drop_column('consumables', 'quantity')
    op.drop_column('consumables', 'description')
    op.drop_column('consumables', 'name')

    # --- cells ---
    op.drop_constraint('fk_cells_supply_id', 'cells', type_='foreignkey')
    op.drop_constraint('fk_cells_consumable_id', 'cells', type_='foreignkey')
    op.drop_constraint('fk_cells_production_id', 'cells', type_='foreignkey')
    op.drop_constraint('uq_cells_name', 'cells', type_='unique')
    op.create_index(op.f('ix_cells_name'), 'cells', ['name'], unique=False)
    op.alter_column('cells', 'capacity',
                    existing_type=sa.DOUBLE_PRECISION(precision=53),
                    nullable=True)
    op.add_column('cells', sa.Column('item_id', sa.INTEGER(), nullable=True))
    op.create_foreign_key('cells_item_id_fkey', 'cells', 'items', ['item_id'], ['id'])
    op.drop_column('cells', 'consumable_id')
    op.drop_column('cells', 'production_id')
    op.drop_column('cells', 'supply_id')

    # --- batches ---
    op.drop_constraint('fk_batches_consumable_id', 'batches', type_='foreignkey')
    op.drop_constraint('fk_batches_production_id', 'batches', type_='foreignkey')
    op.drop_column('batches', 'consumable_id')
    op.drop_column('batches', 'production_id')

    # --- barcodes ---
    op.drop_constraint('fk_barcodes_consumable_id', 'barcodes', type_='foreignkey')
    op.drop_constraint('fk_barcodes_production_id', 'barcodes', type_='foreignkey')
    op.drop_constraint('fk_barcodes_supply_id', 'barcodes', type_='foreignkey')
    op.add_column('barcodes', sa.Column('item_id', sa.INTEGER(), nullable=True))
    op.create_foreign_key('barcodes_item_id_fkey', 'barcodes', 'items', ['item_id'], ['id'])
    op.drop_column('barcodes', 'consumable_id')
    op.drop_column('barcodes', 'production_id')
    op.drop_column('barcodes', 'supply_id')

    # === Восстанавливаем таблицу items ===
    op.create_table(
        'items',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('name', sa.VARCHAR(), nullable=False),
        sa.Column('description', sa.VARCHAR(), nullable=True),
        sa.Column('quantity', sa.INTEGER(), nullable=False),
        sa.Column('material_id', sa.INTEGER(), nullable=True),
        sa.Column('size_id', sa.INTEGER(), nullable=True),
        sa.Column('unit_id', sa.INTEGER(), nullable=True),
        sa.Column('manufacturer_id', sa.INTEGER(), nullable=True),
        sa.ForeignKeyConstraint(['manufacturer_id'], ['manufacturers.id'], name='items_manufacturer_id_fkey'),
        sa.ForeignKeyConstraint(['material_id'], ['materials.id'], name='items_material_id_fkey'),
        sa.ForeignKeyConstraint(['size_id'], ['sizes.id'], name='items_size_id_fkey'),
        sa.ForeignKeyConstraint(['unit_id'], ['units.id'], name='items_unit_id_fkey'),
        sa.PrimaryKeyConstraint('id', name='items_pkey')
    )
    op.create_index(op.f('ix_items_id'), 'items', ['id'], unique=False)

    # === Восстанавливаем FK в consumables, productions, supplies ===
    op.create_foreign_key('consumables_id_fkey', 'consumables', 'items', ['id'], ['id'])
    op.create_foreign_key('productions_id_fkey', 'productions', 'items', ['id'], ['id'])
    op.create_foreign_key('supplies_id_fkey', 'supplies', 'items', ['id'], ['id'])