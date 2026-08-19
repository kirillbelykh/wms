from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.api.websocket import notify_all
from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.order import Order, OrderItem
from backend.app.models.pick_operation import PickOperation
from backend.app.models.user import User
from backend.app.schemas.warehouse import OrderResponse, PickItemRequest, PickItemResponse, PickOperationResponse, PickOperationUpdate
from backend.app.services.audit import log_operation
from backend.app.services.order import start_order_picking
from backend.app.services.packing import get_grouping_proposal
from backend.app.services.picking import (
    cancel_picking,
    complete_picking,
    delete_pick_operation,
    get_order_pick_operations,
    pick_item as service_pick_item,
    update_pick_operation,
)

router = APIRouter(prefix="/picking", tags=["picking"])


@router.post("/{order_id}/start", response_model=OrderResponse)
async def start_order_picking_endpoint(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("pick_item"))],
):
    order_before = await db.get(Order, order_id)
    previous_status = order_before.status.value if order_before and hasattr(order_before.status, "value") else str(order_before.status) if order_before else None
    result = await start_order_picking(db, order_id)

    await log_operation(
        db,
        operation_type="start_picking",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "previous_status": previous_status,
            "action": "Начало сборки заказа",
        },
    )
    await db.commit()

    asyncio.create_task(
        notify_all(
            "order_status_changed",
            {
                "order_id": order_id,
                "order_name": result.name,
                "status": result.status.value if hasattr(result.status, "value") else str(result.status),
                "changed_by": current_user.username,
            },
        )
    )
    return result


@router.get("/orders/{order_id}/pick-operations", response_model=list[PickOperationResponse])
async def get_order_pick_operations_endpoint(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await get_order_pick_operations(db, order_id)


@router.post("/pick", response_model=PickItemResponse)
async def pick_item(
    pick_data: PickItemRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("pick_item"))],
):
    return await service_pick_item(
        db,
        pick_data.order_item_id,
        pick_data.stock_id,
        pick_data.pairs_quantity,
        current_user.id,
    )


@router.post("/{order_id}/complete")
async def complete_order_picking(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("complete_picking"))],
):
    order_before = await db.get(Order, order_id)
    previous_status = order_before.status.value if order_before and hasattr(order_before.status, "value") else str(order_before.status) if order_before else None
    result = await complete_picking(db, order_id)

    await log_operation(
        db,
        operation_type="complete_picking",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "previous_status": previous_status,
            "action": "Завершение сборки заказа",
        },
    )
    await db.commit()

    order = await db.get(Order, order_id)
    if order:
        asyncio.create_task(
            notify_all(
                "order_status_changed",
                {
                    "order_id": order_id,
                    "order_name": order.name,
                    "status": order.status.value if hasattr(order.status, "value") else str(order.status),
                    "changed_by": current_user.username,
                },
            )
        )

    return result


@router.post("/{order_id}/cancel")
async def cancel_order_picking(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_pick"))],
):
    order_before = await db.scalar(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.pick_operations))
        .where(Order.id == order_id)
    )
    operations_snapshot = []
    if order_before is not None:
        for item in order_before.items:
            for operation in item.pick_operations:
                operations_snapshot.append(_snapshot_pick_operation(operation))
    previous_status = order_before.status.value if order_before and hasattr(order_before.status, "value") else str(order_before.status) if order_before else None
    result = await cancel_picking(db, order_id)
    await log_operation(
        db,
        operation_type="cancel_picking",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "previous_status": previous_status,
            "operations": operations_snapshot,
            "action": "Полный откат отбора",
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "order_status_changed",
            {
                "order_id": order_id,
                "status": "pending",
                "changed_by": current_user.username,
            },
        )
    )
    return result


@router.get("/{order_id}/packing-proposal")
async def packing_proposal(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    proposals = await get_grouping_proposal(db, order_id)
    return {"has_proposals": bool(proposals), "proposals": proposals}


@router.delete("/pick-operations/{operation_id}")
async def delete_pick_operation_endpoint(
    operation_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_pick"))],
):
    operation_before = await db.scalar(
        select(PickOperation)
        .options(selectinload(PickOperation.order_item))
        .where(PickOperation.id == operation_id)
    )
    operation_snapshot = _snapshot_pick_operation(operation_before)
    result = await delete_pick_operation(db, operation_id)
    await log_operation(
        db,
        operation_type="delete_pick",
        user_id=current_user.id,
        stock_id=operation_before.stock_id if operation_before else None,
        item_id=operation_before.item_id if operation_before else None,
        cell_id=operation_before.cell_id if operation_before else None,
        quantity=operation_before.pairs_quantity if operation_before else None,
        details={
            "operation_id": operation_id,
            "operation": operation_snapshot,
            "action": "Удаление операции отбора",
        },
    )
    await db.commit()
    return result


@router.patch("/pick-operations/{operation_id}", response_model=PickOperationResponse)
async def update_pick_operation_endpoint(
    operation_id: int,
    update_data: PickOperationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_pick"))],
):
    operation_before = await db.get(PickOperation, operation_id)
    old_quantity = operation_before.pairs_quantity if operation_before else None
    operation = await update_pick_operation(db, operation_id, update_data.pairs_quantity)
    await log_operation(
        db,
        operation_type="update_pick",
        user_id=current_user.id,
        stock_id=operation.stock_id,
        quantity=update_data.pairs_quantity,
        details={
            "operation_id": operation_id,
            "old_quantity": old_quantity,
            "new_quantity": update_data.pairs_quantity,
            "action": "Изменение операции отбора",
        },
    )
    await db.commit()
    return operation


def _snapshot_pick_operation(operation: PickOperation | None) -> dict | None:
    if operation is None:
        return None
    return {
        "id": operation.id,
        "order_item_id": operation.order_item_id,
        "stock_id": operation.stock_id,
        "cell_id": operation.cell_id,
        "item_id": operation.item_id,
        "pairs_quantity": operation.pairs_quantity,
        "pairs_per_box": operation.pairs_per_box,
        "batch_number": operation.batch_number,
        "size": operation.size,
        "color": operation.color,
        "venchik": operation.venchik,
        "user_id": operation.user_id,
    }
