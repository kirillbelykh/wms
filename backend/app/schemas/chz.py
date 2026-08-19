from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.chz import ChzRequestStatus


class ChzBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ManualChzRequestCreate(BaseModel):
    item_id: int
    pairs_quantity: int = Field(ge=1)
    item_size: str | None = None
    item_color: str | None = None
    item_venchik: str | None = None
    batch_number: str | None = None
    comment: str | None = None


class ManualChzRequestItemResponse(ChzBaseModel):
    id: int
    item_id: int | None = None
    pairs_quantity: int
    item_title: str
    item_size: str | None = None
    item_color: str | None = None
    item_venchik: str | None = None
    batch_number: str | None = None


class ManualChzRequestResponse(ChzBaseModel):
    id: int
    order_name: str | None = None
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
    items: list[ManualChzRequestItemResponse] = Field(default_factory=list)


class ChzRegistryEntryRef(BaseModel):
    source: str
    request_id: int


class ChzRegistryBulkAction(BaseModel):
    entries: list[ChzRegistryEntryRef] = Field(min_length=1)


class ChzRegistryEntryResponse(BaseModel):
    request_id: int
    source: str
    status: str
    is_active: bool
    order_id: int | None = None
    production_order_id: int | None = None
    order_name: str | None = None
    author: str | None = None
    comment: str | None = None
    requested_at: datetime
    acknowledged_at: datetime | None = None
    ready_at: datetime | None = None
    item_id: int | None = None
    item_title: str
    item_size: str | None = None
    item_color: str | None = None
    item_venchik: str | None = None
    batch_number: str | None = None
    pairs_quantity: int
