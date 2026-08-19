from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class PackingBox(Base):
    __tablename__ = "packing_boxes"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    box_number: Mapped[int] = mapped_column(nullable=False)
    total_pairs: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="packing_boxes")
    items: Mapped[list["PackingBoxItem"]] = relationship(
        "PackingBoxItem",
        back_populates="box",
        cascade="all, delete-orphan",
    )


class PackingBoxItem(Base):
    __tablename__ = "packing_box_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    box_id: Mapped[int] = mapped_column(ForeignKey("packing_boxes.id", ondelete="CASCADE"))
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="CASCADE"))
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)

    box: Mapped["PackingBox"] = relationship("PackingBox", back_populates="items")
    order_item: Mapped["OrderItem"] = relationship("OrderItem")
