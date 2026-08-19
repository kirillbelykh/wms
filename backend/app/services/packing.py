from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.packing_rules import normalize_item_title, resolve_pairs_per_box
from backend.app.models.order import OrderItem, OrderItemStatus


async def get_grouping_proposal(db: AsyncSession, order_id: int) -> list[dict]:
    """Получить предложения по группировке для заказа."""
    items = list(
        (
            await db.scalars(
                select(OrderItem)
                .options(
                    selectinload(OrderItem.item),
                    selectinload(OrderItem.suggested_stock),
                )
                .where(
                    OrderItem.order_id == order_id,
                    OrderItem.status != OrderItemStatus.cancelled,
                    OrderItem.pairs_quantity > OrderItem.picked_pairs,  # Только неотобранные позиции
                )
                .order_by(OrderItem.id)
            )
        ).all()
    )
    if not items:
        return []

    # Группируем по названию товара (без учета размера и партии)
    grouped: dict[str, list[OrderItem]] = defaultdict(list)
    for item in items:
        item_title = item.item.title if item.item else f"Товар #{item.item_id}"
        grouped[normalize_item_title(item_title)].append(item)

    proposals: list[dict] = []
    group_number = 1

    for group_items in grouped.values():
        first_item = group_items[0]
        item_title = first_item.item.title if first_item.item else f"Товар #{first_item.item_id}"
        capacity = resolve_pairs_per_box(item_title, first_item.item.max_pairs_per_box if first_item.item else None)

        _, leftovers = _split_into_full_boxes_and_leftovers(group_items, capacity)
        if not leftovers:
            continue

        total_leftover_pairs = sum(item["pairs_quantity"] for item in leftovers)
        if total_leftover_pairs <= capacity and len(leftovers) > 1:
            proposals.append(
                _proposal_payload(
                    group_number=group_number,
                    item_title=item_title,
                    color=None,
                    total_pairs=total_leftover_pairs,
                    items=leftovers,
                    is_mixed=True,
                )
            )
            group_number += 1
            continue

        if total_leftover_pairs > capacity and len(leftovers) > 1:
            grouped_leftovers = _group_leftovers_into_boxes(leftovers, capacity)
            for box in grouped_leftovers:
                if len(box) <= 1:
                    continue
                proposals.append(
                    _proposal_payload(
                        group_number=group_number,
                        item_title=item_title,
                        color=None,
                        total_pairs=sum(item["pairs_quantity"] for item in box),
                        items=box,
                        is_mixed=True,
                    )
                )
                group_number += 1

    return proposals


def _order_item_info(order_item: OrderItem) -> dict:
    return {
        "order_item_id": order_item.id,
        "item_name": order_item.item.title if order_item.item else f"Товар #{order_item.item_id}",
        "size": order_item.item_size or (order_item.item.size if order_item.item else None),
        "color": order_item.item_color or (order_item.suggested_stock.color if order_item.suggested_stock else None),
        "batch": order_item.suggested_stock.batch_number if order_item.suggested_stock else None,
        "venchik": order_item.item_venchik or (order_item.suggested_stock.venchik if order_item.suggested_stock else None),
    }


def _split_into_full_boxes_and_leftovers(
    group_items: list[OrderItem],
    capacity: int,
) -> tuple[list[dict], list[dict]]:
    """Разбивает позиции на полные коробки и остатки."""
    full_boxes = []
    leftovers = []
    
    for order_item in group_items:
        remaining_pairs = order_item.pairs_quantity - order_item.picked_pairs
        if remaining_pairs <= 0:
            continue
            
        full_boxes_count = remaining_pairs // capacity
        leftover_pairs = remaining_pairs % capacity
        
        item_info = {
            "order_item_id": order_item.id,
            "item_name": order_item.item.title if order_item.item else f"Товар #{order_item.item_id}",
            "size": order_item.item_size or (order_item.item.size if order_item.item else None),
            "color": order_item.item_color or (order_item.suggested_stock.color if order_item.suggested_stock else None),
            "batch": order_item.suggested_stock.batch_number if order_item.suggested_stock else None,
            "venchik": order_item.item_venchik or (order_item.suggested_stock.venchik if order_item.suggested_stock else None),
        }
        
        # Полные коробки
        if full_boxes_count > 0:
            full_boxes.append({
                **item_info,
                "pairs_quantity": full_boxes_count * capacity,
                "is_full_box": True,
                "box_count": full_boxes_count,
            })
        
        # Остатки
        if leftover_pairs > 0:
            leftovers.append({
                **item_info,
                "pairs_quantity": leftover_pairs,
                "is_full_box": False,
            })
    
    return full_boxes, leftovers


def _group_leftovers_into_boxes(
    leftovers: list[dict],
    capacity: int,
) -> list[list[dict]]:
    """Группирует остатки в коробки, стараясь максимально заполнить каждую."""
    # Сортируем остатки по убыванию количества (жадный алгоритм)
    sorted_leftovers = sorted(leftovers, key=lambda x: x["pairs_quantity"], reverse=True)
    
    boxes = []
    current_box = []
    current_total = 0
    
    for item in sorted_leftovers:
        if current_total + item["pairs_quantity"] <= capacity:
            current_box.append(item)
            current_total += item["pairs_quantity"]
        else:
            if current_box:
                boxes.append(current_box)
            current_box = [item]
            current_total = item["pairs_quantity"]
    
    if current_box:
        boxes.append(current_box)
    
    return boxes


def _proposal_payload(
    *,
    group_number: int,
    item_title: str,
    color: str | None,
    total_pairs: int,
    items: list[dict],
    is_mixed: bool = False,
) -> dict:
    """Создает payload для предложения группировки."""
    return {
        "group_number": group_number,
        "item_title": item_title,
        "color": color,
        "total_pairs": total_pairs,
        "can_merge": True,
        "is_mixed": is_mixed, 
        "items": [
            {
                "order_item_id": item["order_item_id"],
                "item_name": item["item_name"],
                "size": item.get("size"),
                "color": item.get("color"),
                "batch": item.get("batch"),
                "venchik": item.get("venchik"), 
                "pairs_quantity": item["pairs_quantity"],
            }
            for item in items
        ],
    }
