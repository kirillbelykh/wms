from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.order import Order, OrderItem, OrderStatus
from backend.app.models.stock import Stock

RESERVABLE_ORDER_STATUSES = {
    OrderStatus.pending,
    OrderStatus.processing,
    OrderStatus.picking,
    OrderStatus.packed,
    OrderStatus.partially_packed,
    OrderStatus.pick_edited,
    OrderStatus.edited,
    OrderStatus.reformulated,
}


def free_pairs(stock: Stock) -> int:
    return max(stock.pairs_quantity, 0)


def normalize_variant_value(value: str | None) -> str:
    raw_value = str(value or "").strip().replace(",", ".")
    if not raw_value:
        return ""
    try:
        parsed = Decimal(raw_value)
    except InvalidOperation:
        return raw_value.casefold()
    return f"{parsed.quantize(Decimal('0.1')):.1f}"


def variant_values_equal(left: str | None, right: str | None) -> bool:
    return normalize_variant_value(left) == normalize_variant_value(right)


def stock_matches_order_item(stock: Stock, order_item: OrderItem) -> bool:
    if stock.item_id != order_item.item_id:
        return False
    if order_item.item_size and not variant_values_equal(stock.size, order_item.item_size):
        return False
    if order_item.item_color and not variant_values_equal(stock.color, order_item.item_color):
        return False
    if order_item.item_venchik and not variant_values_equal(stock.venchik, order_item.item_venchik):
        return False
    return True


async def assign_best_stock_to_order_item(db: AsyncSession, order_item: OrderItem) -> bool:
    # Сначала ищем по item_id
    candidates = list(
        (
            await db.scalars(
                select(Stock)
                .options(
                    selectinload(Stock.item),
                    selectinload(Stock.cell).selectinload(Cell.warehouse),
                )
                .where(Stock.item_id == order_item.item_id)
                .order_by(Stock.updated_at.desc(), Stock.id.desc())
            )
        ).all()
    )

    remaining_pairs = max(order_item.pairs_quantity - order_item.picked_pairs, 0)
    
    # ✅ Исправленный синтаксис
    matched_candidates = [
        stock
        for stock in candidates
        if stock_matches_order_item(stock, order_item) and free_pairs(stock) > 0
    ]
    
    # ✅ Если не нашли по item_id, пробуем найти по названию и атрибутам
    if not matched_candidates and order_item.item_name:
        # Ищем товары с таким же названием
        items_with_same_name = await db.scalars(
            select(Item).where(
                Item.title == order_item.item_name,
                Item.is_deleted.is_(False)
            )
        )
        item_ids = [item.id for item in items_with_same_name]
        
        if item_ids:
            candidates_by_name = list(
                (
                    await db.scalars(
                        select(Stock)
                        .options(
                            selectinload(Stock.item),
                            selectinload(Stock.cell).selectinload(Cell.warehouse),
                        )
                        .where(Stock.item_id.in_(item_ids))
                        .order_by(Stock.updated_at.desc(), Stock.id.desc())
                    )
                ).all()
            )
            
            # ✅ Исправленный синтаксис здесь тоже
            matched_candidates = [
                stock
                for stock in candidates_by_name
                if variant_values_equal(stock.size, order_item.item_size) and
                   variant_values_equal(stock.color, order_item.item_color) and
                   free_pairs(stock) > 0
            ]
    
    if not matched_candidates:
        order_item.suggested_stock_id = None
        order_item.suggested_stock = None
        return False

    best_stock = max(
        matched_candidates,
        key=lambda stock: (
            free_pairs(stock),
            stock.updated_at or datetime.min,
            stock.id,
        ),
    )
    order_item.suggested_stock_id = best_stock.id
    order_item.suggested_stock = best_stock
    return True


async def suggest_pending_order_items_for_stock(db: AsyncSession, stock: Stock) -> list[int]:
    pending_items = list(
        (
            await db.scalars(
                select(OrderItem)
                .join(Order, Order.id == OrderItem.order_id)
                .options(selectinload(OrderItem.order))
                .where(
                    Order.is_deleted.is_(False),
                    Order.status.in_(RESERVABLE_ORDER_STATUSES),
                    OrderItem.suggested_stock_id.is_(None),
                )
            )
        ).all()
    )

    pending_items.sort(
        key=lambda item: (
            -(item.order.priority if item.order is not None and item.order.priority is not None else 0),
            item.order.shipping_date is None if item.order is not None else True,
            item.order.shipping_date or datetime.max if item.order is not None else datetime.max,
            item.order.created_at or datetime.max if item.order is not None else datetime.max,
            item.id,
        )
    )

    virtual_free_pairs = free_pairs(stock)
    reserved_item_ids: list[int] = []
    for order_item in pending_items:
        if virtual_free_pairs <= 0:
            break
        remaining_pairs = max(order_item.pairs_quantity - order_item.picked_pairs, 0)
        if remaining_pairs <= 0:
            continue
        if not stock_matches_order_item(stock, order_item):
            continue
        order_item.suggested_stock_id = stock.id
        virtual_free_pairs -= remaining_pairs
        reserved_item_ids.append(order_item.id)

    return reserved_item_ids
