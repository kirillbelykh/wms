from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.time import utc_now_naive
from backend.app.models.audit import AuditLog
from backend.app.models.cell import Cell
from backend.app.models.chz import ChzRequest, ChzRequestStatus, ManualChzRequest
from backend.app.models.order import Order, OrderItem, OrderItemStatus, OrderStatus
from backend.app.models.pick_operation import PickOperation
from backend.app.models.production import (
    ProductionChzRequest,
    ProductionChzStatus,
    ProductionOrder,
    ProductionOrderItem,
    ProductionOrderStatus,
    ProductionSupplyRequest,
    ProductionSupplyRequestItem,
    ProductionSupplyStatus,
    ProductionTransfer,
)
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse
from backend.app.services.audit import log_operation
from backend.app.services.stock import available_pairs, move_stock, withdraw_stock

ROLLBACKABLE_OPERATION_TYPES = {
    "cancel_picking",
    "complete_picking",
    "replenish",
    "withdraw",
    "stock_withdraw",
    "delete_pick",
    "delete_order",
    "delete_production_order",
    "delete_stock",
    "update_order",
    "update_pick",
    "update_production_item_batch_date",
    "update_production_item_progress",
    "update_production_order",
    "update_stock",
    "update_suggested_stock",
    "pick",
    "move",
    "create_chz_request",
    "create_manual_chz_request",
    "create_order",
    "create_production_chz_request",
    "create_production_order",
    "create_production_receipt_request",
    "create_production_supply_request",
    "create_production_supply_request_auto",
    "ship_order",
    "mark_chz_ready",
    "complete_production",
    "start_production",
    "start_production_supply_request",
    "fulfill_production_supply_request",
    "transfer_production_to_stock",
}


def can_rollback_log(log: AuditLog) -> bool:
    details = log.details or {}
    return (
        log.operation_type in ROLLBACKABLE_OPERATION_TYPES
        and not bool(details.get("_rolled_back_at"))
        and _has_required_rollback_data(log)
    )


def _has_required_rollback_data(log: AuditLog) -> bool:
    details = log.details or {}
    operation_type = log.operation_type
    if operation_type in {"update_order", "update_production_order", "start_production", "complete_production", "fulfill_production_supply_request"}:
        return isinstance(details.get("before"), dict)
    if operation_type == "cancel_picking":
        return isinstance(details.get("operations"), list)
    if operation_type == "delete_pick":
        return isinstance(details.get("operation"), dict)
    if operation_type == "update_pick":
        return isinstance(details.get("operation_id"), int) and isinstance(details.get("old_quantity"), int)
    if operation_type in {"create_production_supply_request", "create_production_supply_request_auto", "create_production_receipt_request", "start_production_supply_request"}:
        return isinstance(details.get("supply_request_id"), int)
    if operation_type == "update_production_item_batch_date":
        return isinstance(details.get("production_order_item_id"), int) and isinstance(details.get("before"), dict)
    if operation_type == "delete_production_order":
        return isinstance(details.get("before"), dict)
    return True


async def rollback_audit_log(
    db: AsyncSession,
    *,
    log_id: int,
    user_id: int | None,
) -> AuditLog:
    log = await db.scalar(select(AuditLog).where(AuditLog.id == log_id))
    if log is None:
        raise HTTPException(status_code=404, detail="History record not found")
    if not can_rollback_log(log):
        raise HTTPException(status_code=400, detail="Rollback is not available for this operation")

    if log.operation_type == "replenish":
        await _rollback_replenish(db, log)
    elif log.operation_type in {"stock_withdraw", "withdraw"}:
        await _rollback_stock_withdraw(db, log)
    elif log.operation_type == "move":
        await _rollback_move(db, log)
    elif log.operation_type == "update_stock":
        await _rollback_update_stock(db, log)
    elif log.operation_type == "delete_stock":
        await _rollback_delete_stock(db, log)
    elif log.operation_type == "create_order":
        await _rollback_create_order(db, log)
    elif log.operation_type == "delete_order":
        await _rollback_delete_order(db, log)
    elif log.operation_type == "update_order":
        await _rollback_update_order(db, log)
    elif log.operation_type == "update_suggested_stock":
        await _rollback_update_suggested_stock(db, log)
    elif log.operation_type == "pick":
        await _rollback_pick(db, log)
    elif log.operation_type == "complete_picking":
        await _rollback_complete_picking(db, log)
    elif log.operation_type == "cancel_picking":
        await _rollback_cancel_picking(db, log)
    elif log.operation_type == "delete_pick":
        await _rollback_delete_pick(db, log)
    elif log.operation_type == "update_pick":
        await _rollback_update_pick(db, log)
    elif log.operation_type == "create_chz_request":
        await _rollback_create_chz_request(db, log)
    elif log.operation_type == "create_manual_chz_request":
        await _rollback_create_manual_chz_request(db, log)
    elif log.operation_type == "mark_chz_ready":
        await _rollback_mark_chz_ready(db, log)
    elif log.operation_type == "create_production_order":
        await _rollback_create_production_order(db, log)
    elif log.operation_type == "delete_production_order":
        await _rollback_delete_production_order(db, log)
    elif log.operation_type == "update_production_order":
        await _rollback_update_production_order(db, log)
    elif log.operation_type == "update_production_item_progress":
        await _rollback_update_production_item_progress(db, log)
    elif log.operation_type == "update_production_item_batch_date":
        await _rollback_update_production_item_batch_date(db, log)
    elif log.operation_type in {"create_production_supply_request", "create_production_supply_request_auto", "create_production_receipt_request"}:
        await _rollback_create_production_supply_request(db, log)
    elif log.operation_type == "start_production_supply_request":
        await _rollback_start_production_supply_request(db, log)
    elif log.operation_type == "fulfill_production_supply_request":
        await _rollback_fulfill_production_supply_request(db, log)
    elif log.operation_type == "start_production":
        await _rollback_start_production(db, log)
    elif log.operation_type == "ship_order":
        await _rollback_ship_order(db, log)
    elif log.operation_type == "complete_production":
        await _rollback_complete_production(db, log)
    elif log.operation_type == "transfer_production_to_stock":
        await _rollback_transfer_production_to_stock(db, log)
    elif log.operation_type == "create_production_chz_request":
        await _rollback_create_production_chz_request(db, log)
    else:
        raise HTTPException(status_code=400, detail="Rollback is not supported for this operation")

    details = dict(log.details or {})
    details["_rolled_back_at"] = utc_now_naive().isoformat()
    details["_rolled_back_by_user_id"] = user_id
    log.details = details

    await log_operation(
        db,
        operation_type="rollback_operation",
        user_id=user_id,
        item_id=log.item_id,
        stock_id=log.stock_id,
        cell_id=log.cell_id,
        warehouse_id=log.warehouse_id,
        quantity=log.quantity,
        details={
            "target_log_id": log.id,
            "target_operation_type": log.operation_type,
            "order_name": (log.details or {}).get("order_name"),
        },
    )
    await db.commit()
    await db.refresh(log)
    return log


async def _rollback_replenish(db: AsyncSession, log: AuditLog) -> None:
    stock = await _locate_stock_for_log(db, log, prefer_current_stock=True)
    if stock is None:
        raise HTTPException(status_code=404, detail="Stock for rollback was not found")
    quantity = int(log.quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Rollback quantity is invalid")
    if quantity > available_pairs(stock):
        raise HTTPException(status_code=400, detail="Current stock is not enough to rollback the replenishment")
    await withdraw_stock(db, stock.id, quantity, user_id=None)


async def _rollback_stock_withdraw(db: AsyncSession, log: AuditLog) -> None:
    quantity = int(log.quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Rollback quantity is invalid")
    details = log.details or {}
    stock = await _locate_stock_for_log(db, log, prefer_current_stock=True)
    if stock is None:
        if log.item_id is None or log.cell_id is None:
            raise HTTPException(status_code=400, detail="Source location is missing for rollback")
        stock = Stock(
            item_id=log.item_id,
            cell_id=log.cell_id,
            pairs_quantity=0,
            reserved_pairs=0,
            pairs_per_box=details.get("pairs_per_box"),
            batch_number=details.get("batch_number"),
            size=details.get("size"),
            color=details.get("color"),
            venchik=details.get("venchik"),
        )
        db.add(stock)
        await db.flush()
    stock.pairs_quantity += quantity
    stock.reserved_pairs = 0


async def _rollback_update_stock(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    old_quantity = details.get("old_quantity")
    if not isinstance(old_quantity, int):
        raise HTTPException(status_code=400, detail="Previous stock quantity is missing for rollback")
    stock = await _locate_stock_for_log(db, log, prefer_current_stock=True)
    if stock is None:
        if log.item_id is None or log.cell_id is None:
            raise HTTPException(status_code=400, detail="Stock location is missing for rollback")
        stock = Stock(
            item_id=log.item_id,
            cell_id=log.cell_id,
            pairs_quantity=0,
            reserved_pairs=0,
        )
        db.add(stock)
        await db.flush()
    stock.pairs_quantity = old_quantity
    stock.reserved_pairs = 0


async def _rollback_delete_stock(db: AsyncSession, log: AuditLog) -> None:
    quantity = int(log.quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Deleted stock quantity is missing for rollback")
    stock = await _locate_stock_for_log(db, log, prefer_current_stock=True)
    if stock is not None:
        stock.pairs_quantity += quantity
        stock.reserved_pairs = 0
        return
    if log.item_id is None or log.cell_id is None:
        raise HTTPException(status_code=400, detail="Deleted stock location is missing for rollback")
    details = log.details or {}
    stock = Stock(
        item_id=log.item_id,
        cell_id=log.cell_id,
        pairs_quantity=quantity,
        reserved_pairs=0,
        pairs_per_box=details.get("pairs_per_box"),
        batch_number=details.get("batch_number") or details.get("batch"),
        size=details.get("size"),
        color=details.get("color"),
        venchik=details.get("venchik"),
        inventory_type=details.get("inventory_type") or "finished_goods",
        manufacturer=details.get("manufacturer"),
    )
    db.add(stock)


async def _rollback_move(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    to_cell_id = details.get("to_cell_id")
    from_cell_id = details.get("from_cell_id")
    if not isinstance(to_cell_id, int) or not isinstance(from_cell_id, int):
        raise HTTPException(status_code=400, detail="Move route is missing for rollback")
    destination_stock = await _locate_stock_for_log(
        db,
        log,
        prefer_current_stock=True,
        cell_id=to_cell_id,
    )
    if destination_stock is None:
        raise HTTPException(status_code=404, detail="Destination stock for rollback was not found")
    quantity = int(log.quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Rollback quantity is invalid")
    if quantity > destination_stock.pairs_quantity:
        raise HTTPException(status_code=400, detail="Current destination stock is not enough to rollback the move")
    await move_stock(db, destination_stock.id, from_cell_id, quantity, user_id=None)


async def _rollback_ship_order(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    order_id = details.get("order_id")
    if not isinstance(order_id, int):
        raise HTTPException(status_code=400, detail="Order id is missing for rollback")
    order = await db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.shipped:
        raise HTTPException(status_code=400, detail="Order is no longer in shipped status")

    total_pairs = sum(item.pairs_quantity for item in order.items)
    picked_pairs = sum(item.picked_pairs for item in order.items)
    order.status = OrderStatus.packed if picked_pairs >= total_pairs else OrderStatus.partially_packed
    order.actual_shipping_date = None


async def _rollback_create_order(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_order_for_rollback(db, log)
    if order.status == OrderStatus.shipped:
        raise HTTPException(status_code=400, detail="Cannot rollback creation of a shipped order")
    if any(item.picked_pairs > 0 for item in order.items):
        raise HTTPException(status_code=400, detail="Cannot rollback order creation after picking has started")
    for item in order.items:
        item.suggested_stock_id = None
    for request in order.chz_requests:
        request.is_active = False
        request.status = ChzRequestStatus.cancelled
    order.is_deleted = True


async def _rollback_delete_order(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    order_id = details.get("order_id")
    if not isinstance(order_id, int):
        raise HTTPException(status_code=400, detail="Order id is missing for rollback")
    order = await db.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.chz_requests))
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order was permanently removed and cannot be restored")
    order.is_deleted = False
    before = details.get("before")
    if isinstance(before, dict):
        _restore_order_scalars(order, before)


async def _rollback_update_order(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_order_for_rollback(db, log)
    before = (log.details or {}).get("before")
    if not isinstance(before, dict):
        raise HTTPException(status_code=400, detail="Previous order state is missing for rollback")
    if any(item.picked_pairs > 0 for item in order.items):
        raise HTTPException(status_code=400, detail="Cannot rollback order edit after picking has started")
    _restore_order_scalars(order, before)
    before_items = before.get("items")
    if isinstance(before_items, list):
        order.items.clear()
        await db.flush()
        for item_data in before_items:
            if not isinstance(item_data, dict):
                continue
            order.items.append(_build_order_item_from_snapshot(order.id, item_data))


async def _rollback_update_suggested_stock(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    order_item_id = details.get("order_item_id")
    if not isinstance(order_item_id, int):
        raise HTTPException(status_code=400, detail="Order item id is missing for rollback")
    order_item = await db.get(OrderItem, order_item_id)
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")
    old_stock_id = details.get("old_stock_id")
    order_item.suggested_stock_id = old_stock_id if isinstance(old_stock_id, int) else None
    before = details.get("before")
    if isinstance(before, dict):
        order_item.item_size = before.get("item_size")
        order_item.item_color = before.get("item_color")
        order_item.item_venchik = before.get("item_venchik")


async def _rollback_pick(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    order_item_id = details.get("order_item_id")
    if not isinstance(order_item_id, int):
        raise HTTPException(status_code=400, detail="Order item id is missing for rollback")
    operation_id = details.get("operation_id")
    operation: PickOperation | None = None
    if isinstance(operation_id, int):
        operation = await _get_pick_operation(db, operation_id)
    if operation is None:
        operation = await _find_pick_operation_for_log(db, log, order_item_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Pick operation for rollback was not found")
    await _delete_pick_operation_without_commit(db, operation)


async def _rollback_complete_picking(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_order_for_rollback(db, log)
    previous_status = (log.details or {}).get("previous_status")
    if isinstance(previous_status, str) and previous_status in OrderStatus._value2member_map_:
        order.status = OrderStatus(previous_status)
    elif any(item.picked_pairs > 0 for item in order.items):
        order.status = OrderStatus.picking
    else:
        order.status = OrderStatus.pending


async def _rollback_cancel_picking(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    operations = details.get("operations")
    if not isinstance(operations, list):
        raise HTTPException(status_code=400, detail="Pick operation snapshot is missing for rollback")
    order = await _get_order_for_rollback(db, log)
    for operation_data in operations:
        if isinstance(operation_data, dict):
            await _apply_pick_snapshot(db, operation_data)
    previous_status = details.get("previous_status")
    if isinstance(previous_status, str) and previous_status in OrderStatus._value2member_map_:
        order.status = OrderStatus(previous_status)


async def _rollback_delete_pick(db: AsyncSession, log: AuditLog) -> None:
    operation_data = (log.details or {}).get("operation")
    if not isinstance(operation_data, dict):
        raise HTTPException(status_code=400, detail="Deleted pick operation snapshot is missing for rollback")
    await _apply_pick_snapshot(db, operation_data)


async def _rollback_update_pick(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    operation_id = details.get("operation_id")
    old_quantity = details.get("old_quantity")
    if not isinstance(operation_id, int) or not isinstance(old_quantity, int):
        raise HTTPException(status_code=400, detail="Pick operation rollback data is missing")
    operation = await _get_pick_operation(db, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Pick operation not found")
    await _set_pick_operation_quantity(db, operation, old_quantity)


async def _rollback_create_chz_request(db: AsyncSession, log: AuditLog) -> None:
    request_id = (log.details or {}).get("request_id")
    if not isinstance(request_id, int):
        raise HTTPException(status_code=400, detail="CHZ request id is missing for rollback")
    request = await db.get(ChzRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="CHZ request not found")
    request.is_active = False
    request.status = ChzRequestStatus.cancelled


async def _rollback_create_manual_chz_request(db: AsyncSession, log: AuditLog) -> None:
    request_id = (log.details or {}).get("request_id")
    if not isinstance(request_id, int):
        raise HTTPException(status_code=400, detail="Manual CHZ request id is missing for rollback")
    request = await db.get(ManualChzRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Manual CHZ request not found")
    request.is_active = False
    request.status = ChzRequestStatus.cancelled


async def _rollback_mark_chz_ready(db: AsyncSession, log: AuditLog) -> None:
    request_id = (log.details or {}).get("request_id")
    if not isinstance(request_id, int):
        raise HTTPException(status_code=400, detail="CHZ request id is missing for rollback")
    request = await db.get(ChzRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="CHZ request not found")
    previous_status = (log.details or {}).get("previous_status")
    request.status = ChzRequestStatus(previous_status) if isinstance(previous_status, str) and previous_status in ChzRequestStatus._value2member_map_ else ChzRequestStatus.requested
    request.ready_at = None
    request.is_active = True


async def _rollback_complete_production(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    production_order_id = details.get("production_order_id")
    if not isinstance(production_order_id, int):
        raise HTTPException(status_code=400, detail="Production order id is missing for rollback")
    order = await db.scalar(
        select(ProductionOrder)
        .options(
            selectinload(ProductionOrder.items),
            selectinload(ProductionOrder.supply_requests)
            .selectinload(ProductionSupplyRequest.items)
            .selectinload(ProductionSupplyRequestItem.production_order_item),
        )
        .where(ProductionOrder.id == production_order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status not in {ProductionOrderStatus.completed, ProductionOrderStatus.transferred, ProductionOrderStatus.partially_transferred}:
        raise HTTPException(status_code=400, detail="Production order is not in a completed state")

    before = details.get("before")
    if isinstance(before, dict):
        await _restore_production_supply_state(db, order, before)

    all_transferred = bool(order.items) and all(item.transferred_pairs >= item.produced_pairs for item in order.items)
    any_transferred = any(item.transferred_pairs > 0 for item in order.items)
    if all_transferred:
        order.status = ProductionOrderStatus.transferred
    elif any_transferred:
        order.status = ProductionOrderStatus.partially_transferred
    else:
        order.status = ProductionOrderStatus.in_progress


async def _rollback_create_production_order(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_production_order_for_rollback(db, log)
    if any(item.produced_pairs > 0 or item.transferred_pairs > 0 for item in order.items):
        raise HTTPException(status_code=400, detail="Cannot rollback production order creation after production has started")
    if any(request.items for request in order.supply_requests) or order.chz_requests:
        raise HTTPException(status_code=400, detail="Cannot rollback production order creation with dependent requests")
    await db.delete(order)


async def _rollback_delete_production_order(db: AsyncSession, log: AuditLog) -> None:
    snapshot = (log.details or {}).get("before")
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=400, detail="Deleted production order snapshot is missing for rollback")
    order = ProductionOrder(
        name=str(snapshot.get("name") or "Восстановленное производство"),
        status=ProductionOrderStatus(snapshot.get("status") or ProductionOrderStatus.pending.value),
        priority=int(snapshot.get("priority") or 5),
        comment=snapshot.get("comment"),
        related_order_id=snapshot.get("related_order_id"),
        batch_number=snapshot.get("batch_number"),
        production_date=_parse_date(snapshot.get("production_date")),
        created_by_user_id=snapshot.get("created_by_user_id"),
        brigadier_user_id=snapshot.get("brigadier_user_id"),
    )
    db.add(order)
    await db.flush()
    for item_data in snapshot.get("items") or []:
        if not isinstance(item_data, dict):
            continue
        db.add(
            ProductionOrderItem(
                production_order_id=order.id,
                item_id=int(item_data["item_id"]),
                pairs_quantity=int(item_data.get("pairs_quantity") or 0),
                produced_pairs=int(item_data.get("produced_pairs") or 0),
                transferred_pairs=int(item_data.get("transferred_pairs") or 0),
                item_size=item_data.get("item_size"),
                item_color=item_data.get("item_color"),
                batch_number=item_data.get("batch_number"),
                production_date=_parse_date(item_data.get("production_date")),
            )
        )


async def _rollback_update_production_order(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_production_order_for_rollback(db, log)
    before = (log.details or {}).get("before")
    if not isinstance(before, dict):
        raise HTTPException(status_code=400, detail="Previous production order state is missing for rollback")
    for field in ("name", "priority", "comment", "related_order_id", "batch_number", "production_date", "status", "brigadier_user_id"):
        if field in before:
            value = before[field]
            if field == "status" and isinstance(value, str):
                value = ProductionOrderStatus(value)
            if field == "production_date":
                value = _parse_date(value)
            setattr(order, field, value)


async def _rollback_update_production_item_progress(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    item_id = details.get("production_order_item_id")
    old_quantity = details.get("old_quantity")
    if not isinstance(item_id, int) or not isinstance(old_quantity, int):
        raise HTTPException(status_code=400, detail="Production item rollback data is missing")
    item = await db.get(ProductionOrderItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    if old_quantity < item.transferred_pairs:
        raise HTTPException(status_code=400, detail="Cannot rollback produced quantity below transferred quantity")
    item.produced_pairs = old_quantity
    order = await db.get(ProductionOrder, item.production_order_id)
    if order is not None and order.status == ProductionOrderStatus.completed:
        order.status = ProductionOrderStatus.in_progress


async def _rollback_update_production_item_batch_date(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    item_id = details.get("production_order_item_id")
    if not isinstance(item_id, int):
        raise HTTPException(status_code=400, detail="Production item id is missing")
    item = await db.get(ProductionOrderItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    before = details.get("before")
    item.batch_number = before.get("batch_number") if isinstance(before, dict) else None
    item.production_date = _parse_date(before.get("production_date")) if isinstance(before, dict) else None


async def _rollback_create_production_supply_request(db: AsyncSession, log: AuditLog) -> None:
    request_id = (log.details or {}).get("supply_request_id")
    if not isinstance(request_id, int):
        raise HTTPException(status_code=400, detail="Production supply request id is missing for rollback")
    request = await db.scalar(
        select(ProductionSupplyRequest)
        .options(selectinload(ProductionSupplyRequest.items))
        .where(ProductionSupplyRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Production supply request not found")
    if any(item.fulfilled_quantity > 0 for item in request.items):
        raise HTTPException(status_code=400, detail="Cannot rollback a fulfilled production supply request")
    await db.delete(request)


async def _rollback_start_production_supply_request(db: AsyncSession, log: AuditLog) -> None:
    request = await _get_supply_request_for_rollback(db, log)
    if any(item.fulfilled_quantity > 0 for item in request.items):
        raise HTTPException(status_code=400, detail="Cannot rollback started request after fulfillment")
    request.status = ProductionSupplyStatus.requested


async def _rollback_fulfill_production_supply_request(db: AsyncSession, log: AuditLog) -> None:
    snapshot = (log.details or {}).get("before")
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=400, detail="Supply fulfillment snapshot is missing for rollback")
    request = await _get_supply_request_for_rollback(db, log)
    await _restore_supply_fulfillment_effects(db, request, snapshot)
    item_snapshots = {
        item["id"]: item
        for item in snapshot.get("items", [])
        if isinstance(item, dict) and isinstance(item.get("id"), int)
    }
    for item in request.items:
        before_item = item_snapshots.get(item.id)
        if before_item is None:
            continue
        item.fulfilled_quantity = int(before_item.get("fulfilled_quantity") or 0)
        item.consumed_quantity = int(before_item.get("consumed_quantity") or 0)
        item.selected_stock_id = before_item.get("selected_stock_id")
        item.selected_cell_id = before_item.get("selected_cell_id")
    previous_status = snapshot.get("status")
    request.status = ProductionSupplyStatus(previous_status) if isinstance(previous_status, str) else ProductionSupplyStatus.requested


async def _rollback_start_production(db: AsyncSession, log: AuditLog) -> None:
    order = await _get_production_order_for_rollback(db, log)
    before = (log.details or {}).get("before")
    if isinstance(before, dict):
        order.status = ProductionOrderStatus(before.get("status") or ProductionOrderStatus.ready_to_work.value)
        order.batch_number = before.get("batch_number")
        order.production_date = _parse_date(before.get("production_date"))
        order.brigadier_user_id = before.get("brigadier_user_id")
        item_snapshots = {
            item["id"]: item
            for item in before.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("id"), int)
        }
        for item in order.items:
            before_item = item_snapshots.get(item.id)
            if before_item is None:
                continue
            item.batch_number = before_item.get("batch_number")
            item.production_date = _parse_date(before_item.get("production_date"))
    else:
        order.status = ProductionOrderStatus.ready_to_work
        order.batch_number = None
        order.production_date = None
        order.brigadier_user_id = None


async def _rollback_transfer_production_to_stock(db: AsyncSession, log: AuditLog) -> None:
    details = log.details or {}
    production_order_item_id = details.get("production_order_item_id")
    quantity = details.get("pairs_quantity") or log.quantity
    if not isinstance(production_order_item_id, int) or not isinstance(quantity, int):
        raise HTTPException(status_code=400, detail="Production transfer rollback data is missing")
    transfer_id = details.get("transfer_id")
    transfer: ProductionTransfer | None = await db.get(ProductionTransfer, transfer_id) if isinstance(transfer_id, int) else None
    if transfer is None:
        transfer = await db.scalar(
            select(ProductionTransfer)
            .where(
                ProductionTransfer.production_order_item_id == production_order_item_id,
                ProductionTransfer.pairs_quantity == quantity,
            )
            .order_by(ProductionTransfer.transferred_at.desc(), ProductionTransfer.id.desc())
        )
    if transfer is None:
        raise HTTPException(status_code=404, detail="Production transfer was not found")
    stock = await db.get(Stock, transfer.stock_id) if transfer.stock_id is not None else None
    if stock is None:
        raise HTTPException(status_code=404, detail="Transferred stock was not found")
    if stock.pairs_quantity < quantity:
        raise HTTPException(status_code=400, detail="Current stock is not enough to rollback production transfer")
    stock.pairs_quantity -= quantity
    item = await db.get(ProductionOrderItem, production_order_item_id)
    if item is not None:
        item.transferred_pairs = max(item.transferred_pairs - quantity, 0)
    await db.delete(transfer)


async def _rollback_create_production_chz_request(db: AsyncSession, log: AuditLog) -> None:
    request_id = (log.details or {}).get("request_id")
    request: ProductionChzRequest | None = await db.get(ProductionChzRequest, request_id) if isinstance(request_id, int) else None
    if request is None:
        production_order_id = (log.details or {}).get("production_order_id")
        if isinstance(production_order_id, int):
            request = await db.scalar(
                select(ProductionChzRequest)
                .where(ProductionChzRequest.production_order_id == production_order_id)
                .order_by(ProductionChzRequest.requested_at.desc(), ProductionChzRequest.id.desc())
            )
    if request is None:
        raise HTTPException(status_code=404, detail="Production CHZ request not found")
    request.is_active = False
    request.status = ProductionChzStatus.cancelled


async def _get_order_for_rollback(db: AsyncSession, log: AuditLog) -> Order:
    details = log.details or {}
    order_id = details.get("order_id")
    if not isinstance(order_id, int):
        raise HTTPException(status_code=400, detail="Order id is missing for rollback")
    order = await db.scalar(
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.chz_requests),
        )
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _parse_datetime(value: object) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value)
    return None


def _parse_date(value: object) -> date | None:
    if value is None or isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return date.fromisoformat(value[:10])
    return None


def _restore_order_scalars(order: Order, snapshot: dict) -> None:
    for field in (
        "name",
        "status",
        "supplier",
        "customer",
        "comment",
        "invoice",
        "transport_company",
        "approved",
        "shipping_date",
        "actual_shipping_date",
        "upd_gl",
        "priority",
        "order_type",
    ):
        if field not in snapshot:
            continue
        value = snapshot[field]
        if field == "status" and isinstance(value, str):
            value = OrderStatus(value)
        if field in {"shipping_date", "actual_shipping_date"}:
            value = _parse_datetime(value)
        setattr(order, field, value)


def _build_order_item_from_snapshot(order_id: int, snapshot: dict) -> OrderItem:
    return OrderItem(
        order_id=order_id,
        item_id=int(snapshot["item_id"]),
        pairs_quantity=int(snapshot.get("pairs_quantity") or 0),
        picked_pairs=int(snapshot.get("picked_pairs") or 0),
        status=OrderItemStatus(snapshot.get("status") or OrderItemStatus.pending.value),
        suggested_stock_id=snapshot.get("suggested_stock_id"),
        item_size=snapshot.get("item_size"),
        item_color=snapshot.get("item_color"),
        item_venchik=snapshot.get("item_venchik"),
        item_name=snapshot.get("item_name"),
    )


async def _get_pick_operation(db: AsyncSession, operation_id: int) -> PickOperation | None:
    return await db.scalar(
        select(PickOperation)
        .options(selectinload(PickOperation.order_item))
        .where(PickOperation.id == operation_id)
    )


async def _find_pick_operation_for_log(
    db: AsyncSession,
    log: AuditLog,
    order_item_id: int,
) -> PickOperation | None:
    details = log.details or {}
    source_stock_id = details.get("source_stock_id")
    query = (
        select(PickOperation)
        .options(selectinload(PickOperation.order_item))
        .where(
            PickOperation.order_item_id == order_item_id,
            PickOperation.pairs_quantity == int(log.quantity or 0),
        )
        .order_by(PickOperation.picked_at.desc(), PickOperation.id.desc())
    )
    if isinstance(source_stock_id, int):
        query = query.where((PickOperation.stock_id == source_stock_id) | (PickOperation.stock_id.is_(None)))
    return await db.scalar(query)


async def _delete_pick_operation_without_commit(db: AsyncSession, operation: PickOperation) -> None:
    order_item = operation.order_item or await db.get(OrderItem, operation.order_item_id)
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")
    stock = await _restore_stock_for_pick_operation(db, operation)
    stock.pairs_quantity += operation.pairs_quantity
    stock.reserved_pairs = 0
    order_item.suggested_stock_id = stock.id
    order_item.picked_pairs = max(order_item.picked_pairs - operation.pairs_quantity, 0)
    order_item.status = (
        OrderItemStatus.pending
        if order_item.picked_pairs == 0
        else OrderItemStatus.picked
        if order_item.picked_pairs >= order_item.pairs_quantity
        else OrderItemStatus.picking
    )
    order = await db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order_item.order_id))
    if order is not None:
        order.status = OrderStatus.pending if all(item.picked_pairs == 0 for item in order.items) else OrderStatus.pick_edited
    await db.delete(operation)


async def _restore_stock_for_pick_operation(db: AsyncSession, operation: PickOperation) -> Stock:
    stock = await db.get(Stock, operation.stock_id) if operation.stock_id is not None else None
    if stock is not None:
        return stock
    if operation.cell_id is None or operation.item_id is None:
        raise HTTPException(status_code=400, detail="Pick operation lacks stock restore data")
    stock = Stock(
        item_id=operation.item_id,
        cell_id=operation.cell_id,
        pairs_quantity=0,
        reserved_pairs=0,
        pairs_per_box=operation.pairs_per_box,
        batch_number=operation.batch_number,
        size=operation.size,
        color=operation.color,
        venchik=operation.venchik,
    )
    db.add(stock)
    await db.flush()
    operation.stock_id = stock.id
    return stock


async def _apply_pick_snapshot(db: AsyncSession, snapshot: dict) -> None:
    order_item_id = snapshot.get("order_item_id")
    quantity = snapshot.get("pairs_quantity")
    if not isinstance(order_item_id, int) or not isinstance(quantity, int):
        raise HTTPException(status_code=400, detail="Pick operation snapshot is invalid")
    order_item = await db.get(OrderItem, order_item_id)
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")
    operation = PickOperation(
        order_item_id=order_item_id,
        stock_id=snapshot.get("stock_id"),
        cell_id=snapshot.get("cell_id"),
        item_id=snapshot.get("item_id"),
        pairs_quantity=quantity,
        pairs_per_box=snapshot.get("pairs_per_box"),
        batch_number=snapshot.get("batch_number"),
        size=snapshot.get("size"),
        color=snapshot.get("color"),
        venchik=snapshot.get("venchik"),
        user_id=snapshot.get("user_id"),
    )
    stock = await _restore_stock_for_pick_operation(db, operation)
    if stock.pairs_quantity < quantity:
        raise HTTPException(status_code=400, detail="Current stock is not enough to restore pick operation")
    stock.pairs_quantity -= quantity
    stock.reserved_pairs = 0
    db.add(operation)
    order_item.picked_pairs += quantity
    order_item.suggested_stock_id = stock.id
    order_item.status = (
        OrderItemStatus.picked
        if order_item.picked_pairs >= order_item.pairs_quantity
        else OrderItemStatus.picking
    )
    order = await db.get(Order, order_item.order_id)
    if order is not None:
        order.status = OrderStatus.picking


async def _set_pick_operation_quantity(db: AsyncSession, operation: PickOperation, pairs_quantity: int) -> None:
    if pairs_quantity <= 0:
        raise HTTPException(status_code=400, detail="Rollback pick quantity must be positive")
    order_item = operation.order_item or await db.get(OrderItem, operation.order_item_id)
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")
    diff = pairs_quantity - operation.pairs_quantity
    if diff == 0:
        return
    stock = await _restore_stock_for_pick_operation(db, operation)
    if diff > 0:
        if stock.pairs_quantity < diff:
            raise HTTPException(status_code=400, detail="Current stock is not enough to rollback pick edit")
        stock.pairs_quantity -= diff
        order_item.picked_pairs += diff
    else:
        returned = abs(diff)
        stock.pairs_quantity += returned
        order_item.picked_pairs = max(order_item.picked_pairs - returned, 0)
    stock.reserved_pairs = 0
    operation.pairs_quantity = pairs_quantity
    order_item.status = (
        OrderItemStatus.pending
        if order_item.picked_pairs == 0
        else OrderItemStatus.picked
        if order_item.picked_pairs >= order_item.pairs_quantity
        else OrderItemStatus.picking
    )


async def _get_production_order_for_rollback(db: AsyncSession, log: AuditLog) -> ProductionOrder:
    production_order_id = (log.details or {}).get("production_order_id")
    if not isinstance(production_order_id, int):
        raise HTTPException(status_code=400, detail="Production order id is missing for rollback")
    order = await db.scalar(
        select(ProductionOrder)
        .options(
            selectinload(ProductionOrder.items),
            selectinload(ProductionOrder.supply_requests).selectinload(ProductionSupplyRequest.items),
            selectinload(ProductionOrder.chz_requests),
        )
        .where(ProductionOrder.id == production_order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


async def _get_supply_request_for_rollback(db: AsyncSession, log: AuditLog) -> ProductionSupplyRequest:
    supply_request_id = (log.details or {}).get("supply_request_id")
    if not isinstance(supply_request_id, int):
        raise HTTPException(status_code=400, detail="Production supply request id is missing")
    request = await db.scalar(
        select(ProductionSupplyRequest)
        .options(
            selectinload(ProductionSupplyRequest.items)
            .selectinload(ProductionSupplyRequestItem.production_order_item)
        )
        .where(ProductionSupplyRequest.id == supply_request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Production supply request not found")
    return request


async def _restore_production_supply_state(
    db: AsyncSession,
    order: ProductionOrder,
    snapshot: dict,
) -> None:
    request_snapshots = {
        request["id"]: request
        for request in snapshot.get("supply_requests", [])
        if isinstance(request, dict) and isinstance(request.get("id"), int)
    }
    for request in order.supply_requests:
        request_snapshot = request_snapshots.get(request.id)
        if request_snapshot is None:
            continue
        await _restore_supply_fulfillment_effects(db, request, request_snapshot)
        item_snapshots = {
            item["id"]: item
            for item in request_snapshot.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("id"), int)
        }
        for item in request.items:
            before_item = item_snapshots.get(item.id)
            if before_item is None:
                continue
            item.fulfilled_quantity = int(before_item.get("fulfilled_quantity") or 0)
            item.consumed_quantity = int(before_item.get("consumed_quantity") or 0)
            item.selected_stock_id = before_item.get("selected_stock_id")
            item.selected_cell_id = before_item.get("selected_cell_id")
        previous_status = request_snapshot.get("status")
        if isinstance(previous_status, str):
            request.status = ProductionSupplyStatus(previous_status)


async def _restore_supply_fulfillment_effects(
    db: AsyncSession,
    request: ProductionSupplyRequest,
    snapshot: dict,
) -> None:
    item_snapshots = {
        item["id"]: item
        for item in snapshot.get("items", [])
        if isinstance(item, dict) and isinstance(item.get("id"), int)
    }
    for item in request.items:
        before_item = item_snapshots.get(item.id)
        if before_item is None:
            continue
        fulfilled_delta = item.fulfilled_quantity - int(before_item.get("fulfilled_quantity") or 0)
        consumed_delta = item.consumed_quantity - int(before_item.get("consumed_quantity") or 0)
        if fulfilled_delta > 0:
            await _reverse_supply_fulfillment_delta(db, request, item, fulfilled_delta)
        if consumed_delta > 0:
            await _add_stock_to_production_cell(db, request_item=item, quantity=consumed_delta, inventory_type="consumable")


async def _reverse_supply_fulfillment_delta(
    db: AsyncSession,
    request: ProductionSupplyRequest,
    request_item,
    quantity: int,
) -> None:
    request_type = request.request_type.value if hasattr(request.request_type, "value") else str(request.request_type)
    if request_type == "finished_goods_receipt":
        await _reverse_finished_goods_receipt(db, request_item, quantity)
        return

    await _remove_stock_from_production_cell(
        db,
        request_item=request_item,
        quantity=quantity,
        inventory_type=request_type,
    )
    source_cell_id = request_item.selected_cell_id
    if source_cell_id is None:
        raise HTTPException(status_code=400, detail="Source cell is missing for supply fulfillment rollback")
    stock = await _get_or_create_matching_stock(
        db,
        cell_id=source_cell_id,
        item_id=request_item.item_id,
        inventory_type=request_type,
        size=request_item.size,
        manufacturer=request_item.manufacturer,
    )
    stock.pairs_quantity += quantity
    stock.reserved_pairs = 0


async def _reverse_finished_goods_receipt(db: AsyncSession, request_item, quantity: int) -> None:
    if request_item.selected_cell_id is None:
        raise HTTPException(status_code=400, detail="Receipt cell is missing for rollback")
    stock = await _find_matching_stock(
        db,
        cell_id=request_item.selected_cell_id,
        item_id=request_item.item_id,
        inventory_type="finished_goods",
        size=request_item.size,
        manufacturer=None,
    )
    if stock is None or stock.pairs_quantity < quantity:
        raise HTTPException(status_code=400, detail="Finished goods stock is not enough to rollback receipt")
    stock.pairs_quantity -= quantity
    production_item = request_item.production_order_item
    if production_item is not None:
        production_item.transferred_pairs = max(production_item.transferred_pairs - quantity, 0)


async def _add_stock_to_production_cell(
    db: AsyncSession,
    *,
    request_item,
    quantity: int,
    inventory_type: str,
) -> None:
    production_cell = await _get_or_create_production_cell_for_rollback(db)
    stock = await _get_or_create_matching_stock(
        db,
        cell_id=production_cell.id,
        item_id=request_item.item_id,
        inventory_type=inventory_type,
        size=request_item.size,
        manufacturer=request_item.manufacturer,
    )
    stock.pairs_quantity += quantity
    stock.reserved_pairs = 0


async def _remove_stock_from_production_cell(
    db: AsyncSession,
    *,
    request_item,
    quantity: int,
    inventory_type: str,
) -> None:
    production_cell = await _get_or_create_production_cell_for_rollback(db)
    stock = await _find_matching_stock(
        db,
        cell_id=production_cell.id,
        item_id=request_item.item_id,
        inventory_type=inventory_type,
        size=request_item.size,
        manufacturer=request_item.manufacturer,
    )
    if stock is None or stock.pairs_quantity < quantity:
        raise HTTPException(status_code=400, detail="Production cell stock is not enough for rollback")
    stock.pairs_quantity -= quantity
    stock.reserved_pairs = 0


async def _get_or_create_production_cell_for_rollback(db: AsyncSession) -> Cell:
    warehouse = await db.scalar(select(Warehouse).where(Warehouse.name == "Производство"))
    if warehouse is None:
        warehouse = Warehouse(name="Производство")
        db.add(warehouse)
        await db.flush()
    cell = await db.scalar(
        select(Cell).where(
            Cell.warehouse_id == warehouse.id,
            Cell.rack == 0,
            Cell.tier == 0,
            Cell.cell == 0,
            Cell.is_deleted.is_(False),
        )
    )
    if cell is None:
        cell = Cell(warehouse_id=warehouse.id, rack=0, tier=0, cell=0)
        db.add(cell)
        await db.flush()
    return cell


async def _get_or_create_matching_stock(
    db: AsyncSession,
    *,
    cell_id: int,
    item_id: int,
    inventory_type: str,
    size: str | None,
    manufacturer: str | None,
) -> Stock:
    stock = await _find_matching_stock(
        db,
        cell_id=cell_id,
        item_id=item_id,
        inventory_type=inventory_type,
        size=size,
        manufacturer=manufacturer,
    )
    if stock is not None:
        return stock
    stock = Stock(
        item_id=item_id,
        cell_id=cell_id,
        pairs_quantity=0,
        reserved_pairs=0,
        size=size,
        inventory_type=inventory_type,
        manufacturer=manufacturer,
    )
    db.add(stock)
    await db.flush()
    return stock


async def _find_matching_stock(
    db: AsyncSession,
    *,
    cell_id: int,
    item_id: int,
    inventory_type: str,
    size: str | None,
    manufacturer: str | None,
) -> Stock | None:
    return await db.scalar(
        select(Stock).where(
            Stock.cell_id == cell_id,
            Stock.item_id == item_id,
            Stock.inventory_type == inventory_type,
            Stock.size == size,
            Stock.manufacturer == manufacturer,
        )
    )


async def _locate_stock_for_log(
    db: AsyncSession,
    log: AuditLog,
    *,
    prefer_current_stock: bool,
    cell_id: int | None = None,
) -> Stock | None:
    details = log.details or {}
    stock_id = log.stock_id if prefer_current_stock else None
    source_stock_id = details.get("source_stock_id")
    if isinstance(stock_id, int):
        stock = await db.get(Stock, stock_id)
        if stock is not None:
            return stock
    if isinstance(source_stock_id, int):
        stock = await db.get(Stock, source_stock_id)
        if stock is not None:
            return stock

    target_cell_id = cell_id if cell_id is not None else log.cell_id
    if log.item_id is None or target_cell_id is None:
        return None

    candidates = list(
        (
            await db.scalars(
                select(Stock).where(
                    Stock.item_id == log.item_id,
                    Stock.cell_id == target_cell_id,
                )
            )
        ).all()
    )
    batch_number = details.get("batch_number") or details.get("batch")
    size = details.get("size")
    color = details.get("color")
    venchik = details.get("venchik")
    for stock in candidates:
        if stock.batch_number != batch_number:
            continue
        if stock.size != size:
            continue
        if stock.color != color:
            continue
        if stock.venchik != venchik:
            continue
        return stock
    return candidates[0] if candidates else None
