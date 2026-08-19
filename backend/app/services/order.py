from __future__ import annotations

from datetime import date, datetime, time

from fastapi import HTTPException
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import raise_obj_not_found
from backend.app.core.time import to_msk_naive, utc_now
from backend.app.models.audit import AuditLog
from backend.app.models.cell import Cell
from backend.app.models.chz import ChzRequest, ChzRequestStatus
from backend.app.models.item import Item
from backend.app.models.order import Order, OrderItem, OrderItemStatus, OrderStatus
from backend.app.models.stock import Stock
from backend.app.schemas.warehouse import (
    ChzRequestResponse,
    OrderCreate,
    OrderItemCreate,
    OrderItemResponse,
    OrderResponse,
    OrderUpdate,
)
from backend.app.services.order_reservation import assign_best_stock_to_order_item, stock_matches_order_item
from backend.app.services.stock import available_pairs

ORDER_LOAD_OPTIONS = (
    selectinload(Order.items).selectinload(OrderItem.item),
    selectinload(Order.items)
    .selectinload(OrderItem.suggested_stock)
    .selectinload(Stock.cell)
    .selectinload(Cell.warehouse),
    selectinload(Order.chz_requests).selectinload(ChzRequest.items),
    selectinload(Order.chz_requests).selectinload(ChzRequest.order),
    selectinload(Order.chz_requests).selectinload(ChzRequest.requested_by),
)


async def create_order(db: AsyncSession, order_data: OrderCreate) -> OrderResponse:
    order = Order(
        name=order_data.name,
        order_type=order_data.order_type,
        priority=order_data.priority,
        customer=order_data.customer,
        supplier=order_data.supplier,
        comment=order_data.comment,
        invoice=order_data.invoice,
        transport_company=order_data.transport_company,
        approved=order_data.approved,
        shipping_date=to_msk_naive(order_data.shipping_date),
        status=OrderStatus.pending,
    )
    db.add(order)
    await db.flush()

    for item_data in order_data.items:
        db.add(await _build_order_item(db, order.id, item_data))

    await db.commit()
    return await get_order(db, order.id)


async def get_order(db: AsyncSession, order_id: int) -> OrderResponse:
    order = await _get_order_or_404(db, order_id)
    await _refresh_order_suggestions(db, [order])
    return _serialize_order(order)


async def get_all_orders(
    db: AsyncSession,
    *,
    approved: bool | None = None,
    status: OrderStatus | None = None,
    shipping_date: str | None = None,
    shipping_date_from: str | None = None,
    shipping_date_to: str | None = None,
) -> list[OrderResponse]:
    query = (
        select(Order)
        .options(*ORDER_LOAD_OPTIONS)
        .where(Order.is_deleted.is_(False))
        .order_by(Order.created_at.desc())
    )
    if approved is not None:
        query = query.where(Order.approved.is_(approved))
    if status is not None:
        query = query.where(Order.status == status)
    if shipping_date:
        start, end = _msk_naive_day_bounds(date.fromisoformat(shipping_date))
        query = query.where(Order.shipping_date >= start, Order.shipping_date <= end)
    else:
        if shipping_date_from:
            start, _ = _msk_naive_day_bounds(date.fromisoformat(shipping_date_from))
            query = query.where(Order.shipping_date >= start)
        if shipping_date_to:
            _, end = _msk_naive_day_bounds(date.fromisoformat(shipping_date_to))
            query = query.where(Order.shipping_date <= end)

    orders = list((await db.scalars(query)).all())
    await _refresh_order_suggestions(db, orders)
    return [_serialize_order(order) for order in orders]


async def update_order(db: AsyncSession, order_id: int, order_data: OrderUpdate) -> OrderResponse:
    order = await _get_order_or_404(db, order_id)
    if order.status in {OrderStatus.shipped, OrderStatus.delivered}:
        raise HTTPException(status_code=400, detail="Shipped orders cannot be edited")

    payload = order_data.model_dump(exclude_unset=True)
    items_payload = payload.pop("items", None)

    if payload.get("status") is not None:
        _validate_order_status_transition(order, payload["status"], approved_override=payload.get("approved"))

    for field_name, field_value in payload.items():
        if field_value is not None:
            if field_name in {"shipping_date", "actual_shipping_date"}:
                field_value = to_msk_naive(field_value)
            if field_name == "status" and field_value == OrderStatus.shipped and payload.get("actual_shipping_date") is None:
                order.actual_shipping_date = to_msk_naive(utc_now())
            setattr(order, field_name, field_value)

    if items_payload is not None:
        if any(item.picked_pairs > 0 for item in order.items):
            raise HTTPException(
                status_code=400,
                detail="Cannot replace order items after picking has started",
            )

        for existing_item in order.items:
            existing_item.suggested_stock_id = None

        order.items.clear()
        await db.flush()

        for item_payload in items_payload:
            normalized_payload = OrderItemCreate.model_validate(item_payload)
            order.items.append(await _build_order_item(db, order.id, normalized_payload))
        order.status = OrderStatus.edited

    await db.commit()
    return await get_order(db, order_id)


async def start_order_picking(db: AsyncSession, order_id: int) -> OrderResponse:
    order = await _get_order_or_404(db, order_id)
    _validate_order_status_transition(order, OrderStatus.picking)
    if order.status != OrderStatus.picking:
        order.status = OrderStatus.picking
        await db.commit()
    return await get_order(db, order_id)


async def ship_order(db: AsyncSession, order_id: int) -> OrderResponse:
    order = await _get_order_or_404(db, order_id)
    _validate_order_status_transition(order, OrderStatus.shipped)

    order.status = OrderStatus.shipped
    order.actual_shipping_date = to_msk_naive(utc_now())

    await db.commit()
    return await get_order(db, order_id)


async def get_audit_logs_for_order(db: AsyncSession, order_id: int) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.details['order_id'].cast(String) == str(order_id))
        .order_by(AuditLog.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_order(db: AsyncSession, order_id: int) -> Order:
    order = await _get_order_or_404(db, order_id)
    if order.status in {OrderStatus.shipped, OrderStatus.delivered}:
        raise HTTPException(status_code=400, detail="Shipped orders cannot be cancelled")
    if any(item.picked_pairs > 0 for item in order.items):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete an order after picking has started. Cancel picking first.",
        )

    for item in order.items:
        item.suggested_stock_id = None

    for chz_request in order.chz_requests:
        chz_request.is_active = False
        chz_request.status = ChzRequestStatus.cancelled

    order.is_deleted = True
    await db.commit()
    return order


async def update_suggested_stock(
    db: AsyncSession,
    *,
    order_id: int,
    order_item_id: int,
    stock_id: int,
) -> OrderResponse:
    order = await _get_order_or_404(db, order_id)
    order_item = next((item for item in order.items if item.id == order_item_id), None)
    if order_item is None:
        raise HTTPException(status_code=404, detail="Order item not found")

    new_stock = await _get_stock_for_order(db, stock_id)

    if order_item.suggested_stock_id == new_stock.id:
        return _serialize_order(order)

    if not stock_matches_order_item(new_stock, order_item):
        raise HTTPException(status_code=400, detail="Selected stock does not match the order item")
    if available_pairs(new_stock) <= 0:
        raise HTTPException(status_code=400, detail="Selected stock is empty")

    order_item.suggested_stock_id = new_stock.id
    order_item.item_size = new_stock.size or (new_stock.item.size if new_stock.item else None)
    order_item.item_color = new_stock.color or (new_stock.item.color if new_stock.item else None)
    order_item.item_venchik = new_stock.venchik

    await db.commit()
    return await get_order(db, order_id)


async def _get_order_or_404(db: AsyncSession, order_id: int) -> Order:
    order = await db.scalar(
        select(Order)
        .options(*ORDER_LOAD_OPTIONS)
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise_obj_not_found("Order")
    return order


async def _get_stock_for_order(db: AsyncSession, stock_id: int) -> Stock:
    stock = await db.scalar(
        select(Stock)
        .options(selectinload(Stock.item), selectinload(Stock.cell).selectinload(Cell.warehouse))
        .where(Stock.id == stock_id)
    )
    if stock is None:
        raise HTTPException(status_code=404, detail=f"Stock with id {stock_id} not found")
    return stock


async def _get_item_for_order(db: AsyncSession, item_id: int) -> Item:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Item with id {item_id} not found")
    return item


async def _get_or_create_item_by_title(
    db: AsyncSession, 
    title: str, 
    inventory_type: str = "finished_goods"
) -> Item:
    """
    Найти или создать товар ТОЛЬКО по названию (без учета размера/цвета).
    Это для справочника номенклатуры.
    """
    # Ищем существующий товар по названию (без учета атрибутов)
    existing = await db.scalar(
        select(Item).where(
            Item.title == title,
            Item.is_deleted.is_(False)
        )
    )
    if existing:
        return existing
    
    # Если не найден - создаем новый БЕЗ атрибутов
    new_item = Item(
        title=title,
        name=title,
        product_type="finished_goods",
        size="",  # Пусто, атрибуты будут в остатках
        color="",  # Пусто, атрибуты будут в остатках
        inventory_type=inventory_type,
        max_pairs_per_box=100,
    )
    db.add(new_item)
    await db.flush()
    return new_item


async def _build_order_item(db: AsyncSession, order_id: int, item_data: OrderItemCreate) -> OrderItem:
    # Если указан конкретный остаток
    if item_data.stock_id is not None:
        stock = await _get_stock_for_order(db, item_data.stock_id)
        if available_pairs(stock) < item_data.pairs_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock. Available: {available_pairs(stock)}, requested: {item_data.pairs_quantity}",
            )
        return OrderItem(
            order_id=order_id,
            item_id=stock.item_id,
            pairs_quantity=item_data.pairs_quantity,
            picked_pairs=0,
            status=OrderItemStatus.pending,
            suggested_stock_id=stock.id,
            item_size=stock.size or (stock.item.size if stock.item else None),
            item_color=stock.color or (stock.item.color if stock.item else None),
            item_venchik=stock.venchik,
            item_name=stock.item.title if stock.item else None,
        )

    # Если указан существующий товар
    if item_data.item_id is not None:
        item = await _get_item_for_order(db, item_data.item_id)
        order_item = OrderItem(
            order_id=order_id,
            item_id=item.id,
            pairs_quantity=item_data.pairs_quantity,
            picked_pairs=0,
            status=OrderItemStatus.pending,
            suggested_stock_id=None,
            item_size=item.size,
            item_color=item.color,
            item_venchik=None,
            item_name=item.title,
        )
        await assign_best_stock_to_order_item(db, order_item)
        return order_item

    # ✅ НОВАЯ ЛОГИКА: создание товара только по названию (без атрибутов)
    if item_data.item_title:
        # Ищем или создаем товар ТОЛЬКО по названию
        item = await _get_or_create_item_by_title(db, item_data.item_title, "finished_goods")
        
        order_item = OrderItem(
            order_id=order_id,
            item_id=item.id,
            pairs_quantity=item_data.pairs_quantity,
            picked_pairs=0,
            status=OrderItemStatus.pending,
            suggested_stock_id=None,
            item_size=item_data.item_size or "",  # Сохраняем размер в позиции заказа
            item_color=item_data.item_color or "",  # Сохраняем цвет в позиции заказа
            item_venchik=None,
            item_name=item.title,
        )
        await assign_best_stock_to_order_item(db, order_item)
        return order_item

    raise HTTPException(status_code=400, detail="Invalid item data: either stock_id, item_id, or item_title must be provided")


async def _refresh_order_suggestions(db: AsyncSession, orders: list[Order]) -> None:
    changed = False
    for order in orders:
        for order_item in order.items:
            remaining_pairs = max(order_item.pairs_quantity - order_item.picked_pairs, 0)
            if remaining_pairs <= 0:
                continue

            suggested_stock = order_item.suggested_stock
            if suggested_stock is not None and stock_matches_order_item(suggested_stock, order_item) and suggested_stock.pairs_quantity > 0:
                continue

            previous_stock_id = order_item.suggested_stock_id
            assigned = await assign_best_stock_to_order_item(db, order_item)
            if not assigned:
                order_item.suggested_stock_id = None
            if order_item.suggested_stock_id != previous_stock_id:
                changed = True

    if changed:
        await db.commit()


def _validate_order_status_transition(
    order: Order,
    new_status: OrderStatus,
    *,
    approved_override: bool | None = None,
) -> None:
    is_approved = approved_override if approved_override is not None else order.approved
    if new_status == OrderStatus.picking and not is_approved:
        raise HTTPException(status_code=400, detail="Cannot start picking for an unapproved order")
    if new_status == OrderStatus.shipped and order.status not in {OrderStatus.packed, OrderStatus.partially_packed}:
        raise HTTPException(status_code=400, detail="Only picked orders can be shipped")


def _serialize_order(order: Order) -> OrderResponse:
    total_pairs = 0
    items: list[OrderItemResponse] = []

    for item in order.items:
        total_pairs += item.pairs_quantity
        suggested_stock = item.suggested_stock
        suggested_cell_location = _format_suggested_cell_location(suggested_stock)

        items.append(
            OrderItemResponse(
                id=item.id,
                order_id=item.order_id,
                item_id=item.item_id,
                item_name=item.item.title if item.item else f"Товар #{item.item_id}",
                item_size=item.item_size or (item.item.size if item.item else None),
                item_color=item.item_color or (item.item.color if item.item else None),
                item_venchik=item.item_venchik,
                batch_number=suggested_stock.batch_number if suggested_stock else None,
                pairs_quantity=item.pairs_quantity,
                picked_pairs=item.picked_pairs,
                status=item.status,
                suggested_stock_id=item.suggested_stock_id,
                suggested_cell_location=suggested_cell_location,
                waiting_for_production=suggested_stock is None and item.picked_pairs < item.pairs_quantity,
            )
        )

    active_chz_request = _get_active_chz_request(order)
    latest_chz_request = _get_latest_chz_request(order)
    return OrderResponse(
        id=order.id,
        name=order.name,
        order_type=order.order_type,
        priority=order.priority,
        status=order.status,
        supplier=order.supplier,
        customer=order.customer,
        comment=order.comment,
        invoice=order.invoice,
        transport_company=order.transport_company,
        approved=order.approved,
        shipping_date=order.shipping_date,
        actual_shipping_date=order.actual_shipping_date,
        upd_gl=order.upd_gl,
        items=items,
        total_pairs=total_pairs,
        requires_chz=active_chz_request is not None and active_chz_request.status != ChzRequestStatus.ready,
        active_chz_request=_serialize_chz_request(latest_chz_request) if latest_chz_request else None,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _get_active_chz_request(order: Order) -> ChzRequest | None:
    active_requests = [
        request
        for request in order.chz_requests
        if request.is_active and request.status != ChzRequestStatus.cancelled
    ]
    if not active_requests:
        return None
    return sorted(active_requests, key=lambda request: request.requested_at, reverse=True)[0]


def _get_latest_chz_request(order: Order) -> ChzRequest | None:
    visible_requests = [
        request
        for request in order.chz_requests
        if request.status != ChzRequestStatus.cancelled
    ]
    if not visible_requests:
        return None
    return sorted(visible_requests, key=lambda request: request.requested_at, reverse=True)[0]


def _serialize_chz_request(request: ChzRequest) -> ChzRequestResponse:
    return ChzRequestResponse.model_validate(request)


def _msk_naive_day_bounds(value: date) -> tuple[datetime, datetime]:
    start = datetime.combine(value, time.min)
    end = datetime.combine(value, time.max)
    return start, end


def _format_suggested_cell_location(stock: Stock | None) -> str | None:
    if stock is None or stock.cell is None:
        return None

    coord = f"{stock.cell.rack}-{stock.cell.tier}-{stock.cell.cell}"
    warehouse_name = stock.cell.warehouse.name if stock.cell.warehouse is not None else None
    if warehouse_name:
        return f"{warehouse_name} - {coord}"
    return coord
