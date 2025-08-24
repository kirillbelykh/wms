"""Make psql db

Revision ID: 8f044e6c3ab2
Revises: 
Create Date: 2025-08-24 10:22:42.786199

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f044e6c3ab2'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 1. Создаём таблицы без проблемных FK
    op.create_table(
        'cells',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('capacity', sa.Float(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cells_id'), 'cells', ['id'], unique=False)
    op.create_index(op.f('ix_cells_name'), 'cells', ['name'], unique=False)

    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=True),
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orders_id'), 'orders', ['id'], unique=False)
    op.create_index(op.f('ix_orders_name'), 'orders', ['name'], unique=False)

    op.create_table(
        'items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=True),
        sa.Column('order_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_items_id'), 'items', ['id'], unique=False)
    op.create_index(op.f('ix_items_name'), 'items', ['name'], unique=False)

    op.create_table(
        'batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('cell_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_batches_id'), 'batches', ['id'], unique=False)
    op.create_index(op.f('ix_batches_name'), 'batches', ['name'], unique=False)

    op.create_table(
        'receivings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=True),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('barcode', sa.String(), nullable=False),
        sa.Column('country', sa.String(), nullable=True),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('unit_of_measure', sa.String(), nullable=True),
        sa.Column('comments', sa.String(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_receivings_barcode'), 'receivings', ['barcode'], unique=True)
    op.create_index(op.f('ix_receivings_id'), 'receivings', ['id'], unique=False)
    op.create_index(op.f('ix_receivings_name'), 'receivings', ['name'], unique=False)

    # 2. Теперь добавляем внешние ключи отдельно (разрываем циклы)
    op.create_foreign_key(None, 'cells', 'items', ['item_id'], ['id'])
    op.create_foreign_key(None, 'items', 'orders', ['order_id'], ['id'])
    op.create_foreign_key(None, 'batches', 'cells', ['cell_id'], ['id'])
    op.create_foreign_key(None, 'batches', 'items', ['item_id'], ['id'])
    op.create_foreign_key(None, 'orders', 'batches', ['batch_id'], ['id'])
    op.create_foreign_key(None, 'receivings', 'orders', ['order_id'], ['id'])
    op.create_foreign_key(None, 'receivings', 'items', ['item_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""

    # Удаляем внешние ключи
    op.drop_constraint(None, 'receivings', type_='foreignkey')
    op.drop_constraint(None, 'receivings', type_='foreignkey')
    op.drop_constraint(None, 'orders', type_='foreignkey')
    op.drop_constraint(None, 'batches', type_='foreignkey')
    op.drop_constraint(None, 'batches', type_='foreignkey')
    op.drop_constraint(None, 'items', type_='foreignkey')
    op.drop_constraint(None, 'cells', type_='foreignkey')

    # Дропаем таблицы в обратном порядке
    op.drop_index(op.f('ix_receivings_name'), table_name='receivings')
    op.drop_index(op.f('ix_receivings_id'), table_name='receivings')
    op.drop_index(op.f('ix_receivings_barcode'), table_name='receivings')
    op.drop_table('receivings')

    op.drop_index(op.f('ix_batches_name'), table_name='batches')
    op.drop_index(op.f('ix_batches_id'), table_name='batches')
    op.drop_table('batches')

    op.drop_index(op.f('ix_items_name'), table_name='items')
    op.drop_index(op.f('ix_items_id'), table_name='items')
    op.drop_table('items')

    op.drop_index(op.f('ix_orders_name'), table_name='orders')
    op.drop_index(op.f('ix_orders_id'), table_name='orders')
    op.drop_table('orders')

    op.drop_index(op.f('ix_cells_name'), table_name='cells')
    op.drop_index(op.f('ix_cells_id'), table_name='cells')
    op.drop_table('cells')