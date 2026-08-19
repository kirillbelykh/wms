from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class ChzRequestStatus(str, Enum):
    requested = "requested"
    acknowledged = "acknowledged"
    ready = "ready"
    cancelled = "cancelled"


class ChzRequest(Base):
    __tablename__ = "chz_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[ChzRequestStatus] = mapped_column(String(32), default=ChzRequestStatus.requested)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    external_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="chz_requests")
    requested_by: Mapped["User | None"] = relationship("User", back_populates="chz_requests")
    items: Mapped[list["ChzRequestItem"]] = relationship(
        "ChzRequestItem",
        back_populates="request",
        cascade="all, delete-orphan",
    )

    @property
    def order_name(self) -> str | None:
        return self.order.name if self.order else None

    @property
    def order_customer(self) -> str | None:
        return self.order.customer if self.order else None

    @property
    def requested_by_username(self) -> str | None:
        return self.requested_by.username if self.requested_by else None

    @property
    def request_type(self) -> str:
        return "shipment"


class ChzRequestItem(Base):
    __tablename__ = "chz_request_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    chz_request_id: Mapped[int] = mapped_column(ForeignKey("chz_requests.id", ondelete="CASCADE"))
    order_item_id: Mapped[int | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    item_title: Mapped[str] = mapped_column(String(255), nullable=False)
    item_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    request: Mapped["ChzRequest"] = relationship("ChzRequest", back_populates="items")
    order_item: Mapped["OrderItem | None"] = relationship("OrderItem", back_populates="chz_request_items")


class ManualChzRequest(Base):
    __tablename__ = "manual_chz_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[ChzRequestStatus] = mapped_column(String(32), default=ChzRequestStatus.requested)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    external_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(nullable=True)

    requested_by: Mapped["User | None"] = relationship("User")
    items: Mapped[list["ManualChzRequestItem"]] = relationship(
        "ManualChzRequestItem",
        back_populates="request",
        cascade="all, delete-orphan",
    )

    @property
    def order_name(self) -> str:
        return f"ЧЗ-{self.id}"

    @property
    def requested_by_username(self) -> str | None:
        return self.requested_by.username if self.requested_by else None

    @property
    def request_type(self) -> str:
        return "manual"


class ManualChzRequestItem(Base):
    __tablename__ = "manual_chz_request_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("manual_chz_requests.id", ondelete="CASCADE"))
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    item_title: Mapped[str] = mapped_column(String(255), nullable=False)
    item_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_venchik: Mapped[str | None] = mapped_column(String(50), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    request: Mapped["ManualChzRequest"] = relationship("ManualChzRequest", back_populates="items")
    item: Mapped["Item | None"] = relationship("Item")
