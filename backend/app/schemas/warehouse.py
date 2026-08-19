from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class ChzRequestStatus(str, Enum):
    requested = "requested"
    acknowledged = "acknowledged"
    ready = "ready"
    cancelled = "cancelled"


class WmsBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ItemCreate(BaseModel):
    title: str
    name: str
    product_type: str
    size: str
    color: str
    inventory_type: str = "finished_goods"
    max_pairs_per_box: int | None = None


class ItemUpdate(BaseModel):
    title: str | None = None
    name: str | None = None
    product_type: str | None = None
    size: str | None = None
    color: str | None = None
    inventory_type: str | None = None
    max_pairs_per_box: int | None = None

    @field_validator("*", mode="before")
    @classmethod
    def empty_str_to_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


class ItemResponse(WmsBaseModel):
    id: int
    title: str
    name: str
    product_type: str
    size: str
    color: str
    inventory_type: str
    max_pairs_per_box: int
    created_at: datetime
    updated_at: datetime | None = None


class StockCreate(BaseModel):
    item_id: int
    pairs_quantity: int
    pairs_per_box: int | None = None
    batch_number: str | None = None
    size: str | None = None
    color: str | None = None
    venchik: str | None = None
    inventory_type: str = "finished_goods"
    manufacturer: str | None = None


class StockUpdate(BaseModel):
    pairs_quantity: int | None = None
    pairs_per_box: int | None = None
    batch_number: str | None = None
    size: str | None = None
    color: str | None = None
    venchik: str | None = None
    inventory_type: str | None = None
    manufacturer: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def empty_stock_str_to_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


class StockWithdraw(BaseModel):
    pairs_quantity: int


class StockBulkDeleteRequest(BaseModel):
    stock_ids: list[int]

    @field_validator("stock_ids")
    @classmethod
    def ensure_stock_ids_present(cls, value: list[int]) -> list[int]:
        unique_ids = list(dict.fromkeys(value))
        if not unique_ids:
            raise ValueError("stock_ids must not be empty")
        if any(stock_id <= 0 for stock_id in unique_ids):
            raise ValueError("stock_ids must contain positive ids")
        return unique_ids


class StockBulkDeleteResponse(BaseModel):
    deleted_count: int
    stock_ids: list[int]


class StockMove(BaseModel):
    to_cell_id: int
    pairs_quantity: int


class StockResponse(WmsBaseModel):
    id: int
    item_id: int
    cell_id: int
    pairs_quantity: int
    reserved_pairs: int
    pairs_per_box: int | None = None
    batch_number: str | None = None
    size: str | None = None
    color: str | None = None
    venchik: str | None = None
    inventory_type: str
    manufacturer: str | None = None
    created_at: datetime
    updated_at: datetime


class CellCreate(BaseModel):
    rack: int
    cell: int
    tier: int
    warehouse_id: int


class CellUpdate(BaseModel):
    rack: int | None = None
    cell: int | None = None
    tier: int | None = None
    warehouse_id: int | None = None


class CellResponse(WmsBaseModel):
    id: int
    rack: int
    cell: int
    tier: int
    warehouse_id: int
    total_pairs: int = 0
    occupied: bool = False


class WarehouseCreate(BaseModel):
    name: str


class WarehouseUpdate(BaseModel):
    name: str | None = None


class WarehouseResponse(WmsBaseModel):
    id: int
    name: str
    cells: list[CellResponse] = Field(default_factory=list)


class OrderItemCreate(BaseModel):
    stock_id: int | None = None
    item_id: int | None = None
    item_title: str | None = None  
    item_size: str | None = None   
    item_color: str | None = None  
    pairs_quantity: int

    @field_validator("stock_id", "item_id", mode="before")
    @classmethod
    def empty_ids_to_none(cls, value: object) -> object:
        if value in ("", 0, "0"):
            return None
        return value

    @field_validator("pairs_quantity")
    @classmethod
    def ensure_positive_pairs_quantity(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("pairs_quantity must be positive")
        return value

    @model_validator(mode="after")
    def ensure_item_source_present(self) -> "OrderItemCreate":
        # ✅ ИЗМЕНЕНО: разрешаем создание с item_title
        if self.stock_id is None and self.item_id is None and not self.item_title:
            raise ValueError("Either stock_id, item_id, or item_title must be provided")
        if self.stock_id is None and self.item_id is None and self.item_title and not self.item_size:
            raise ValueError("item_size is required when creating a new item without stock_id/item_id")
        return self


class OrderCreate(BaseModel):
    name: str
    order_type: str = "outbound"
    priority: int = 5
    customer: str
    supplier: str | None = None
    comment: str | None = None
    invoice: str | None = None
    transport_company: str | None = None
    approved: bool = False
    shipping_date: datetime | None = None
    items: list[OrderItemCreate]


class OrderUpdate(BaseModel):
    name: str | None = None
    order_type: str | None = None
    priority: int | None = None
    status: OrderStatus | None = None
    supplier: str | None = None
    customer: str | None = None
    comment: str | None = None
    invoice: str | None = None
    transport_company: str | None = None
    approved: bool | None = None
    shipping_date: datetime | None = None
    actual_shipping_date: datetime | None = None
    upd_gl: str | None = None
    items: list[OrderItemCreate] | None = None

    @field_validator("*", mode="before")
    @classmethod
    def empty_order_str_to_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


class ChzRequestItemResponse(WmsBaseModel):
    id: int
    order_item_id: int | None = None
    item_id: int | None = None
    pairs_quantity: int
    item_title: str
    item_size: str | None = None
    item_color: str | None = None
    batch_number: str | None = None


class ChzRequestResponse(WmsBaseModel):
    id: int
    order_id: int | None = None
    order_name: str | None = None
    order_customer: str | None = None
    requested_by_user_id: int | None = None
    requested_by_username: str | None = None
    request_type: str | None = None
    status: ChzRequestStatus
    is_active: bool
    comment: str | None = None
    external_request_id: str | None = None
    requested_at: datetime
    acknowledged_at: datetime | None = None
    ready_at: datetime | None = None
    items: list[ChzRequestItemResponse] = Field(default_factory=list)


class OrderItemResponse(WmsBaseModel):
    id: int
    order_id: int
    item_id: int
    item_name: str | None = None
    item_size: str | None = None
    item_color: str | None = None
    item_venchik: str | None = None
    batch_number: str | None = None
    pairs_quantity: int
    picked_pairs: int
    status: OrderItemStatus
    suggested_stock_id: int | None = None
    suggested_cell_location: str | None = None
    waiting_for_production: bool = False


class OrderResponse(WmsBaseModel):
    id: int
    name: str
    status: OrderStatus
    supplier: str | None = None
    customer: str
    comment: str | None = None
    invoice: str | None = None
    transport_company: str | None = None
    approved: bool = False
    shipping_date: datetime | None = None
    actual_shipping_date: datetime | None = None
    upd_gl: str | None = None
    items: list[OrderItemResponse] = Field(default_factory=list)
    total_pairs: int = 0
    priority: int | None = None
    order_type: str | None = None
    requires_chz: bool = False
    active_chz_request: ChzRequestResponse | None = None
    created_at: datetime
    updated_at: datetime | None = None


class PickItemRequest(BaseModel):
    order_item_id: int
    stock_id: int
    pairs_quantity: int


class PickItemResponse(BaseModel):
    order_item_id: int
    picked_pairs: int
    remaining_to_pick: int
    stock_remaining: int
    is_completed: bool


class PickingListItemResponse(BaseModel):
    order_item_id: int
    item_id: int
    item_name: str
    item_size: str | None = None
    item_color: str | None = None
    item_venchik: str | None = None
    batch_number: str | None = None
    pairs_required: int
    picked_pairs: int
    suggested_cell_location: str | None = None
    suggested_stock_id: int | None = None
    available_pairs: int
    waiting_for_production: bool = False


class PickOperationResponse(WmsBaseModel):
    id: int
    order_item_id: int
    stock_id: int | None = None
    cell_id: int | None = None
    item_id: int | None = None
    pairs_quantity: int
    pairs_per_box: int | None = None
    batch_number: str | None = None
    size: str | None = None
    color: str | None = None
    venchik: str | None = None
    picked_at: datetime
    user_id: int | None = None


class PickOperationUpdate(BaseModel):
    pairs_quantity: int


class SuggestedStockUpdateRequest(BaseModel):
    stock_id: int


class ChzRequestCreate(BaseModel):
    order_item_ids: list[int]
    comment: str | None = None


class ChzStatusUpdate(BaseModel):
    status: ChzRequestStatus


class PackingProposalItemResponse(BaseModel):
    order_item_id: int
    item_name: str
    size: str | None = None
    color: str | None = None
    batch: str | None = None
    venchik: str | None = None 
    pairs_quantity: int


class PackingProposalResponse(BaseModel):
    group_number: int
    item_title: str
    color: str | None = None
    total_pairs: int
    can_merge: bool
    is_mixed: bool = False  
    items: list[PackingProposalItemResponse]
