from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class OrderStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    picking = "picking"
    packed = "packed"
    partially_packed = "partially_packed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"
    reformulated = "reformulated"
    pick_edited = "pick_edited"
    edited = "edited"


class OrderItemStatus(str, Enum):
    pending = "pending"
    picking = "picking"
    picked = "picked"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(String(50), default=OrderStatus.pending)
    supplier: Mapped[str | None] = mapped_column(String(500), nullable=True)
    customer: Mapped[str] = mapped_column(String(500), nullable=False)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    invoice: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transport_company: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approved: Mapped[bool] = mapped_column(default=False)
    shipping_date: Mapped[datetime | None] = mapped_column(nullable=True)
    actual_shipping_date: Mapped[datetime | None] = mapped_column(nullable=True)
    upd_gl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    priority: Mapped[int] = mapped_column(default=5)
    order_type: Mapped[str] = mapped_column(String(50), default="outbound")
    is_deleted: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    packing_boxes: Mapped[list["PackingBox"]] = relationship("PackingBox", back_populates="order", cascade="all, delete-orphan")
    chz_requests: Mapped[list["ChzRequest"]] = relationship("ChzRequest", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    picked_pairs: Mapped[int] = mapped_column(default=0)
    status: Mapped[OrderItemStatus] = mapped_column(String(50), default=OrderItemStatus.pending)
    suggested_stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id"), nullable=True)
    item_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_venchik: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # ✅ ДОБАВИТЬ
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    item: Mapped["Item"] = relationship("Item")
    suggested_stock: Mapped["Stock | None"] = relationship("Stock", foreign_keys=[suggested_stock_id])
    pick_operations: Mapped[list["PickOperation"]] = relationship("PickOperation", back_populates="order_item", cascade="all, delete-orphan")
    chz_request_items: Mapped[list["ChzRequestItem"]] = relationship("ChzRequestItem", back_populates="order_item")
