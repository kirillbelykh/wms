from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class EmployeeDepartment(str, Enum):
    production = "production"
    warehouse = "warehouse"
    other = "other"


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[EmployeeDepartment] = mapped_column(
        String(32),
        default=EmployeeDepartment.production,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

    shifts: Mapped[list["EmployeeShift"]] = relationship(
        "EmployeeShift",
        back_populates="employee",
        cascade="all, delete-orphan",
    )
    labor_entries: Mapped[list["ProductionLaborEntry"]] = relationship(
        "ProductionLaborEntry",
        back_populates="employee",
    )


class EmployeeShift(Base):
    __tablename__ = "employee_shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    work_date: Mapped[date] = mapped_column(nullable=False)
    start_time: Mapped[time] = mapped_column(nullable=False)
    end_time: Mapped[time] = mapped_column(nullable=False)
    department: Mapped[EmployeeDepartment] = mapped_column(
        String(32),
        default=EmployeeDepartment.production,
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="shifts")


class ProductionLaborEntry(Base):
    __tablename__ = "production_labor_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    work_date: Mapped[date] = mapped_column(nullable=False)
    start_time: Mapped[time] = mapped_column(nullable=False)
    end_time: Mapped[time] = mapped_column(nullable=False)
    people_count: Mapped[int] = mapped_column(default=1, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="labor_entries")
    employee: Mapped["Employee | None"] = relationship("Employee", back_populates="labor_entries")
    created_by: Mapped["User | None"] = relationship("User")
