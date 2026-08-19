from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class PickOperation(Base):
    __tablename__ = "pick_operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id"))
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id", ondelete="SET NULL"), nullable=True)
    cell_id: Mapped[int | None] = mapped_column(ForeignKey("cells.id", ondelete="SET NULL"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    pairs_per_box: Mapped[int | None] = mapped_column(nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    venchik: Mapped[str | None] = mapped_column(String(50), nullable=True)
    picked_at: Mapped[datetime] = mapped_column(server_default=func.now())
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    order_item: Mapped["OrderItem"] = relationship("OrderItem", back_populates="pick_operations")
    stock: Mapped["Stock | None"] = relationship("Stock", back_populates="pick_operations")
    user: Mapped["User | None"] = relationship("User", back_populates="pick_operations")
