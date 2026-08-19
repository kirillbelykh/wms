"""add employees and production labor

Revision ID: 7d0c0a9b1f42
Revises: 0ec019b4f811
Create Date: 2026-07-03 09:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "7d0c0a9b1f42"
down_revision: Union[str, Sequence[str], None] = "0ec019b4f811"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return inspect(op.get_bind())


def _has_table(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    columns = _inspector().get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def _has_index(table_name: str, index_name: str) -> bool:
    indexes = _inspector().get_indexes(table_name)
    return index_name in {index["name"] for index in indexes}


def upgrade() -> None:
    if not _has_column("production_orders", "task_type"):
        op.add_column(
            "production_orders",
            sa.Column("task_type", sa.String(length=32), nullable=False, server_default="packaging"),
        )

    if not _has_table("employees"):
        op.create_table(
            "employees",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=False),
            sa.Column("position", sa.String(length=255), nullable=True),
            sa.Column("department", sa.String(length=32), nullable=False, server_default="production"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("employee_shifts"):
        op.create_table(
            "employee_shifts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("employee_id", sa.Integer(), nullable=False),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("department", sa.String(length=32), nullable=False, server_default="production"),
            sa.Column("comment", sa.String(length=1000), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("production_labor_entries"):
        op.create_table(
            "production_labor_entries",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("production_order_id", sa.Integer(), nullable=False),
            sa.Column("employee_id", sa.Integer(), nullable=True),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("people_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("comment", sa.String(length=1000), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["production_order_id"], ["production_orders.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if _has_table("employee_shifts") and not _has_index("employee_shifts", "ix_employee_shifts_work_date"):
        op.create_index("ix_employee_shifts_work_date", "employee_shifts", ["work_date"])
    if _has_table("production_labor_entries") and not _has_index(
        "production_labor_entries",
        "ix_production_labor_entries_work_date",
    ):
        op.create_index(
            "ix_production_labor_entries_work_date",
            "production_labor_entries",
            ["work_date"],
        )


def downgrade() -> None:
    if _has_table("production_labor_entries") and _has_index(
        "production_labor_entries",
        "ix_production_labor_entries_work_date",
    ):
        op.drop_index("ix_production_labor_entries_work_date", table_name="production_labor_entries")
    if _has_table("employee_shifts") and _has_index("employee_shifts", "ix_employee_shifts_work_date"):
        op.drop_index("ix_employee_shifts_work_date", table_name="employee_shifts")
    if _has_table("production_labor_entries"):
        op.drop_table("production_labor_entries")
    if _has_table("employee_shifts"):
        op.drop_table("employee_shifts")
    if _has_table("employees"):
        op.drop_table("employees")
    if _has_column("production_orders", "task_type"):
        op.drop_column("production_orders", "task_type")
