from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class ItemInventoryType(str, Enum):
    finished_goods = "finished_goods"
    raw_material = "raw_material"
    consumable = "consumable"


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(500))
    product_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[str] = mapped_column(String(20), nullable=False)
    color: Mapped[str] = mapped_column(String(200), nullable=False)
    inventory_type: Mapped[ItemInventoryType] = mapped_column(
        String(32),
        default=ItemInventoryType.finished_goods,
        nullable=False,
    )
    max_pairs_per_box: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_deleted: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    cells: Mapped[list["Cell"]] = relationship("Cell", back_populates="item")
    stocks: Mapped[list["Stock"]] = relationship("Stock", back_populates="item", cascade="all, delete-orphan")
