from __future__ import annotations

import logging
from fastapi import HTTPException
from sqlalchemy import delete, select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.cell import Cell
from backend.app.models.order import Order, OrderItem, OrderItemStatus, OrderStatus
from backend.app.models.pick_operation import PickOperation
from backend.app.models.production import ProductionSupplyRequestItem, ProductionTransfer
from backend.app.models.stock import Stock
from backend.app.schemas.warehouse import PickItemResponse, PickingListItemResponse
from backend.app.services.audit import log_operation
from backend.app.services.order_reservation import assign_best_stock_to_order_item, stock_matches_order_item
from backend.app.services.stock import available_pairs

logger = logging.getLogger(__name__)

ORDER_PICKING_OPTIONS = (
    selectinload(Order.items).selectinload(OrderItem.item),
    selectinload(Order.items)
    .selectinload(OrderItem.suggested_stock)
    .selectinload(Stock.cell)
    .selectinload(Cell.warehouse),
    selectinload(Order.items).selectinload(OrderItem.pick_operations),
)


async def pick_item(
    db: AsyncSession,
    order_item_id: int,
    stock_id: int,
    pairs_quantity: int,
    user_id: int | None = None,
) -> PickItemResponse:
    logger.info(f"🚀 PICK_ITEM CALLED: order_item_id={order_item_id}, stock_id={stock_id}, pairs={pairs_quantity}")
    
    # Получаем order_item с загрузкой связанных данных
    order_item = await db.scalar(
        select(OrderItem)
        .options(
            selectinload(OrderItem.order),
            selectinload(OrderItem.item),
            selectinload(OrderItem.suggested_stock),
        )
        .where(OrderItem.id == order_item_id)
    )
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")

    order = order_item.order
    if order is None or order.is_deleted:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.approved:
        raise HTTPException(status_code=400, detail="Cannot pick an unapproved order")
    if order.status in {OrderStatus.cancelled, OrderStatus.delivered, OrderStatus.shipped}:
        raise HTTPException(status_code=400, detail="Picking is not available for the current order status")

    # Проверяем остаток
    stock = await db.get(Stock, stock_id)
    if stock is None:
        raise HTTPException(status_code=404, detail=f"Stock {stock_id} not found or already deleted")
    
    logger.info(f"📦 Stock found: id={stock.id}, pairs_quantity={stock.pairs_quantity}")
    
    if pairs_quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if not stock_matches_order_item(stock, order_item):
        raise HTTPException(status_code=400, detail="Selected stock does not match the order item")

    remaining_to_pick = order_item.pairs_quantity - order_item.picked_pairs
    if pairs_quantity > remaining_to_pick:
        raise HTTPException(
            status_code=400,
            detail=f"Requested quantity exceeds remaining quantity ({remaining_to_pick})",
        )
    
    if pairs_quantity > stock.pairs_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {stock.pairs_quantity}, requested: {pairs_quantity}",
        )

    new_quantity = stock.pairs_quantity - pairs_quantity
    logger.info(f"🔄 New quantity: {new_quantity}")
    will_delete_stock = new_quantity <= 0
    
    # ✅ 1. Логируем операцию ДО удаления stock (пока он еще существует в БД)
    audit_log = await log_operation(
        db=db,
        operation_type="pick",
        user_id=user_id,
        item_id=stock.item_id,
        stock_id=None if will_delete_stock else stock.id,
        cell_id=stock.cell_id,
        quantity=pairs_quantity,
        details={
            "order_id": order.id,
            "order_name": order.name,
            "order_item_id": order_item.id,
            "source_stock_id": stock.id,
            "batch": stock.batch_number,
            "pairs_per_box": stock.pairs_per_box,
            "size": stock.size,
            "color": stock.color,
            "venchik": stock.venchik,
            "action": "Отбор товара для заказа"
        }
    )
    
    # ✅ 2. Создаем PickOperation
    pick_operation = PickOperation(
        order_item_id=order_item.id,
        stock_id=None if will_delete_stock else stock.id,
        cell_id=stock.cell_id,
        item_id=stock.item_id,
        pairs_quantity=pairs_quantity,
        pairs_per_box=stock.pairs_per_box,
        batch_number=stock.batch_number,
        size=stock.size,
        color=stock.color,
        venchik=stock.venchik,
        user_id=user_id,
    )
    db.add(pick_operation)
    await db.flush()
    audit_details = dict(audit_log.details or {})
    audit_details["operation_id"] = pick_operation.id
    audit_log.details = audit_details
    
    if will_delete_stock:
        logger.info(f"🔴 DELETING STOCK {stock.id}")
        
        # ✅ 3. Очищаем ссылку в order_items
        await db.execute(
            update(OrderItem)
            .where(OrderItem.suggested_stock_id == stock.id)
            .values(suggested_stock_id=None)
        )
        
        # ✅ 4. Обновляем order_item
        order_item.picked_pairs += pairs_quantity
        order_item.suggested_stock_id = None
        order_item.suggested_stock = None
        order_item.status = (
            OrderItemStatus.picked
            if order_item.picked_pairs == order_item.pairs_quantity
            else OrderItemStatus.picking
        )
        
        # ✅ 5. Удаляем остаток (stock_id в PickOperation автоматически станет NULL)
        await db.delete(stock)
        logger.info(f"   ✅ Deleted stock {stock.id}")
        
    else:
        # ✅ Обновляем количество остатка
        stock.pairs_quantity = new_quantity
        stock.reserved_pairs = 0
        
        # ✅ Обновляем order_item со ссылкой на остаток
        order_item.picked_pairs += pairs_quantity
        order_item.suggested_stock_id = stock_id
        order_item.suggested_stock = stock
        order_item.status = (
            OrderItemStatus.picked
            if order_item.picked_pairs == order_item.pairs_quantity
            else OrderItemStatus.picking
        )
    
    order.status = OrderStatus.picking
    await db.commit()
    logger.info(f"✅ COMMIT completed for order_item {order_item_id}")

    return PickItemResponse(
        order_item_id=order_item_id,
        picked_pairs=order_item.picked_pairs,
        remaining_to_pick=order_item.pairs_quantity - order_item.picked_pairs,
        stock_remaining=0 if will_delete_stock else new_quantity,
        is_completed=order_item.picked_pairs == order_item.pairs_quantity,
    )

async def get_picking_list(db: AsyncSession, order_id: int) -> list[PickingListItemResponse]:
    order = await db.scalar(
        select(Order)
        .options(*ORDER_PICKING_OPTIONS)
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    result: list[PickingListItemResponse] = []
    for item in order.items:
        if item.status == OrderItemStatus.cancelled:
            continue

        suggested_stock = item.suggested_stock
        if item.picked_pairs < item.pairs_quantity and (
            suggested_stock is None
            or not stock_matches_order_item(suggested_stock, item)
            or suggested_stock.pairs_quantity <= 0
        ):
            await assign_best_stock_to_order_item(db, item)
            suggested_stock = item.suggested_stock

        suggested_cell_location = _format_suggested_cell_location(suggested_stock)

        result.append(
            PickingListItemResponse(
                order_item_id=item.id,
                item_id=item.item_id,
                item_name=item.item.title if item.item else f"Товар #{item.item_id}",
                item_size=item.item_size or (item.item.size if item.item else None),
                item_color=item.item_color or (item.item.color if item.item else None),
                item_venchik=item.item_venchik,
                batch_number=suggested_stock.batch_number if suggested_stock else None,
                pairs_required=max(item.pairs_quantity - item.picked_pairs, 0),
                picked_pairs=item.picked_pairs,
                suggested_cell_location=suggested_cell_location,
                suggested_stock_id=item.suggested_stock_id,
                available_pairs=suggested_stock.pairs_quantity if suggested_stock else 0,
                waiting_for_production=suggested_stock is None and item.picked_pairs < item.pairs_quantity,
            )
        )

    return result


async def complete_picking(db: AsyncSession, order_id: int) -> dict[str, object]:
    order = await db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    picked_pairs = sum(item.picked_pairs for item in order.items)
    total_pairs = sum(item.pairs_quantity for item in order.items)
    if picked_pairs <= 0:
        raise HTTPException(status_code=400, detail="Cannot complete picking without picked items")

    remaining_items = [item for item in order.items if item.picked_pairs < item.pairs_quantity]
    if remaining_items:
        order.status = OrderStatus.partially_packed
        await db.commit()
        return {
            "message": "Picking partially completed",
            "order_id": order_id,
            "status": OrderStatus.partially_packed,
            "picked_pairs": picked_pairs,
            "total_pairs": total_pairs,
        }

    if any(item.status != OrderItemStatus.picked for item in order.items):
        raise HTTPException(
            status_code=400,
            detail="Picking is not completed yet",
        )

    order.status = OrderStatus.packed
    await db.commit()
    return {
        "message": "Picking completed",
        "order_id": order_id,
        "status": OrderStatus.packed,
        "picked_pairs": picked_pairs,
        "total_pairs": total_pairs,
    }


async def cancel_picking(db: AsyncSession, order_id: int) -> dict[str, str]:
    order = await db.scalar(
        select(Order)
        .options(*ORDER_PICKING_OPTIONS)
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in {OrderStatus.shipped, OrderStatus.delivered}:
        raise HTTPException(status_code=400, detail="Cannot cancel picking for shipped or delivered orders")

    operations = [
        operation
        for item in order.items
        for operation in item.pick_operations
    ]
    for operation in operations:
        restored_stock = await _restore_operation_stock(db, operation)
        order_item = next((item for item in order.items if item.id == operation.order_item_id), None)
        if order_item is not None:
            order_item.suggested_stock_id = restored_stock.id
        await db.delete(operation)

    for item in order.items:
        item.picked_pairs = 0
        item.status = OrderItemStatus.pending

    order.status = OrderStatus.pending
    await db.commit()
    return {"message": "Picking cancelled"}


async def get_order_pick_operations(db: AsyncSession, order_id: int) -> list[PickOperation]:
    return list(
        (
            await db.scalars(
                select(PickOperation)
                .join(OrderItem, PickOperation.order_item_id == OrderItem.id)
                .where(OrderItem.order_id == order_id)
                .order_by(PickOperation.picked_at.desc(), PickOperation.id.desc())
            )
        ).all()
    )


async def delete_pick_operation(db: AsyncSession, operation_id: int) -> dict[str, str]:
    operation = await db.scalar(
        select(PickOperation)
        .options(selectinload(PickOperation.order_item))
        .where(PickOperation.id == operation_id)
    )
    if operation is None:
        raise HTTPException(status_code=404, detail="Pick operation not found")

    order_item = operation.order_item
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")

    restored_stock = await _restore_operation_stock(db, operation)
    order_item.suggested_stock_id = restored_stock.id
    order_item.picked_pairs = max(order_item.picked_pairs - operation.pairs_quantity, 0)
    order_item.status = (
        OrderItemStatus.pending if order_item.picked_pairs == 0 else OrderItemStatus.picking
    )

    order = await db.get(Order, order_item.order_id)
    if order is not None:
        order_with_items = await db.scalar(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_item.order_id)
        )
        if order_with_items is not None and all(item.picked_pairs == 0 for item in order_with_items.items):
            order.status = OrderStatus.pending
        else:
            order.status = OrderStatus.pick_edited

    await db.delete(operation)
    await db.commit()
    return {"message": "Operation deleted"}


async def update_pick_operation(
    db: AsyncSession,
    operation_id: int,
    pairs_quantity: int,
) -> PickOperation:
    operation = await db.scalar(
        select(PickOperation)
        .options(selectinload(PickOperation.order_item))
        .where(PickOperation.id == operation_id)
    )
    if operation is None:
        raise HTTPException(status_code=404, detail="Pick operation not found")
    if pairs_quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    order_item = operation.order_item
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")

    diff = pairs_quantity - operation.pairs_quantity
    if diff == 0:
        return operation

    stock = await _restore_target_stock(db, operation)
    order_item.suggested_stock_id = stock.id
    if diff > 0:
        if diff > stock.pairs_quantity:
            raise HTTPException(status_code=400, detail="Not enough stock")
        if order_item.picked_pairs + diff > order_item.pairs_quantity:
            raise HTTPException(status_code=400, detail="Invalid quantity")
        stock.pairs_quantity -= diff
        stock.reserved_pairs = 0
        order_item.picked_pairs += diff
    else:
        returned_pairs = abs(diff)
        stock.pairs_quantity += returned_pairs
        stock.reserved_pairs = 0
        order_item.picked_pairs -= returned_pairs

    operation.pairs_quantity = pairs_quantity
    order_item.status = (
        OrderItemStatus.picked
        if order_item.picked_pairs == order_item.pairs_quantity
        else OrderItemStatus.picking if order_item.picked_pairs > 0 else OrderItemStatus.pending
    )

    order = await db.get(Order, order_item.order_id)
    if order is not None:
        order.status = OrderStatus.pick_edited

    await db.commit()
    await db.refresh(operation)
    return operation


async def _restore_operation_stock(db: AsyncSession, operation: PickOperation) -> Stock:
    stock = await _restore_target_stock(db, operation)
    stock.pairs_quantity += operation.pairs_quantity
    stock.reserved_pairs = 0
    return stock


async def _restore_target_stock(db: AsyncSession, operation: PickOperation) -> Stock:
    stock = await db.get(Stock, operation.stock_id) if operation.stock_id is not None else None
    if stock is not None:
        return stock

    if operation.cell_id is None or operation.item_id is None:
        raise HTTPException(status_code=400, detail="Cannot restore stock without source cell and item")

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


def _format_suggested_cell_location(stock: Stock | None) -> str | None:
    if stock is None or stock.cell is None:
        return None

    coord = f"{stock.cell.rack}-{stock.cell.tier}-{stock.cell.cell}"
    warehouse_name = stock.cell.warehouse.name if stock.cell.warehouse is not None else None
    if warehouse_name:
        return f"{warehouse_name} - {coord}"
    return coord
