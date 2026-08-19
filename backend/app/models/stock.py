from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base
from backend.app.models.item import ItemInventoryType

StockInventoryType = ItemInventoryType


class Stock(Base):
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    cell_id: Mapped[int] = mapped_column(ForeignKey("cells.id"))
    pairs_quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    reserved_pairs: Mapped[int] = mapped_column(nullable=False, default=0)
    pairs_per_box: Mapped[int | None] = mapped_column(nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    venchik: Mapped[str | None] = mapped_column(String(50), nullable=True)
    inventory_type: Mapped[StockInventoryType] = mapped_column(
        String(32),
        default=StockInventoryType.finished_goods,
        nullable=False,
    )
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    item: Mapped["Item"] = relationship("Item", back_populates="stocks")
    cell: Mapped["Cell"] = relationship("Cell", back_populates="stocks")
    pick_operations: Mapped[list["PickOperation"]] = relationship(
        "PickOperation",
        back_populates="stock",
    )
