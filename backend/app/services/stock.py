from __future__ import annotations

from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import raise_obj_not_found
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.order import Order, OrderItem, OrderStatus
from backend.app.models.pick_operation import PickOperation
from backend.app.models.production import ProductionSupplyRequestItem, ProductionTransfer
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse
from backend.app.schemas.warehouse import StockCreate, StockUpdate
from backend.app.services.audit import log_operation
from backend.app.services.order_reservation import suggest_pending_order_items_for_stock

ACTIVE_ORDER_STATUSES = {
    OrderStatus.pending,
    OrderStatus.processing,
    OrderStatus.picking,
    OrderStatus.packed,
    OrderStatus.partially_packed,
    OrderStatus.pick_edited,
    OrderStatus.edited,
    OrderStatus.reformulated,
}


def available_pairs(stock: Stock) -> int:
    return max(stock.pairs_quantity, 0)


async def get_stock_by_id(db: AsyncSession, stock_id: int) -> Stock:
    stock = await db.get(Stock, stock_id)
    if stock is None:
        raise_obj_not_found("Stock")
    return stock


async def get_stock_by_cell_id(db: AsyncSession, cell_id: int) -> Stock:
    stock = await db.scalar(select(Stock).where(Stock.cell_id == cell_id))
    if stock is None:
        raise_obj_not_found(f"Stock for cell {cell_id}")
    return stock


async def get_all_stocks(db: AsyncSession) -> list[Stock]:
    query = (
        select(Stock)
        .join(Cell, Cell.id == Stock.cell_id)
        .where(Cell.is_deleted.is_(False))
        .order_by(Stock.updated_at.desc(), Stock.id.desc())
    )
    return list((await db.scalars(query)).all())


async def get_stocks_by_item(db: AsyncSession, item_id: int) -> list[Stock]:
    query = (
        select(Stock)
        .join(Cell, Cell.id == Stock.cell_id)
        .where(
            Stock.item_id == item_id,
            Cell.is_deleted.is_(False),
        )
        .order_by(Stock.updated_at.desc())
    )
    return list((await db.scalars(query)).all())


async def get_stocks_by_cell(db: AsyncSession, cell_id: int) -> list[Stock]:
    query = (
        select(Stock)
        .join(Cell, Cell.id == Stock.cell_id)
        .where(
            Stock.cell_id == cell_id,
            Cell.is_deleted.is_(False),
        )
        .order_by(Stock.updated_at.desc())
    )
    return list((await db.scalars(query)).all())


async def _get_matching_stock(
    db: AsyncSession,
    *,
    cell_id: int,
    item_id: int,
    batch_number: str | None,
    size: str | None,
    color: str | None,
    venchik: str | None,
    inventory_type: str,
    manufacturer: str | None,
) -> Stock | None:
    return await db.scalar(
        select(Stock).where(
            Stock.cell_id == cell_id,
            Stock.item_id == item_id,
            Stock.batch_number == batch_number,
            Stock.size == size,
            Stock.color == color,
            Stock.venchik == venchik,
            Stock.inventory_type == inventory_type,
            Stock.manufacturer == manufacturer,
        )
    )


async def _get_item_for_stock(db: AsyncSession, item_id: int) -> Item:
    item = await db.get(Item, item_id)
    if item is None or item.is_deleted:
        raise_obj_not_found("Item")
    return item


def _normalize_inventory_attributes(
    stock_data: StockCreate | StockUpdate,
    *,
    item: Item | None = None,
) -> dict[str, object]:
    payload = stock_data.model_dump(exclude_unset=True)
    inventory_type = str(payload.get("inventory_type") or (item.inventory_type if item is not None else "finished_goods"))

    if item is not None and inventory_type != item.inventory_type:
        raise HTTPException(
            status_code=400,
            detail="Тип номенклатуры не совпадает с типом остатка",
        )

    if inventory_type == "raw_material":
        payload["batch_number"] = None
        payload["color"] = None
        payload["venchik"] = None
    elif inventory_type == "consumable":
        payload["batch_number"] = None
        payload["size"] = None
        payload["color"] = None
        payload["venchik"] = None
        payload["manufacturer"] = None
    else:
        payload["manufacturer"] = None

    payload["inventory_type"] = inventory_type
    return payload


async def _ensure_cell_inventory_type(
    db: AsyncSession,
    *,
    cell_id: int,
    inventory_type: str,
    exclude_stock_id: int | None = None,
) -> None:
    cell = await db.scalar(
        select(Cell)
        .options(selectinload(Cell.warehouse))
        .where(Cell.id == cell_id)
    )
    if cell is not None and cell.warehouse is not None and cell.warehouse.name == "Производство":
        return

    query = select(Stock).where(Stock.cell_id == cell_id, Stock.pairs_quantity > 0)
    if exclude_stock_id is not None:
        query = query.where(Stock.id != exclude_stock_id)

    existing_stocks = list((await db.scalars(query)).all())
    incompatible = next((stock for stock in existing_stocks if stock.inventory_type != inventory_type), None)
    if incompatible is not None:
        raise HTTPException(
            status_code=400,
            detail="Нельзя хранить в одной ячейке разные типы остатков",
        )


async def create_stock(db: AsyncSession, cell_id: int, stock_data: StockCreate) -> Stock:
    cell = await db.get(Cell, cell_id)
    if cell is None or cell.is_deleted:
        raise_obj_not_found("Cell")

    item = await _get_item_for_stock(db, stock_data.item_id)
    payload = _normalize_inventory_attributes(stock_data, item=item)
    await _ensure_cell_inventory_type(
        db,
        cell_id=cell_id,
        inventory_type=str(payload["inventory_type"]),
    )

    existing = await _get_matching_stock(
        db,
        cell_id=cell_id,
        item_id=stock_data.item_id,
        batch_number=payload.get("batch_number"),
        size=payload.get("size"),
        color=payload.get("color"),
        venchik=payload.get("venchik"),
        inventory_type=str(payload["inventory_type"]),
        manufacturer=payload.get("manufacturer"),
    )
    if existing is not None:
        existing.pairs_quantity += stock_data.pairs_quantity
        if payload.get("pairs_per_box") is not None:
            existing.pairs_per_box = int(payload["pairs_per_box"])
        existing.reserved_pairs = 0
        await suggest_pending_order_items_for_stock(db, existing)
        await db.commit()
        await db.refresh(existing)
        return existing

    stock = Stock(
        item_id=stock_data.item_id,
        cell_id=cell_id,
        pairs_quantity=stock_data.pairs_quantity,
        reserved_pairs=0,
        pairs_per_box=payload.get("pairs_per_box"),
        batch_number=payload.get("batch_number"),
        size=payload.get("size"),
        color=payload.get("color"),
        venchik=payload.get("venchik"),
        inventory_type=str(payload["inventory_type"]),
        manufacturer=payload.get("manufacturer"),
    )
    db.add(stock)
    await db.flush()
    await suggest_pending_order_items_for_stock(db, stock)
    await db.commit()
    await db.refresh(stock)
    return stock


async def update_stock(db: AsyncSession, stock_id: int, stock_data: StockUpdate) -> Stock:
    stock = await get_stock_by_id(db, stock_id)
    item = await _get_item_for_stock(db, stock.item_id)

    payload = _normalize_inventory_attributes(stock_data, item=item)
    inventory_type = str(payload.get("inventory_type") or stock.inventory_type)
    await _ensure_cell_inventory_type(
        db,
        cell_id=stock.cell_id,
        inventory_type=inventory_type,
        exclude_stock_id=stock.id,
    )

    for field_name, field_value in payload.items():
        setattr(stock, field_name, field_value)

    stock.reserved_pairs = 0
    await suggest_pending_order_items_for_stock(db, stock)
    await db.commit()
    await db.refresh(stock)
    return stock


async def withdraw_stock(db: AsyncSession, stock_id: int, pairs_quantity: int, user_id: int | None = None) -> Stock:
    stock = await get_stock_by_id(db, stock_id)
    if pairs_quantity > available_pairs(stock):
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно свободного товара. Доступно: {available_pairs(stock)} пар",
        )

    old_quantity = stock.pairs_quantity
    new_quantity = old_quantity - pairs_quantity
    
    # Сохраняем данные для аудита ДО удаления
    stock_id_for_audit = stock.id
    stock_data_for_audit = {
        "id": stock.id,
        "item_id": stock.item_id,
        "cell_id": stock.cell_id,
        "pairs_per_box": stock.pairs_per_box,
        "batch_number": stock.batch_number,
        "size": stock.size,
        "color": stock.color,
        "venchik": stock.venchik,
    }
    
    if new_quantity <= 0:
        # ✅ Логируем операцию ДО удаления
        await log_operation(
            db=db,
            operation_type="stock_withdraw",
            user_id=user_id,
            stock_id=None,
            item_id=stock_data_for_audit["item_id"],
            cell_id=stock_data_for_audit["cell_id"],
            quantity=pairs_quantity,
            details={
                "source_stock_id": stock_id_for_audit,
                "old_quantity": old_quantity,
                "new_quantity": 0,
                "pairs_per_box": stock_data_for_audit["pairs_per_box"],
                "batch_number": stock_data_for_audit["batch_number"],
                "size": stock_data_for_audit["size"],
                "color": stock_data_for_audit["color"],
            }
        )
        
        # ✅ ПРИНУДИТЕЛЬНО сохраняем аудит в БД
        await db.flush()
        
        # ✅ Теперь очищаем ссылки
        await db.execute(
            update(OrderItem)
            .where(OrderItem.suggested_stock_id == stock.id)
            .values(suggested_stock_id=None)
        )
        
        # ✅ Удаляем остаток
        await db.delete(stock)
        await db.commit()
        
        # Возвращаем объект с нулевым количеством
        stock.pairs_quantity = 0
        return stock
    
    # ✅ Обновляем количество (только если > 0)
    stock.pairs_quantity = new_quantity
    stock.reserved_pairs = 0
    
    # ✅ Логируем операцию
    await log_operation(
        db=db,
        operation_type="stock_withdraw",
        user_id=user_id,
        stock_id=stock.id,
        item_id=stock.item_id,
        cell_id=stock.cell_id,
        quantity=pairs_quantity,
        details={
            "old_quantity": old_quantity,
            "new_quantity": new_quantity,
            "pairs_per_box": stock.pairs_per_box,
            "batch_number": stock.batch_number,
            "size": stock.size,
            "color": stock.color,
        }
    )
    
    await db.commit()
    await db.refresh(stock)
    return stock

async def move_stock(db: AsyncSession, stock_id: int, to_cell_id: int, pairs_quantity: int, user_id: int | None = None) -> dict[str, int | bool]:
    stock = await get_stock_by_id(db, stock_id)
    if pairs_quantity > stock.pairs_quantity:
        raise HTTPException(status_code=400, detail="Недостаточно товара для перемещения")

    target_cell = await db.get(Cell, to_cell_id)
    if target_cell is None or target_cell.is_deleted:
        raise_obj_not_found("Target cell")
    await _ensure_cell_inventory_type(
        db,
        cell_id=to_cell_id,
        inventory_type=str(stock.inventory_type),
    )

    # Получаем данные о ячейках для деталей
    from_cell = await db.get(Cell, stock.cell_id)
    from_warehouse = await db.get(Warehouse, from_cell.warehouse_id) if from_cell else None
    to_warehouse = await db.get(Warehouse, target_cell.warehouse_id)

    # Форматируем координаты ячеек
    from_cell_coord = f"{from_cell.rack}-{from_cell.tier}-{from_cell.cell}" if from_cell else None
    to_cell_coord = f"{target_cell.rack}-{target_cell.tier}-{target_cell.cell}" if target_cell else None

    # Сохраняем данные для аудита ДО любых изменений
    stock_id_for_audit = stock.id
    item_id_for_audit = stock.item_id
    cell_id_for_audit = stock.cell_id
    warehouse_id_for_audit = target_cell.warehouse_id
    old_quantity = stock.pairs_quantity
    remaining_quantity = old_quantity - pairs_quantity
    will_delete_source = remaining_quantity <= 0
    
    # ✅ 1. Логируем операцию с правильными полями для отображения
    await log_operation(
        db=db,
        operation_type="move",
        user_id=user_id,
        item_id=item_id_for_audit,
        stock_id=None if will_delete_source else stock_id_for_audit,
        cell_id=cell_id_for_audit,
        warehouse_id=warehouse_id_for_audit,
        quantity=pairs_quantity,
        details={
            "source_stock_id": stock_id_for_audit,
            "from_cell": from_cell_coord,  # <-- координаты ячейки "откуда"
            "to_cell": to_cell_coord,      # <-- координаты ячейки "куда"
            "from_warehouse": from_warehouse.name if from_warehouse else None,  # <-- склад "откуда"
            "to_warehouse": to_warehouse.name if to_warehouse else None,       # <-- склад "куда"
            "from_cell_id": stock.cell_id,
            "to_cell_id": to_cell_id,
            "old_quantity": old_quantity,
            "remaining": remaining_quantity,
            "action": "Перемещение товара"
        }
    )
    
    # ✅ ПРИНУДИТЕЛЬНО сохраняем аудит в БД
    await db.flush()

    # ✅ 2. Теперь выполняем перемещение
    matching_target = await _get_matching_stock(
        db,
        cell_id=to_cell_id,
        item_id=stock.item_id,
        batch_number=stock.batch_number,
        size=stock.size,
        color=stock.color,
        venchik=stock.venchik,
        inventory_type=stock.inventory_type,
        manufacturer=stock.manufacturer,
    )

    # ✅ Если перемещаем все - сначала очищаем ссылки, потом удаляем исходный остаток
    if will_delete_source:
        await db.execute(
            update(OrderItem)
            .where(OrderItem.suggested_stock_id == stock.id)
            .values(suggested_stock_id=None)
        )
        await db.delete(stock)
    else:
        stock.pairs_quantity = remaining_quantity
        stock.reserved_pairs = 0

    if matching_target is None:
        matching_target = Stock(
            item_id=stock.item_id,
            cell_id=to_cell_id,
            pairs_quantity=pairs_quantity,
            reserved_pairs=0,
            pairs_per_box=stock.pairs_per_box,
            batch_number=stock.batch_number,
            size=stock.size,
            color=stock.color,
            venchik=stock.venchik,
            inventory_type=stock.inventory_type,
            manufacturer=stock.manufacturer,
        )
        db.add(matching_target)
        await db.flush()
    else:
        matching_target.pairs_quantity += pairs_quantity
        matching_target.reserved_pairs = 0

    await suggest_pending_order_items_for_stock(db, matching_target)

    await db.commit()
    return {"from_stock_deleted": will_delete_source, "to_stock_id": matching_target.id}


async def _legacy_delete_stock(db: AsyncSession, stock_id: int) -> Stock:
    stock = await get_stock_by_id(db, stock_id)

    # ✅ Проверяем, есть ли ссылки на этот остаток в заказах
    active_order_items = list(
        await db.scalars(
            select(OrderItem)
            .where(
                OrderItem.suggested_stock_id == stock_id,
                OrderItem.picked_pairs < OrderItem.pairs_quantity
            )
        )
    )
    
    if active_order_items:
        # ✅ Очищаем ссылки
        for order_item in active_order_items:
            order_item.suggested_stock_id = None
        
        # ✅ Обновляем статус заказов
        order_ids = {item.order_id for item in active_order_items}
        for order_id in order_ids:
            order = await db.get(Order, order_id)
            if order and order.status not in {OrderStatus.cancelled, OrderStatus.delivered, OrderStatus.shipped}:
                order.status = OrderStatus.pending
        
        await db.commit()

    # ✅ Теперь удаляем остаток
    await db.delete(stock)
    await db.commit()
    return stock


async def _clear_stock_references(db: AsyncSession, stock_ids: Sequence[int]) -> None:
    unique_stock_ids = list(dict.fromkeys(stock_ids))
    if not unique_stock_ids:
        return

    active_order_items = list(
        await db.scalars(
            select(OrderItem).where(
                OrderItem.suggested_stock_id.in_(unique_stock_ids),
                OrderItem.picked_pairs < OrderItem.pairs_quantity,
            )
        )
    )
    active_order_ids = {item.order_id for item in active_order_items}
    for order_id in active_order_ids:
        order = await db.get(Order, order_id)
        if order and order.status not in {OrderStatus.cancelled, OrderStatus.delivered, OrderStatus.shipped}:
            order.status = OrderStatus.pending

    await db.execute(
        update(OrderItem)
        .where(OrderItem.suggested_stock_id.in_(unique_stock_ids))
        .values(suggested_stock_id=None)
    )
    await db.execute(
        update(ProductionSupplyRequestItem)
        .where(ProductionSupplyRequestItem.selected_stock_id.in_(unique_stock_ids))
        .values(selected_stock_id=None)
    )
    await db.execute(
        update(ProductionTransfer)
        .where(ProductionTransfer.stock_id.in_(unique_stock_ids))
        .values(stock_id=None)
    )
    await db.execute(
        update(PickOperation)
        .where(PickOperation.stock_id.in_(unique_stock_ids))
        .values(stock_id=None)
    )


def _delete_stock_audit_details(stock: Stock) -> dict[str, object]:
    return {
        "source_stock_id": stock.id,
        "pairs_per_box": stock.pairs_per_box,
        "batch_number": stock.batch_number,
        "size": stock.size,
        "color": stock.color,
        "venchik": stock.venchik,
        "inventory_type": stock.inventory_type.value if hasattr(stock.inventory_type, "value") else str(stock.inventory_type),
        "manufacturer": stock.manufacturer,
        "action": "РЈРґР°Р»РµРЅРёРµ РѕСЃС‚Р°С‚РєР°",
    }


async def delete_stock(db: AsyncSession, stock_id: int) -> Stock:
    stock = await get_stock_by_id(db, stock_id)
    await _clear_stock_references(db, [stock_id])
    await db.delete(stock)
    await db.commit()
    return stock


async def bulk_delete_stocks(
    db: AsyncSession,
    stock_ids: Sequence[int],
    *,
    user_id: int | None,
) -> dict[str, object]:
    unique_stock_ids = list(dict.fromkeys(stock_ids))
    if not unique_stock_ids:
        raise HTTPException(status_code=400, detail="No stocks selected")

    stocks = list((await db.scalars(select(Stock).where(Stock.id.in_(unique_stock_ids)))).all())
    stocks_by_id = {stock.id: stock for stock in stocks}
    missing_ids = [stock_id for stock_id in unique_stock_ids if stock_id not in stocks_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Stocks not found: {', '.join(map(str, missing_ids))}")

    await _clear_stock_references(db, unique_stock_ids)

    for stock_id in unique_stock_ids:
        stock = stocks_by_id[stock_id]
        await log_operation(
            db,
            operation_type="delete_stock",
            user_id=user_id,
            item_id=stock.item_id,
            stock_id=None,
            cell_id=stock.cell_id,
            quantity=stock.pairs_quantity,
            details=_delete_stock_audit_details(stock),
        )
        await db.delete(stock)

    await db.commit()
    return {"deleted_count": len(unique_stock_ids), "stock_ids": unique_stock_ids}
