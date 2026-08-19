from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    STOREKEEPER = "storekeeper"
    OPERATOR = "operator"
    MANAGER = "manager"
    BRIGADIER = "brigadier"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default=UserRole.VIEWER.value, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(nullable=True)

    pick_operations: Mapped[list["PickOperation"]] = relationship(
        "PickOperation",
        back_populates="user",
    )
    chz_requests: Mapped[list["ChzRequest"]] = relationship("ChzRequest", back_populates="requested_by")
