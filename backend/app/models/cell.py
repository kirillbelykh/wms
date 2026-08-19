from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class Cell(Base):
    __tablename__ = "cells"

    id: Mapped[int] = mapped_column(primary_key=True)
    rack: Mapped[int] = mapped_column(nullable=False, comment="Стеллаж")
    tier: Mapped[int] = mapped_column(nullable=False, comment="Ярус")
    cell: Mapped[int] = mapped_column(nullable=False, comment="Ячейка")
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"))
    is_deleted: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    item: Mapped["Item | None"] = relationship("Item", back_populates="cells")
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", back_populates="cells")
    stocks: Mapped[list["Stock"]] = relationship("Stock", back_populates="cell")
