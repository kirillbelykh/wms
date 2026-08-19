from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.db_base import Base


class ProductionOrderStatus(str, Enum):
    pending = "pending"
    awaiting_resources = "awaiting_resources"
    ready_to_work = "ready_to_work"
    in_progress = "in_progress"
    completed = "completed"
    partially_transferred = "partially_transferred"
    transferred = "transferred"


class ProductionSupplyType(str, Enum):
    raw_material = "raw_material"
    consumable = "consumable"
    finished_goods_receipt = "finished_goods_receipt"


class ProductionSupplyStatus(str, Enum):
    requested = "requested"
    in_progress = "in_progress"
    completed = "completed"


class ProductionChzStatus(str, Enum):
    requested = "requested"
    acknowledged = "acknowledged"
    ready = "ready"
    cancelled = "cancelled"


class ProductionTaskType(str, Enum):
    packaging = "packaging"
    unpacking = "unpacking"
    trim_cuffs = "trim_cuffs"
    warehouse_help = "warehouse_help"
    defect_sorting = "defect_sorting"
    repacking = "repacking"
    cleaning = "cleaning"


class ProductionOrder(Base):
    __tablename__ = "production_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    task_type: Mapped[ProductionTaskType] = mapped_column(
        String(32),
        default=ProductionTaskType.packaging,
        nullable=False,
    )
    status: Mapped[ProductionOrderStatus] = mapped_column(
        String(32),
        default=ProductionOrderStatus.pending,
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(default=5, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    related_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    production_date: Mapped[date | None] = mapped_column(nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    brigadier_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    related_order: Mapped["Order | None"] = relationship("Order")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id])
    brigadier: Mapped["User | None"] = relationship("User", foreign_keys=[brigadier_user_id])
    items: Mapped[list["ProductionOrderItem"]] = relationship(
        "ProductionOrderItem",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    supply_requests: Mapped[list["ProductionSupplyRequest"]] = relationship(
        "ProductionSupplyRequest",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    chz_requests: Mapped[list["ProductionChzRequest"]] = relationship(
        "ProductionChzRequest",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )
    labor_entries: Mapped[list["ProductionLaborEntry"]] = relationship(
        "ProductionLaborEntry",
        back_populates="production_order",
        cascade="all, delete-orphan",
    )


class ProductionOrderItem(Base):
    __tablename__ = "production_order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"))
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    produced_pairs: Mapped[int] = mapped_column(default=0, nullable=False)
    transferred_pairs: Mapped[int] = mapped_column(default=0, nullable=False)
    
    item_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # ✅ НОВЫЕ ПОЛЯ для партии и даты на уровне позиции
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    production_date: Mapped[date | None] = mapped_column(nullable=True)

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="items")
    item: Mapped["Item"] = relationship("Item")
    transfers: Mapped[list["ProductionTransfer"]] = relationship(
        "ProductionTransfer",
        back_populates="production_order_item",
        cascade="all, delete-orphan",
    )
    history: Mapped[list["ProductionHistory"]] = relationship(
        "ProductionHistory",
        back_populates="production_order_item",
        cascade="all, delete-orphan",
        order_by="ProductionHistory.created_at.desc()"
    )

class ProductionSupplyRequest(Base):
    __tablename__ = "production_supply_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"))
    request_type: Mapped[ProductionSupplyType] = mapped_column(String(32), nullable=False)
    status: Mapped[ProductionSupplyStatus] = mapped_column(
        String(32),
        default=ProductionSupplyStatus.requested,
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="supply_requests")
    items: Mapped[list["ProductionSupplyRequestItem"]] = relationship(
        "ProductionSupplyRequestItem",
        back_populates="request",
        cascade="all, delete-orphan",
    )


class ProductionSupplyRequestItem(Base):
    __tablename__ = "production_supply_request_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("production_supply_requests.id", ondelete="CASCADE"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"))
    production_order_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_order_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    quantity: Mapped[int] = mapped_column(nullable=False)
    fulfilled_quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    consumed_quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    selected_stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id", ondelete="SET NULL"), nullable=True)
    selected_cell_id: Mapped[int | None] = mapped_column(ForeignKey("cells.id", ondelete="SET NULL"), nullable=True)

    request: Mapped["ProductionSupplyRequest"] = relationship("ProductionSupplyRequest", back_populates="items")
    item: Mapped["Item"] = relationship("Item")
    production_order_item: Mapped["ProductionOrderItem | None"] = relationship("ProductionOrderItem")
    selected_stock: Mapped["Stock | None"] = relationship("Stock")
    selected_cell: Mapped["Cell | None"] = relationship("Cell")


class ProductionChzRequest(Base):
    __tablename__ = "production_chz_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"))
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[ProductionChzStatus] = mapped_column(
        String(32),
        default=ProductionChzStatus.requested,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    external_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(nullable=True)

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="chz_requests")
    requested_by: Mapped["User | None"] = relationship("User")
    items: Mapped[list["ProductionChzRequestItem"]] = relationship(
        "ProductionChzRequestItem",
        back_populates="request",
        cascade="all, delete-orphan",
    )

    @property
    def order_name(self) -> str | None:
        return self.production_order.name if self.production_order else None

    @property
    def requested_by_username(self) -> str | None:
        return self.requested_by.username if self.requested_by else None

    @property
    def request_type(self) -> str:
        return "production"


class ProductionChzRequestItem(Base):
    __tablename__ = "production_chz_request_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("production_chz_requests.id", ondelete="CASCADE"))
    production_order_item_id: Mapped[int | None] = mapped_column(ForeignKey("production_order_items.id", ondelete="SET NULL"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    item_title: Mapped[str] = mapped_column(String(255), nullable=False)
    item_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    request: Mapped["ProductionChzRequest"] = relationship("ProductionChzRequest", back_populates="items")
    item: Mapped["Item | None"] = relationship("Item")
    production_order_item: Mapped["ProductionOrderItem | None"] = relationship("ProductionOrderItem")


class ProductionTransfer(Base):
    __tablename__ = "production_transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_item_id: Mapped[int] = mapped_column(ForeignKey("production_order_items.id", ondelete="CASCADE"))
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id", ondelete="SET NULL"), nullable=True)
    cell_id: Mapped[int | None] = mapped_column(ForeignKey("cells.id", ondelete="SET NULL"), nullable=True)
    pairs_quantity: Mapped[int] = mapped_column(nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    transferred_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    production_order_item: Mapped["ProductionOrderItem"] = relationship("ProductionOrderItem", back_populates="transfers")
    stock: Mapped["Stock | None"] = relationship("Stock")
    cell: Mapped["Cell | None"] = relationship("Cell")
    created_by: Mapped["User | None"] = relationship("User")


class ProductionHistory(Base):
    __tablename__ = "production_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    production_order_item_id: Mapped[int] = mapped_column(
        ForeignKey("production_order_items.id", ondelete="CASCADE"),
        nullable=False
    )
    old_produced_pairs: Mapped[int] = mapped_column(nullable=False)
    new_produced_pairs: Mapped[int] = mapped_column(nullable=False)
    changed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    production_order_item: Mapped["ProductionOrderItem"] = relationship(
        "ProductionOrderItem",
        back_populates="history"
    )
    changed_by: Mapped["User | None"] = relationship("User")
