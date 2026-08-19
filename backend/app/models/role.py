# backend/app/models/role.py
from typing import TYPE_CHECKING, List
from sqlalchemy import String, Table, Column, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.core.db_base import Base

# Связующая таблица role <-> permission
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # например "create_warehouse"
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    group: Mapped[str] = mapped_column(String(50), default="other")  # warehouses, orders, stocks, admin
    
    roles: Mapped[List["Role"]] = relationship(
        "Role", secondary=role_permissions, back_populates="permissions"
    )
    
    def __repr__(self) -> str:
        return f"<Permission(code={self.code})>"


class Role(Base):
    __tablename__ = "roles"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # "admin", "storekeeper"
    description: Mapped[str] = mapped_column(String(255), default="")
    is_system: Mapped[bool] = mapped_column(default=False)  # системные роли нельзя удалить
    
    permissions: Mapped[List["Permission"]] = relationship(
        "Permission", secondary=role_permissions, back_populates="roles"
    )
    
    def __repr__(self) -> str:
        return f"<Role(name={self.name})>"
