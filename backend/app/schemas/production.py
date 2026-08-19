from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.schemas.employee import ProductionLaborEntryResponse


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


class ProductionBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProductionOrderItemCreate(BaseModel):
    item_id: int
    pairs_quantity: int
    item_size: str | None = None
    item_color: str | None = None
    batch_number: str | None = None      # <-- добавлено
    production_date: date | None = None  # <-- добавлено


class ProductionSupplyRequestItemCreate(BaseModel):
    item_id: int
    quantity: int
    size: str | None = None
    manufacturer: str | None = None
    stock_id: int | None = None  # ✅ Добавить - для ручного выбора остатка
    cell_id: int | None = None   # ✅ Добавить - для ручного выбора ячейки
    production_order_item_id: int | None = None

    @field_validator("size", "manufacturer", "stock_id", "cell_id", mode="before")
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


class ProductionOrderCreate(BaseModel):
    name: str
    task_type: ProductionTaskType = ProductionTaskType.packaging
    priority: int = 5
    comment: str | None = None
    related_order_id: int | None = None
    items: list[ProductionOrderItemCreate] = Field(default_factory=list)


class ProductionOrderUpdate(BaseModel):
    name: str | None = None
    task_type: ProductionTaskType | None = None
    priority: int | None = None
    comment: str | None = None
    related_order_id: int | None = None
    batch_number: str | None = None
    production_date: date | None = None


class ProductionOrderItemProducedUpdate(BaseModel):
    produced_pairs: int
    comment: str | None = None

class ProductionStartRequest(BaseModel):
    batch_number: str
    production_date: date


class ProductionChzRequestCreate(BaseModel):
    production_order_item_ids: list[int] | None = None
    comment: str | None = None


class ProductionSupplyRequestCreate(BaseModel):
    request_type: ProductionSupplyType
    comment: str | None = None
    items: list[ProductionSupplyRequestItemCreate]


class ProductionSupplyRequestAutoCreate(BaseModel):
    request_type: ProductionSupplyType
    comment: str | None = None


class ProductionReceiptRequestCreate(BaseModel):
    production_order_item_id: int
    quantity: int
    comment: str | None = None


class ProductionSupplyFulfillmentItem(BaseModel):
    request_item_id: int
    stock_id: int | None = None
    cell_id: int | None = None
    quantity: int


class ProductionSupplyFulfillmentRequest(BaseModel):
    items: list[ProductionSupplyFulfillmentItem]


class ProductionTransferCreate(BaseModel):
    production_order_item_id: int
    cell_id: int
    pairs_quantity: int


class ProductionOrderItemResponse(ProductionBaseModel):
    id: int
    item_id: int
    item_title: str
    item_size: str | None = None
    item_color: str | None = None
    pairs_quantity: int
    produced_pairs: int
    transferred_pairs: int
    batch_number: str | None = None      # <-- добавлено
    production_date: date | None = None  # <-- добавлено


class ProductionOrderItemBatchDateUpdate(BaseModel):
    batch_number: str | None = None
    production_date: date | None = None
    

class ProductionSupplyRequestItemResponse(ProductionBaseModel):
    id: int
    item_id: int
    production_order_item_id: int | None = None
    item_title: str
    item_size: str | None = None
    quantity: int
    fulfilled_quantity: int
    size: str | None = None
    manufacturer: str | None = None
    selected_stock_id: int | None = None
    selected_cell_id: int | None = None
    selected_cell_location: str | None = None


class ProductionSupplyRequestResponse(ProductionBaseModel):
    id: int
    request_type: ProductionSupplyType
    status: ProductionSupplyStatus
    comment: str | None = None
    items: list[ProductionSupplyRequestItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None


class ProductionChzRequestItemResponse(ProductionBaseModel):
    id: int
    production_order_item_id: int | None = None
    item_id: int | None = None
    pairs_quantity: int
    item_title: str
    item_size: str | None = None
    item_color: str | None = None
    batch_number: str | None = None


class ProductionChzRequestResponse(ProductionBaseModel):
    id: int
    production_order_id: int | None = None
    order_name: str | None = None
    requested_by_user_id: int | None = None
    requested_by_username: str | None = None
    request_type: str | None = None
    status: ProductionChzStatus
    is_active: bool
    comment: str | None = None
    external_request_id: str | None = None
    requested_at: datetime
    acknowledged_at: datetime | None = None
    ready_at: datetime | None = None
    items: list[ProductionChzRequestItemResponse] = Field(default_factory=list)


class ProductionTransferResponse(ProductionBaseModel):
    id: int
    production_order_item_id: int
    stock_id: int | None = None
    cell_id: int | None = None
    pairs_quantity: int
    transferred_at: datetime
    created_by_user_id: int | None = None


class ProductionOrderResponse(ProductionBaseModel):
    id: int
    name: str
    task_type: ProductionTaskType
    status: ProductionOrderStatus
    priority: int
    comment: str | None = None
    related_order_id: int | None = None
    related_order_name: str | None = None
    batch_number: str | None = None
    production_date: date | None = None
    created_by_user_id: int | None = None
    brigadier_user_id: int | None = None
    items: list[ProductionOrderItemResponse] = Field(default_factory=list)
    supply_requests: list[ProductionSupplyRequestResponse] = Field(default_factory=list)
    labor_entries: list["ProductionLaborEntryResponse"] = Field(default_factory=list)
    active_chz_request: ProductionChzRequestResponse | None = None
    created_at: datetime
    updated_at: datetime | None = None


class ProductionHistoryResponse(BaseModel):
    id: int
    production_order_item_id: int
    old_produced_pairs: int
    new_produced_pairs: int
    changed_by_user_id: int | None = None
    changed_by_username: str | None = None
    comment: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProductionItemProducedUpdate(BaseModel):
    produced_pairs: int
    comment: str | None = None  # <-- добавить это поле
