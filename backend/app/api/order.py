from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.api.audit import AuditLogResponse
from backend.app.api.websocket import notify_all
from backend.app.core.time import to_msk
from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.item import Item
from backend.app.models.order import Order, OrderItem, OrderStatus
from backend.app.models.user import User
from backend.app.schemas.warehouse import OrderCreate, OrderResponse, OrderUpdate, OrderStatus as OrderStatusSchema, SuggestedStockUpdateRequest
from backend.app.services.audit import log_operation
from backend.app.services.order import (
    create_order as service_create_order,
    get_audit_logs_for_order as service_get_audit_logs_for_order,
    delete_order as service_delete_order,
    get_all_orders as service_get_all_orders,
    get_order as service_get_order,
    ship_order as service_ship_order,
    update_order as service_update_order,
    update_suggested_stock as service_update_suggested_stock,
)
from backend.app.services.picking import get_picking_list

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderResponse])
async def get_all(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    approved: bool | None = None,
    status: OrderStatusSchema | None = None,
    shipping_date: str | None = None,
    shipping_date_from: str | None = None,
    shipping_date_to: str | None = None,
):
    return await service_get_all_orders(
        db,
        approved=approved,
        status=OrderStatus(status) if status is not None else None,
        shipping_date=shipping_date,
        shipping_date_from=shipping_date_from,
        shipping_date_to=shipping_date_to,
    )


@router.get("/{order_id}", response_model=OrderResponse)
async def get_by_id(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await service_get_order(db, order_id)


@router.get("/{order_id}/audit-logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    await service_get_order(db, order_id)
    logs = await service_get_audit_logs_for_order(db, order_id)

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


@router.get("/{order_id}/picking-list")
async def get_picking(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await get_picking_list(db, order_id)


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create(
    order_data: OrderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("create_order"))],
):
    order = await service_create_order(db, order_data)

    await log_operation(
        db,
        operation_type="create_order",
        user_id=current_user.id,
        details={
            "order_id": order.id,
            "order_name": order.name,
            "customer": order.customer,
            "items_count": len(order.items),
        },
    )
    await db.commit()

    asyncio.create_task(
        notify_all(
            "order_created",
            {
                "order_id": order.id,
                "order_name": order.name,
                "customer": order.customer,
                "created_by": current_user.username,
            },
        )
    )
    return order


@router.patch("/{order_id}", response_model=OrderResponse)
async def update(
    order_id: int,
    order_data: OrderUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_order"))],
):
    order_before = await _get_order_model_for_snapshot(db, order_id)
    order_before_snapshot = _snapshot_order(order_before)
    order = await service_update_order(db, order_id, order_data)

    await log_operation(
        db,
        operation_type="update_order",
        user_id=current_user.id,
        details={
            "order_id": order.id,
            "order_name": order.name,
            "before": order_before_snapshot,
            "changes": order_data.model_dump(exclude_unset=True, mode="json"),
        },
    )
    await db.commit()

    asyncio.create_task(
        notify_all(
            "order_updated",
            {
                "order_id": order.id,
                "order_name": order.name,
                "status": order.status,
                "updated_by": current_user.username,
            },
        )
    )
    return order


@router.post("/{order_id}/ship", response_model=OrderResponse)
async def ship(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_order"))],
):
    order = await service_ship_order(db, order_id)

    await log_operation(
        db,
        operation_type="ship_order",
        user_id=current_user.id,
        details={
            "order_id": order.id,
            "order_name": order.name,
            "status": order.status.value if hasattr(order.status, "value") else str(order.status),
            "actual_shipping_date": order.actual_shipping_date.isoformat() if order.actual_shipping_date else None,
        },
    )
    await db.commit()

    asyncio.create_task(
        notify_all(
            "order_shipped",
            {
                "order_id": order.id,
                "order_name": order.name,
                "status": order.status.value if hasattr(order.status, "value") else str(order.status),
                "shipped_by": current_user.username,
            },
        )
    )
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_order"))],
):
    existing_order = await _get_order_model_for_snapshot(db, order_id)
    order_name = existing_order.name if existing_order else f"#{order_id}"

    await log_operation(
        db,
        operation_type="delete_order",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "order_name": order_name,
            "before": _snapshot_order(existing_order) if existing_order else None,
        },
    )
    await service_delete_order(db, order_id)

    asyncio.create_task(
        notify_all(
            "order_deleted",
            {
                "order_id": order_id,
                "order_name": order_name,
                "deleted_by": current_user.username,
            },
        )
    )


@router.patch("/{order_id}/items/{order_item_id}/suggested-stock", response_model=OrderResponse)
async def update_suggested_stock(
    order_id: int,
    order_item_id: int,
    request: SuggestedStockUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_order"))],
):
    return await service_update_suggested_stock(
        db,
        order_id=order_id,
        order_item_id=order_item_id,
        stock_id=request.stock_id,
    )


async def _get_order_model_for_snapshot(db: AsyncSession, order_id: int) -> Order | None:
    return await db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )


def _snapshot_order(order: Order | None) -> dict | None:
    if order is None:
        return None
    return {
        "id": order.id,
        "name": order.name,
        "status": order.status.value if hasattr(order.status, "value") else str(order.status),
        "supplier": order.supplier,
        "customer": order.customer,
        "comment": order.comment,
        "invoice": order.invoice,
        "transport_company": order.transport_company,
        "approved": order.approved,
        "shipping_date": order.shipping_date.isoformat() if order.shipping_date else None,
        "actual_shipping_date": order.actual_shipping_date.isoformat() if order.actual_shipping_date else None,
        "upd_gl": order.upd_gl,
        "priority": order.priority,
        "order_type": order.order_type,
        "is_deleted": order.is_deleted,
        "items": [_snapshot_order_item(item) for item in order.items],
    }


def _snapshot_order_item(item: OrderItem | None) -> dict | None:
    if item is None:
        return None
    return {
        "id": item.id,
        "item_id": item.item_id,
        "pairs_quantity": item.pairs_quantity,
        "picked_pairs": item.picked_pairs,
        "status": item.status.value if hasattr(item.status, "value") else str(item.status),
        "suggested_stock_id": item.suggested_stock_id,
        "item_size": item.item_size,
        "item_color": item.item_color,
        "item_venchik": item.item_venchik,
        "item_name": item.item_name,
    }
