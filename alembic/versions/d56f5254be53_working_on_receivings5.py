"""remove orders table and related FKs

Revision ID: d56f5254be53
Revises: fd646bee5b1a
Create Date: 2025-10-18 14:16:50.838425
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd56f5254be53'
down_revision: Union[str, Sequence[str], None] = 'fd646bee5b1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Сначала удаляем внешние ключи, потом колонки, потом таблицу orders
    with op.batch_alter_table('batches', schema=None) as batch_op:
        batch_op.drop_constraint('batches_order_id_fkey', type_='foreignkey')
        batch_op.drop_column('order_id')

    with op.batch_alter_table('items', schema=None) as batch_op:
        batch_op.drop_constraint('items_order_id_fkey', type_='foreignkey')
        batch_op.drop_column('order_id')

    # Теперь можно удалить таблицу orders
    op.drop_index(op.f('ix_orders_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_name'), table_name='orders')
    op.drop_table('orders')


def downgrade() -> None:
    """Downgrade schema (восстановление таблицы orders и связей)."""
    # Создаем таблицу orders
    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('end_at', postgresql.TIMESTAMP(), nullable=True),
    )
    op.create_index(op.f('ix_orders_id'), 'orders', ['id'])
    op.create_index(op.f('ix_orders_name'), 'orders', ['name'])

    # Восстанавливаем поля order_id в связанных таблицах
    with op.batch_alter_table('items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('order_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('items_order_id_fkey', 'orders', ['order_id'], ['id'])

    with op.batch_alter_table('batches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('order_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('batches_order_id_fkey', 'orders', ['order_id'], ['id'])