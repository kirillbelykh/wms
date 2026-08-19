from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from backend.app.api.audit import AuditLogResponse
from backend.app.repositories import production_history as production_history_repo
from backend.app.schemas.production import ProductionHistoryResponse, ProductionOrderItemBatchDateUpdate
from backend.app.services.production import get_audit_logs_for_production_order, get_production_order_by_id, update_production_order_item_batch_date  # 
from backend.app.api.websocket import notify_all
from backend.app.core.config import settings
from backend.app.core.time import to_msk
from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.production import ProductionOrder, ProductionOrderItem, ProductionSupplyRequest, ProductionTransfer
from backend.app.models.stock import Stock
from backend.app.models.user import User
from backend.app.schemas.production import (
    ProductionChzRequestCreate,
    ProductionChzRequestResponse,
    ProductionOrderCreate,
    ProductionOrderItemProducedUpdate,
    ProductionOrderResponse,
    ProductionReceiptRequestCreate,
    ProductionOrderUpdate,
    ProductionStartRequest,
    ProductionSupplyFulfillmentRequest,
    ProductionSupplyRequestAutoCreate,
    ProductionSupplyRequestCreate,
    ProductionTransferCreate,
)
from backend.app.schemas.employee import ProductionLaborEntryCreate, ProductionLaborEntryResponse
from backend.app.services.employee import (
    create_production_labor_entries,
    delete_production_labor_entry,
    list_production_labor_entries,
)
from backend.app.services.audit import log_operation
from backend.app.services.production import (
    acknowledge_production_chz_request,
    complete_production,
    create_production_chz_request,
    create_production_order,
    delete_production_order,
    create_finished_goods_receipt_request,
    fulfill_supply_request,
    get_production_order,
    list_pending_production_chz_requests,
    list_production_orders,
    mark_production_chz_request_ready,
    request_supply,
    request_supply_automatically,
    start_supply_request,
    start_production,
    transfer_production_to_stock,
    update_production_order_item_produced,
    update_production_order,
)

router = APIRouter(prefix="/production-orders", tags=["production"])
integration_router = APIRouter(prefix="/integration/production-chz", tags=["production-chz"])


def require_chz_token(x_chz_token: str | None = Header(default=None)) -> None:
    expected_token = settings.chz_bridge_token_value
    if not expected_token or x_chz_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid CHZ integration token")


@router.get("/{production_order_id}/history", response_model=list[ProductionHistoryResponse])
async def get_production_history(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_production_order"))],
):
    """Получить историю изменений факта производства по заказу"""
    # Проверяем, что заказ существует
    order = await get_production_order_by_id(db, production_order_id)
    
    history = await production_history_repo.get_production_history_by_order(db, production_order_id)
    
    # Формируем ответ с именами пользователей
    result = []
    for entry in history:
        result.append({
            "id": entry.id,
            "production_order_item_id": entry.production_order_item_id,
            "old_produced_pairs": entry.old_produced_pairs,
            "new_produced_pairs": entry.new_produced_pairs,
            "changed_by_user_id": entry.changed_by_user_id,
            "changed_by_username": entry.changed_by.username if entry.changed_by else "Система",
            "comment": entry.comment,
            "created_at": entry.created_at,
        })
    
    return result


@router.get("/available-stocks")
async def get_available_stocks(
    inventory_type: str,  # 'raw_material' или 'consumable'
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Получить все доступные остатки по типу для производства."""
    stocks = await db.scalars(
        select(Stock)
        .options(selectinload(Stock.item), selectinload(Stock.cell).selectinload(Cell.warehouse))
        .where(
            Stock.inventory_type == inventory_type,
            Stock.pairs_quantity > 0
        )
        .order_by(Stock.updated_at.desc())
    )
    return [
        {
            "id": stock.id,
            "item_id": stock.item_id,
            "item_title": stock.item.title if stock.item else "Неизвестно",
            "size": stock.size,
            "batch_number": stock.batch_number,
            "pairs_quantity": stock.pairs_quantity,
            "cell_location": f"{stock.cell.rack}-{stock.cell.tier}-{stock.cell.cell}" if stock.cell else None,
            "warehouse_name": stock.cell.warehouse.name if stock.cell and stock.cell.warehouse else None,
        }
        for stock in stocks
    ]
    

@router.get("", response_model=list[ProductionOrderResponse])
async def get_all(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await list_production_orders(db)


@router.get("/{production_order_id}", response_model=ProductionOrderResponse)
async def get_by_id(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await get_production_order(db, production_order_id)


@router.post("", response_model=ProductionOrderResponse)
async def create(
    payload: ProductionOrderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("create_production_order"))],
):
    order = await create_production_order(db, payload, created_by_user_id=current_user.id)
    await log_operation(
        db,
        operation_type="create_production_order",
        user_id=current_user.id,
        details={"production_order_id": order.id, "name": order.name},
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_order_created",
            {"production_order_id": order.id, "name": order.name, "created_by": current_user.username},
        )
    )
    return order


@router.delete("/{production_order_id}", status_code=204)
async def delete(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_production_order"))],
):
    existing_order = await _get_production_order_model_for_snapshot(db, production_order_id)
    order_name = existing_order.name if existing_order is not None else f"#{production_order_id}"

    await log_operation(
        db,
        operation_type="delete_production_order",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "name": order_name,
            "before": _snapshot_production_order(existing_order) if existing_order else None,
        },
    )
    await delete_production_order(db, production_order_id)
    asyncio.create_task(
        notify_all(
            "production_order_deleted",
            {
                "production_order_id": production_order_id,
                "name": order_name,
                "deleted_by": current_user.username,
            },
        )
    )


@router.patch("/{production_order_id}", response_model=ProductionOrderResponse)
async def update(
    production_order_id: int,
    payload: ProductionOrderUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_production_order"))],
):
    order_before = await _get_production_order_model_for_snapshot(db, production_order_id)
    order_before_snapshot = _snapshot_production_order(order_before)
    order = await update_production_order(db, production_order_id, payload)
    await log_operation(
        db,
        operation_type="update_production_order",
        user_id=current_user.id,
        details={
            "production_order_id": order.id,
            "before": order_before_snapshot,
            "changes": payload.model_dump(exclude_unset=True, mode="json"),
        },
    )
    await db.commit()
    return order


@router.patch("/{production_order_id}/items/{production_order_item_id}/produced", response_model=ProductionOrderResponse)
async def update_item_produced(
    production_order_id: int,
    production_order_item_id: int,
    payload: ProductionOrderItemProducedUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_production_order"))],
):
    order_before = await get_production_order(db, production_order_id)
    previous_item = next((item for item in order_before.items if item.id == production_order_item_id), None)
    previous_produced_pairs = previous_item.produced_pairs if previous_item is not None else None

    order = await update_production_order_item_produced(
        db, production_order_id, production_order_item_id, payload, user_id=current_user.id
    )
    await log_operation(
        db,
        operation_type="update_production_item_progress",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "production_order_item_id": production_order_item_id,
            "old_quantity": previous_produced_pairs,
            "new_quantity": payload.produced_pairs,
            "comment": payload.comment,  # если хотите сохранять комментарий
        },
    )
    # ✅ Единственный commit – здесь
    await db.commit()
    return order


@router.patch("/{production_order_id}/items/{production_order_item_id}/batch-date", response_model=ProductionOrderResponse)
async def update_item_batch_date(
    production_order_id: int,
    production_order_item_id: int,
    payload: ProductionOrderItemBatchDateUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_production_order"))],
):
    item_before = await db.get(ProductionOrderItem, production_order_item_id)
    item_before_snapshot = _snapshot_production_order_item(item_before)
    """Обновить партию и дату производства для конкретной позиции."""
    order = await update_production_order_item_batch_date(db, production_order_id, production_order_item_id, payload)
    await log_operation(
        db,
        operation_type="update_production_item_batch_date",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "production_order_item_id": production_order_item_id,
            "before": item_before_snapshot,
            "batch_number": payload.batch_number,
            "production_date": payload.production_date.isoformat() if payload.production_date else None,
        },
    )
    await db.commit()
    return order


@router.post("/{production_order_id}/supply-requests", response_model=ProductionOrderResponse)
async def create_supply_request(
    production_order_id: int,
    payload: ProductionSupplyRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("request_production_supplies"))],
):
    order = await request_supply(db, production_order_id, payload)
    supply_request_id = await _latest_supply_request_id(db, production_order_id, str(payload.request_type.value if hasattr(payload.request_type, "value") else payload.request_type))
    await log_operation(
        db,
        operation_type="create_production_supply_request",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "supply_request_id": supply_request_id,
            "request_type": payload.request_type.value if hasattr(payload.request_type, "value") else str(payload.request_type),
            "items_count": len(payload.items),
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_supply_requested",
            {
                "production_order_id": production_order_id,
                "name": order.name,
                "request_type": payload.request_type.value if hasattr(payload.request_type, "value") else str(payload.request_type),
            },
        )
    )
    return order


@router.post("/{production_order_id}/supply-requests/auto", response_model=ProductionOrderResponse)
async def create_supply_request_automatically(
    production_order_id: int,
    payload: ProductionSupplyRequestAutoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("request_production_supplies"))],
):
    order = await request_supply_automatically(db, production_order_id, payload)
    supply_request_id = await _latest_supply_request_id(db, production_order_id, str(payload.request_type.value if hasattr(payload.request_type, "value") else payload.request_type))
    await log_operation(
        db,
        operation_type="create_production_supply_request_auto",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "supply_request_id": supply_request_id,
            "request_type": payload.request_type.value if hasattr(payload.request_type, "value") else str(payload.request_type),
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_supply_requested",
            {
                "production_order_id": production_order_id,
                "name": order.name,
                "request_type": payload.request_type.value if hasattr(payload.request_type, "value") else str(payload.request_type),
            },
        )
    )
    return order


@router.post("/{production_order_id}/receipt-requests", response_model=ProductionOrderResponse)
async def create_receipt_request(
    production_order_id: int,
    payload: ProductionReceiptRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("transfer_production_to_stock"))],
):
    order = await create_finished_goods_receipt_request(db, production_order_id, payload)
    supply_request_id = await _latest_supply_request_id(db, production_order_id, "finished_goods_receipt")
    await log_operation(
        db,
        operation_type="create_production_receipt_request",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "supply_request_id": supply_request_id,
            "production_order_item_id": payload.production_order_item_id,
            "quantity": payload.quantity,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_receipt_requested",
            {"production_order_id": production_order_id, "name": order.name},
        )
    )
    return order


@router.post("/supply-requests/{supply_request_id}/start", response_model=ProductionOrderResponse)
async def start_supply(
    supply_request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("fulfill_production_supplies"))],
):
    order = await start_supply_request(db, supply_request_id)
    await log_operation(
        db,
        operation_type="start_production_supply_request",
        user_id=current_user.id,
        details={
            "production_order_id": order.id,  # <-- добавить
            "supply_request_id": supply_request_id,
        },
    )
    await db.commit()
    return order


@router.post("/supply-requests/{supply_request_id}/fulfill", response_model=ProductionOrderResponse)
async def fulfill_supply(
    supply_request_id: int,
    payload: ProductionSupplyFulfillmentRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("fulfill_production_supplies"))],
):
    request_before = await _get_supply_request_model_for_snapshot(db, supply_request_id)
    request_before_snapshot = _snapshot_supply_request(request_before)
    order = await fulfill_supply_request(db, supply_request_id, payload, user_id=current_user.id)
    await log_operation(
        db,
        operation_type="fulfill_production_supply_request",
        user_id=current_user.id,
        details={
            "production_order_id": order.id,  # <-- добавить
            "supply_request_id": supply_request_id,
            "before": request_before_snapshot,
            "items_count": len(payload.items),
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_supply_fulfilled",
            {"production_order_id": order.id, "name": order.name, "supply_request_id": supply_request_id},
        )
    )
    if order.status.value == "ready_to_work":
        asyncio.create_task(
            notify_all(
                "production_ready_to_work",
                {"production_order_id": order.id, "name": order.name},
            )
        )
    return order


@router.post("/{production_order_id}/start", response_model=ProductionOrderResponse)
async def start(
    production_order_id: int,
    payload: ProductionStartRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("start_production"))],
):
    order_before = await _get_production_order_model_for_snapshot(db, production_order_id)
    order_before_snapshot = _snapshot_production_order(order_before)
    order = await start_production(db, production_order_id, payload, brigadier_user_id=current_user.id)
    await log_operation(
        db,
        operation_type="start_production",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "before": order_before_snapshot,
            "batch_number": payload.batch_number,
        },
    )
    await db.commit()
    return order


@router.post("/{production_order_id}/complete", response_model=ProductionOrderResponse)
async def complete(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("complete_production"))],
):
    order_before = await _get_production_order_model_for_snapshot(db, production_order_id)
    order_before_snapshot = _snapshot_production_order(order_before)
    order = await complete_production(db, production_order_id)
    await log_operation(
        db,
        operation_type="complete_production",
        user_id=current_user.id,
        details={"production_order_id": production_order_id, "before": order_before_snapshot},
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_completed",
            {"production_order_id": production_order_id, "name": order.name},
        )
    )
    return order


@router.post("/{production_order_id}/transfer", response_model=ProductionOrderResponse)
async def transfer(
    production_order_id: int,
    payload: ProductionTransferCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("transfer_production_to_stock"))],
):
    order = await transfer_production_to_stock(db, production_order_id, payload, user_id=current_user.id)
    transfer_id = await _latest_transfer_id(db, payload.production_order_item_id, payload.cell_id, payload.pairs_quantity)
    await log_operation(
        db,
        operation_type="transfer_production_to_stock",
        user_id=current_user.id,
        details={
            "production_order_id": production_order_id,
            "name": order.name,
            "production_order_item_id": payload.production_order_item_id,
            "cell_id": payload.cell_id,
            "pairs_quantity": payload.pairs_quantity,
            "transfer_id": transfer_id,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_stock_transferred",
            {"production_order_id": production_order_id, "name": order.name},
        )
    )
    return order


@router.get("/{production_order_id}/labor", response_model=list[ProductionLaborEntryResponse])
async def get_labor_entries(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_production_order"))],
):
    await get_production_order_by_id(db, production_order_id)
    return await list_production_labor_entries(db, production_order_id)


@router.post("/{production_order_id}/labor", response_model=list[ProductionLaborEntryResponse])
async def create_labor_entries(
    production_order_id: int,
    payload: ProductionLaborEntryCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_production_labor"))],
):
    return await create_production_labor_entries(
        db,
        production_order_id,
        payload,
        created_by_user_id=current_user.id,
    )


@router.delete("/{production_order_id}/labor/{entry_id}", status_code=204)
async def delete_labor_entry(
    production_order_id: int,
    entry_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_production_labor"))],
):
    await delete_production_labor_entry(db, production_order_id, entry_id)


@router.post("/{production_order_id}/chz-requests", response_model=ProductionOrderResponse)
async def request_chz(
    production_order_id: int,
    payload: ProductionChzRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("request_production_chz"))],
):
    order = await create_production_chz_request(
        db,
        production_order_id=production_order_id,
        payload=payload,
        requested_by_user_id=current_user.id,
    )
    request_id = order.active_chz_request.id if order.active_chz_request else None
    await log_operation(
        db,
        operation_type="create_production_chz_request",
        user_id=current_user.id,
        details={"production_order_id": production_order_id, "request_id": request_id},
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "production_chz_requested",
            {"production_order_id": production_order_id, "name": order.name},
        )
    )
    return order


@integration_router.get("/requests/pending", response_model=list[ProductionChzRequestResponse], dependencies=[Depends(require_chz_token)])
async def get_pending_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    requests = await list_pending_production_chz_requests(db)
    return [ProductionChzRequestResponse.model_validate(request) for request in requests]


@integration_router.post("/requests/{request_id}/acknowledge", response_model=ProductionChzRequestResponse, dependencies=[Depends(require_chz_token)])
async def acknowledge_request(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await acknowledge_production_chz_request(db, request_id)
    asyncio.create_task(
        notify_all(
            "production_chz_acknowledged",
            {"production_order_id": request.production_order_id, "request_id": request.id},
        )
    )
    return ProductionChzRequestResponse.model_validate(request)


@integration_router.post("/requests/{request_id}/ready", response_model=ProductionChzRequestResponse, dependencies=[Depends(require_chz_token)])
async def mark_ready(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await mark_production_chz_request_ready(db, request_id)
    asyncio.create_task(
        notify_all(
            "production_chz_ready",
            {"production_order_id": request.production_order_id, "request_id": request.id},
        )
    )
    return ProductionChzRequestResponse.model_validate(request)


async def _get_production_order_model_for_snapshot(db: AsyncSession, production_order_id: int) -> ProductionOrder | None:
    return await db.scalar(
        select(ProductionOrder)
        .options(
            selectinload(ProductionOrder.items),
            selectinload(ProductionOrder.supply_requests).selectinload(ProductionSupplyRequest.items),
        )
        .where(ProductionOrder.id == production_order_id)
    )


async def _get_supply_request_model_for_snapshot(db: AsyncSession, supply_request_id: int) -> ProductionSupplyRequest | None:
    return await db.scalar(
        select(ProductionSupplyRequest)
        .options(selectinload(ProductionSupplyRequest.items))
        .where(ProductionSupplyRequest.id == supply_request_id)
    )


def _snapshot_production_order(order: ProductionOrder | None) -> dict | None:
    if order is None:
        return None
    return {
        "id": order.id,
        "name": order.name,
        "task_type": "packaging" if str(order.task_type) in {"", "None", "default"} else (
            order.task_type.value if hasattr(order.task_type, "value") else str(order.task_type)
        ),
        "status": order.status.value if hasattr(order.status, "value") else str(order.status),
        "priority": order.priority,
        "comment": order.comment,
        "related_order_id": order.related_order_id,
        "batch_number": order.batch_number,
        "production_date": order.production_date.isoformat() if order.production_date else None,
        "created_by_user_id": order.created_by_user_id,
        "brigadier_user_id": order.brigadier_user_id,
        "items": [_snapshot_production_order_item(item) for item in order.items],
        "supply_requests": [_snapshot_supply_request(request) for request in order.supply_requests],
    }


def _snapshot_production_order_item(item: ProductionOrderItem | None) -> dict | None:
    if item is None:
        return None
    return {
        "id": item.id,
        "item_id": item.item_id,
        "pairs_quantity": item.pairs_quantity,
        "produced_pairs": item.produced_pairs,
        "transferred_pairs": item.transferred_pairs,
        "item_size": item.item_size,
        "item_color": item.item_color,
        "batch_number": item.batch_number,
        "production_date": item.production_date.isoformat() if item.production_date else None,
    }


def _snapshot_supply_request(request: ProductionSupplyRequest | None) -> dict | None:
    if request is None:
        return None
    return {
        "id": request.id,
        "status": request.status.value if hasattr(request.status, "value") else str(request.status),
        "request_type": request.request_type.value if hasattr(request.request_type, "value") else str(request.request_type),
        "comment": request.comment,
        "items": [
            {
                "id": item.id,
                "item_id": item.item_id,
                "production_order_item_id": item.production_order_item_id,
                "quantity": item.quantity,
                "fulfilled_quantity": item.fulfilled_quantity,
                "consumed_quantity": item.consumed_quantity,
                "size": item.size,
                "manufacturer": item.manufacturer,
                "selected_stock_id": item.selected_stock_id,
                "selected_cell_id": item.selected_cell_id,
            }
            for item in request.items
        ],
    }


async def _latest_supply_request_id(db: AsyncSession, production_order_id: int, request_type: str) -> int | None:
    return await db.scalar(
        select(ProductionSupplyRequest.id)
        .where(
            ProductionSupplyRequest.production_order_id == production_order_id,
            ProductionSupplyRequest.request_type == request_type,
        )
        .order_by(ProductionSupplyRequest.created_at.desc(), ProductionSupplyRequest.id.desc())
    )


async def _latest_transfer_id(
    db: AsyncSession,
    production_order_item_id: int,
    cell_id: int,
    pairs_quantity: int,
) -> int | None:
    return await db.scalar(
        select(ProductionTransfer.id)
        .where(
            ProductionTransfer.production_order_item_id == production_order_item_id,
            ProductionTransfer.cell_id == cell_id,
            ProductionTransfer.pairs_quantity == pairs_quantity,
        )
        .order_by(ProductionTransfer.transferred_at.desc(), ProductionTransfer.id.desc())
    )


@router.get("/{production_order_id}/audit-logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    production_order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_production_order"))],
):
    """Получить историю действий по производственному заказу."""
    await get_production_order_by_id(db, production_order_id)
    logs = await get_audit_logs_for_production_order(db, production_order_id)

    user_ids = {log.user_id for log in logs if log.user_id is not None}
    item_ids = {log.item_id for log in logs if log.item_id is not None}

    users = list((await db.scalars(select(User).where(User.id.in_(user_ids)))).all()) if user_ids else []
    items = list((await db.scalars(select(Item).where(Item.id.in_(item_ids)))).all()) if item_ids else []

    user_map = {user.id: user for user in users}
    item_map = {item.id: item for item in items}

    return [
        AuditLogResponse(
            id=log.id,
            operation_type=log.operation_type,
            user_id=log.user_id,
            item_id=log.item_id,
            stock_id=log.stock_id,
            cell_id=log.cell_id,
            warehouse_id=log.warehouse_id,
            quantity=log.quantity,
            details=log.details,
            created_at=to_msk(log.created_at) or log.created_at,
            user_email=user_map.get(log.user_id).email if log.user_id in user_map else None,
            user_username=user_map.get(log.user_id).username if log.user_id in user_map else None,
            item_title=item_map.get(log.item_id).title if log.item_id in item_map else None,
        )
        for log in logs
    ]
