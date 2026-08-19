from __future__ import annotations

from collections.abc import Sequence
import math

import httpx
from fastapi import HTTPException
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from backend.app.models.audit import AuditLog
from backend.app.repositories import production_history as production_history_repo
from backend.app.core.config import settings
from backend.app.core.logging import get_logger
from backend.app.core.time import utc_now_naive
from backend.app.models.cell import Cell
from backend.app.models.employee import ProductionLaborEntry
from backend.app.models.item import Item, ItemInventoryType
from backend.app.models.production import (
    ProductionChzRequest,
    ProductionChzRequestItem,
    ProductionChzStatus,
    ProductionOrder,
    ProductionOrderItem,
    ProductionOrderStatus,
    ProductionTaskType,
    ProductionSupplyRequest,
    ProductionSupplyRequestItem,
    ProductionSupplyStatus,
    ProductionSupplyType,
    ProductionTransfer,
)
from backend.app.models.stock import Stock, StockInventoryType
from backend.app.models.warehouse import Warehouse
from backend.app.schemas.production import (
    ProductionChzRequestCreate,
    ProductionChzRequestResponse,
    ProductionChzRequestItemResponse,
    ProductionItemProducedUpdate,
    ProductionOrderCreate,
    ProductionOrderItemBatchDateUpdate,
    ProductionOrderItemResponse,
    ProductionOrderResponse,
    ProductionReceiptRequestCreate,
    ProductionOrderUpdate,
    ProductionStartRequest,
    ProductionSupplyFulfillmentRequest,
    ProductionSupplyRequestAutoCreate,
    ProductionSupplyRequestCreate,
    ProductionSupplyRequestItemResponse,
    ProductionSupplyRequestResponse,
    ProductionTransferCreate,
)
from backend.app.schemas.employee import ProductionLaborEntryResponse
from backend.app.services.stock import available_pairs

logger = get_logger(__name__)

PRODUCTION_WAREHOUSE_NAME = "Производство"

def _normalize_production_task_type(value: object) -> ProductionTaskType:
    raw_value = value.value if hasattr(value, "value") else str(value or "")
    if raw_value in {"", "None", "default"}:
        return ProductionTaskType.packaging
    try:
        return ProductionTaskType(raw_value)
    except ValueError:
        logger.warning("Unknown production task_type %s, falling back to packaging", raw_value)
        return ProductionTaskType.packaging


PRODUCTION_LOAD_OPTIONS = (
    selectinload(ProductionOrder.related_order),
    selectinload(ProductionOrder.items).selectinload(ProductionOrderItem.item),
    selectinload(ProductionOrder.supply_requests)
    .selectinload(ProductionSupplyRequest.items)
    .selectinload(ProductionSupplyRequestItem.item),
    selectinload(ProductionOrder.supply_requests)
    .selectinload(ProductionSupplyRequest.items)
    .selectinload(ProductionSupplyRequestItem.production_order_item)
    .selectinload(ProductionOrderItem.item),
    selectinload(ProductionOrder.supply_requests)
    .selectinload(ProductionSupplyRequest.items)
    .selectinload(ProductionSupplyRequestItem.selected_stock)
    .selectinload(Stock.cell)
    .selectinload(Cell.warehouse),
    selectinload(ProductionOrder.supply_requests)
    .selectinload(ProductionSupplyRequest.items)
    .selectinload(ProductionSupplyRequestItem.selected_cell)
    .selectinload(Cell.warehouse),
    selectinload(ProductionOrder.chz_requests).selectinload(ProductionChzRequest.items),
    selectinload(ProductionOrder.chz_requests).selectinload(ProductionChzRequest.requested_by),
    selectinload(ProductionOrder.labor_entries).selectinload(ProductionLaborEntry.employee),
)


async def list_production_orders(db: AsyncSession) -> list[ProductionOrderResponse]:
    orders = list(
        (
            await db.scalars(
                select(ProductionOrder)
                .options(*PRODUCTION_LOAD_OPTIONS)
                .order_by(ProductionOrder.created_at.desc(), ProductionOrder.id.desc())
            )
        ).all()
    )
    return [_serialize_production_order(order) for order in orders]


async def get_production_order(db: AsyncSession, production_order_id: int) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    return _serialize_production_order(order)


async def delete_production_order(db: AsyncSession, production_order_id: int) -> ProductionOrder:
    order = await _get_production_order_or_404(db, production_order_id)

    if order.chz_requests:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a production order after a CHZ request has been created",
        )

    # Проверяем, есть ли уже переданные на склад товары (это критично - нельзя откатить)
    if any(item.transferred_pairs > 0 for item in order.items):
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить заказ, так как часть товара уже передана на склад. Сначала верните товар со склада.",
        )

    # Проверяем, есть ли произведенные пары (это критично - нельзя откатить)
    if any(item.produced_pairs > 0 for item in order.items):
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить заказ, так как производство уже начато и есть произведенная продукция.",
        )

    # Отменяем и удаляем все supply requests
    for request in order.supply_requests:
        # Если задача выполнена и есть fulfilled_quantity > 0 - нужно восстановить остатки
        if request.status == ProductionSupplyStatus.completed or any(item.fulfilled_quantity > 0 for item in request.items):
            # Восстанавливаем остатки для выполненных задач
            for request_item in request.items:
                if request_item.fulfilled_quantity > 0 and request_item.selected_stock_id:
                    # Возвращаем товар обратно на склад
                    stock = await db.get(Stock, request_item.selected_stock_id)
                    if stock:
                        if request.request_type == ProductionSupplyType.finished_goods_receipt:
                            # Для приемки готовой продукции - возвращаем пары
                            stock.pairs_quantity -= request_item.fulfilled_quantity
                        else:
                            # Для сырья и расходников - возвращаем пары
                            stock.pairs_quantity += request_item.fulfilled_quantity
                        request_item.fulfilled_quantity = 0
                        request_item.selected_stock_id = None
                        request_item.selected_cell_id = None
            
            request.status = ProductionSupplyStatus.requested

    # Отменяем все CHZ запросы
    for chz_request in order.chz_requests:
        if chz_request.is_active and chz_request.status != ProductionChzStatus.cancelled:
            chz_request.is_active = False
            chz_request.status = ProductionChzStatus.cancelled

    # Удаляем все связанные записи через каскадное удаление
    # Просто удаляем заказ, все связанные записи удалятся автоматически
    await db.delete(order)
    await db.commit()
    return order


async def _get_item_by_title_only(db: AsyncSession, item_id: int) -> Item:
    """Получить товар по ID, но проверить что он существует как справочная запись."""
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    return item


async def create_production_order(
    db: AsyncSession,
    payload: ProductionOrderCreate,
    *,
    created_by_user_id: int | None,
) -> ProductionOrderResponse:
    order = ProductionOrder(
        name=payload.name,
        task_type=payload.task_type,
        priority=payload.priority,
        comment=payload.comment,
        related_order_id=payload.related_order_id,
        created_by_user_id=created_by_user_id,
        status=ProductionOrderStatus.pending,
    )
    db.add(order)
    await db.flush()

    support_task_types = {"warehouse_help", "cleaning"}
    task_type = payload.task_type.value if hasattr(payload.task_type, "value") else str(payload.task_type)
    if not payload.items and task_type not in support_task_types:
        raise HTTPException(status_code=400, detail="Production order must contain at least one item")

    for item_payload in payload.items:
        item = await _get_item_or_404(db, item_payload.item_id)
        allowed_inventory_types = {ItemInventoryType.finished_goods}
        if task_type in {"unpacking", "trim_cuffs", "defect_sorting", "repacking"}:
            allowed_inventory_types.add(ItemInventoryType.raw_material)
        if item.inventory_type not in allowed_inventory_types:
            raise HTTPException(status_code=400, detail="Only finished goods can be added to a production order")
        db.add(
            ProductionOrderItem(
                production_order_id=order.id,
                item_id=item.id,
                pairs_quantity=item_payload.pairs_quantity,
                produced_pairs=0,
                transferred_pairs=0,
                item_size=item_payload.item_size,
                item_color=item_payload.item_color,
                batch_number=item_payload.batch_number,      # <-- добавлено
                production_date=item_payload.production_date, # <-- добавлено
            )
        )

    await db.commit()
    return await get_production_order(db, order.id)


async def update_production_order_item_batch_date(
    db: AsyncSession,
    production_order_id: int,
    production_order_item_id: int,
    data: ProductionOrderItemBatchDateUpdate,
) -> ProductionOrderResponse:
    """Обновить партию и дату производства для конкретной позиции."""
    order = await _get_production_order_or_404(db, production_order_id)
    item = next((i for i in order.items if i.id == production_order_item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    if order.status != ProductionOrderStatus.in_progress:
        raise HTTPException(status_code=400, detail="Production task must be started before updating produced quantity")
    
    if data.batch_number is not None:
        item.batch_number = data.batch_number
    if data.production_date is not None:
        item.production_date = data.production_date
    
    item.updated_at = utc_now_naive()
    await db.commit()
    return await get_production_order(db, production_order_id)


async def update_production_order(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionOrderUpdate,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field_name, value)
    await db.commit()
    return await get_production_order(db, production_order_id)


async def get_production_order_by_id(db: AsyncSession, production_order_id: int) -> ProductionOrder:
    """Получить ProductionOrder по ID без сериализации (для внутреннего использования)"""
    order = await db.scalar(
        select(ProductionOrder)
        .options(*PRODUCTION_LOAD_OPTIONS)
        .where(ProductionOrder.id == production_order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


async def update_production_order_item_produced(
    db: AsyncSession,
    production_order_id: int,
    production_order_item_id: int,
    data: ProductionItemProducedUpdate,
    user_id: int | None = None,
) -> ProductionOrderResponse:
    order = await get_production_order_by_id(db, production_order_id)
    item = next((i for i in order.items if i.id == production_order_item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    
    old_produced_pairs = item.produced_pairs
    new_produced_pairs = data.produced_pairs
    
    if new_produced_pairs < 0:
        raise HTTPException(status_code=400, detail="Produced pairs cannot be negative")
    if new_produced_pairs > item.pairs_quantity:
        raise HTTPException(status_code=400, detail="Produced pairs cannot exceed ordered quantity")
    if new_produced_pairs < item.transferred_pairs:
        raise HTTPException(status_code=400, detail="Produced pairs cannot be less than already transferred quantity")
    
    item.produced_pairs = new_produced_pairs
    item.updated_at = utc_now_naive()
    
    await production_history_repo.create_production_history(
        db=db,
        production_order_item_id=item.id,
        old_produced_pairs=old_produced_pairs,
        new_produced_pairs=new_produced_pairs,
        changed_by_user_id=user_id,
        comment=data.comment,
    )
    
    await _recalculate_production_order_status(order)
    
    # ✅ Убираем commit – он будет выполнен в API
    await db.flush()  # или можно вообще убрать, commit сделает всё
    return await get_production_order(db, production_order_id)


async def request_supply(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionSupplyRequestCreate,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    if payload.request_type == ProductionSupplyType.finished_goods_receipt:
        raise HTTPException(status_code=400, detail="Finished goods receipt must be created through a dedicated endpoint")
    
    request_type = ProductionSupplyType(payload.request_type.value)
    
    # Получаем существующий request или создаем новый
    request = await _create_supply_request_record(
        db,
        order=order,
        request_type=request_type,
        comment=payload.comment,
    )

    # Явно загружаем items
    await db.refresh(request, attribute_names=['items'])

    # Собираем ID позиций заказа для проверки
    order_item_ids = {item.id for item in order.items}

    for item_payload in payload.items:
        item = await _get_item_or_404(db, item_payload.item_id)
        _ensure_supply_item_inventory_type(item=item, request_type=request_type)

        # Проверяем, что production_order_item_id относится к этому заказу
        if item_payload.production_order_item_id is not None:
            if item_payload.production_order_item_id not in order_item_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Position {item_payload.production_order_item_id} does not belong to this production order"
                )

        # Ищем существующую позицию в заявке (по item_id, size и production_order_item_id)
        existing_item = next(
            (ri for ri in request.items 
             if ri.item_id == item.id 
             and ri.size == item_payload.size 
             and ri.production_order_item_id == item_payload.production_order_item_id),
            None
        )
        
        if existing_item:
            existing_item.quantity += item_payload.quantity
        else:
            selected_stock_id = None
            selected_cell_id = None
            if item_payload.stock_id:
                stock = await db.get(Stock, item_payload.stock_id)
                if stock and stock.item_id == item.id and stock.pairs_quantity >= item_payload.quantity:
                    selected_stock_id = stock.id
                    selected_cell_id = stock.cell_id
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Выбранный остаток не содержит достаточно товара или не соответствует номенклатуре"
                    )
            
            db.add(
                ProductionSupplyRequestItem(
                    request_id=request.id,
                    item_id=item.id,
                    production_order_item_id=item_payload.production_order_item_id,  # <-- передаём
                    quantity=item_payload.quantity,
                    fulfilled_quantity=0,
                    size=item_payload.size,
                    manufacturer=item_payload.manufacturer,
                    selected_stock_id=selected_stock_id,
                    selected_cell_id=selected_cell_id,
                )
            )

    await _recalculate_production_order_status(order)
    await db.commit()
    return await get_production_order(db, order.id)


async def request_supply_automatically(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionSupplyRequestAutoCreate,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    if payload.request_type not in {ProductionSupplyType.raw_material, ProductionSupplyType.consumable}:
        raise HTTPException(status_code=400, detail="Automatic request is supported only for raw materials and consumables")

    request_type = ProductionSupplyType(payload.request_type.value)
    
    # ✅ Получаем существующий request или создаем новый
    request = await _create_supply_request_record(
        db,
        order=order,
        request_type=request_type,
        comment=payload.comment,
    )

    for order_item in order.items:
        finished_item = order_item.item or await _get_item_or_404(db, order_item.item_id)
        matched_item = await _find_matching_supply_item(
            db,
            title=finished_item.title,
            size=finished_item.size,
            inventory_type=request_type,
        )
        if matched_item is None:
            supply_kind = "сырья" if request_type == ProductionSupplyType.raw_material else "расходников"
            # ✅ Не выбрасываем ошибку, а просто пропускаем
            continue

        request_quantity = _remaining_pairs_for_order_item(order_item)
        if request_quantity <= 0:
            continue
        
        # ✅ Проверяем, нет ли уже такого же item в request
        existing_item = next(
            (ri for ri in request.items if ri.item_id == matched_item.id),
            None
        )
        
        if existing_item:
            # ✅ Если есть - увеличиваем количество
            existing_item.quantity += request_quantity
        else:
            # ✅ Если нет - добавляем новый
            db.add(
                ProductionSupplyRequestItem(
                    request_id=request.id,
                    item_id=matched_item.id,
                    production_order_item_id=order_item.id,
                    quantity=request_quantity,
                    fulfilled_quantity=0,
                    size=matched_item.size if request_type == ProductionSupplyType.raw_material else None,
                    manufacturer=None,
                )
            )

    await _recalculate_production_order_status(order)
    await db.commit()
    return await get_production_order(db, order.id)


async def create_finished_goods_receipt_request(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionReceiptRequestCreate,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)

    target_item = next((item for item in order.items if item.id == payload.production_order_item_id), None)
    if target_item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    
    # ✅ Проверяем партию у позиции
    if not target_item.batch_number:
        raise HTTPException(status_code=400, detail="Assign a batch number to the production order item before creating a warehouse receipt task")
    
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    available_quantity = _remaining_pairs_for_order_item(target_item) - _pending_receipt_quantity(order, target_item.id)
    if payload.quantity > available_quantity:
        raise HTTPException(status_code=400, detail="Receipt quantity exceeds the available quantity for transfer")

    request = await _create_supply_request_record(
        db,
        order=order,
        request_type=ProductionSupplyType.finished_goods_receipt,
        comment=payload.comment,
    )
    db.add(
        ProductionSupplyRequestItem(
            request_id=request.id,
            item_id=target_item.item_id,
            production_order_item_id=target_item.id,
            quantity=payload.quantity,
            fulfilled_quantity=0,
            size=target_item.item.size if target_item.item is not None else None,
            manufacturer=None,
        )
    )

    await _recalculate_production_order_status(order)
    await db.commit()
    return await get_production_order(db, order.id)

async def start_supply_request(
    db: AsyncSession,
    supply_request_id: int,
) -> ProductionOrderResponse:
    request = await _get_supply_request_or_404(db, supply_request_id)
    if request.status == ProductionSupplyStatus.completed:
        raise HTTPException(status_code=400, detail="Task has already been completed")
    request.status = ProductionSupplyStatus.in_progress
    await db.commit()
    return await get_production_order(db, request.production_order_id)


async def fulfill_supply_request(
    db: AsyncSession,
    supply_request_id: int,
    payload: ProductionSupplyFulfillmentRequest,
    *,
    user_id: int | None,
) -> ProductionOrderResponse:
    request = await _get_supply_request_or_404(db, supply_request_id)

    request_items_by_id = {item.id: item for item in request.items}
    for fulfillment in payload.items:
        request_item = request_items_by_id.get(fulfillment.request_item_id)
        if request_item is None:
            raise HTTPException(status_code=404, detail=f"Supply request item {fulfillment.request_item_id} not found")
        if fulfillment.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        if request_item.fulfilled_quantity + fulfillment.quantity > request_item.quantity:
            raise HTTPException(status_code=400, detail="Fulfillment quantity exceeds the requested amount")

        if request.request_type == ProductionSupplyType.finished_goods_receipt:
            await _fulfill_finished_goods_receipt(
                db,
                request=request,
                request_item=request_item,
                cell_id=fulfillment.cell_id,
                quantity=fulfillment.quantity,
                user_id=user_id,
            )
            continue

        await _fulfill_supply_issue(
            db,
            request=request,
            request_item=request_item,
            stock_id=fulfillment.stock_id,
            quantity=fulfillment.quantity,
        )

    if all(item.fulfilled_quantity >= item.quantity for item in request.items):
        request.status = ProductionSupplyStatus.completed
    else:
        request.status = ProductionSupplyStatus.in_progress

    await db.flush()
    order = await _get_production_order_or_404(db, request.production_order_id)
    await _recalculate_production_order_status(order)
    await db.flush()
    await db.commit()

    return await get_production_order(db, request.production_order_id)


async def start_production(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionStartRequest,
    *,
    brigadier_user_id: int | None,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    resource_requests = _resource_supply_requests(order)
    if resource_requests and any(request.status != ProductionSupplyStatus.completed for request in resource_requests):
        raise HTTPException(status_code=400, detail="Not all resource requests have been completed")

    # Устанавливаем партию и дату в заказ (на случай, если они используются)
    order.batch_number = payload.batch_number
    order.production_date = payload.production_date
    order.brigadier_user_id = brigadier_user_id
    order.status = ProductionOrderStatus.in_progress

    # Копируем партию и дату во все позиции, где они ещё не заданы
    for item in order.items:
        if not item.batch_number:
            item.batch_number = payload.batch_number
        if not item.production_date:
            item.production_date = payload.production_date

    await db.commit()
    return await get_production_order(db, order.id)


async def complete_production(db: AsyncSession, production_order_id: int) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    if order.status not in {ProductionOrderStatus.in_progress, ProductionOrderStatus.partially_transferred, ProductionOrderStatus.transferred}:
        raise HTTPException(status_code=400, detail="Production task cannot be completed in its current status")

    await _consume_order_consumables(
        db,
        order=order,
        allow_produced_fallback=True,
    )

    # Если уже transferred, ничего не делаем
    order.status = ProductionOrderStatus.completed

    await db.commit()
    return await get_production_order(db, order.id)


async def transfer_production_to_stock(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionTransferCreate,
    *,
    user_id: int | None,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)
    if order.status not in {
        ProductionOrderStatus.in_progress,
        ProductionOrderStatus.completed,
        ProductionOrderStatus.partially_transferred,
        ProductionOrderStatus.ready_to_work,
    }:
        raise HTTPException(status_code=400, detail="Production task cannot be transferred to stock in the current status")
    if not order.batch_number:
        raise HTTPException(status_code=400, detail="Assign a batch number before transferring goods to stock")

    target_item = next((item for item in order.items if item.id == payload.production_order_item_id), None)
    if target_item is None:
        raise HTTPException(status_code=404, detail="Production order item not found")
    if payload.pairs_quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    remaining_pairs = _remaining_pairs_for_order_item(target_item)
    if payload.pairs_quantity > remaining_pairs:
        raise HTTPException(status_code=400, detail="Transfer quantity exceeds the available quantity for transfer")
    await _receive_finished_goods_to_stock(
        db,
        order=order,
        production_order_item=target_item,
        cell_id=payload.cell_id,
        quantity=payload.pairs_quantity,
        user_id=user_id,
    )
    await _consume_order_consumables(
        db,
        order=order,
        allow_produced_fallback=False,
    )
    await _recalculate_production_order_status(order)
    await db.commit()
    return await get_production_order(db, order.id)


async def create_production_chz_request(
    db: AsyncSession,
    *,
    production_order_id: int,
    payload: ProductionChzRequestCreate,
    requested_by_user_id: int | None,
) -> ProductionOrderResponse:
    order = await _get_production_order_or_404(db, production_order_id)

    target_item_ids = set(payload.production_order_item_ids or [])
    target_items = [
        item
        for item in order.items
        if not target_item_ids or item.id in target_item_ids
    ]
    if not target_items:
        raise HTTPException(status_code=400, detail="Select at least one production item")

    for existing_request in order.chz_requests:
        if existing_request.is_active and existing_request.status != ProductionChzStatus.ready:
            existing_request.is_active = False
            existing_request.status = ProductionChzStatus.cancelled

    request = ProductionChzRequest(
        production_order_id=order.id,
        requested_by_user_id=requested_by_user_id,
        status=ProductionChzStatus.requested,
        is_active=True,
        comment=payload.comment,
    )
    db.add(request)
    await db.flush()

    for order_item in target_items:
        item = order_item.item or await _get_item_or_404(db, order_item.item_id)
        batch_number = order_item.batch_number or order.batch_number
        if not batch_number:
            raise HTTPException(
                status_code=400,
                detail=f"Assign a batch number for position {item.title} before requesting CHZ",
            )
        db.add(
            ProductionChzRequestItem(
                request_id=request.id,
                production_order_item_id=order_item.id,
                item_id=order_item.item_id,
                pairs_quantity=max(order_item.pairs_quantity - order_item.transferred_pairs, 0),
                item_title=item.title,
                item_size=order_item.item_size or item.size,
                item_color=order_item.item_color or item.color,
                batch_number=batch_number,
            )
        )

    await db.commit()
    created_request = await _get_production_chz_request_or_404(db, request.id)
    await _push_production_chz_to_external_bridge(order, created_request)
    return await get_production_order(db, order.id)


async def list_pending_production_chz_requests(db: AsyncSession) -> list[ProductionChzRequest]:
    return list(
        (
            await db.scalars(
                select(ProductionChzRequest)
                .options(
                    selectinload(ProductionChzRequest.items),
                    selectinload(ProductionChzRequest.production_order),
                    selectinload(ProductionChzRequest.requested_by),
                )
                .where(
                    ProductionChzRequest.is_active.is_(True),
                    ProductionChzRequest.status.in_([ProductionChzStatus.requested, ProductionChzStatus.acknowledged]),
                )
                .order_by(ProductionChzRequest.requested_at.asc())
            )
        ).all()
    )


async def acknowledge_production_chz_request(db: AsyncSession, request_id: int) -> ProductionChzRequest:
    request = await _get_production_chz_request_or_404(db, request_id)
    request.status = ProductionChzStatus.acknowledged
    request.acknowledged_at = utc_now_naive()
    await db.commit()
    await db.refresh(request)
    return request


async def mark_production_chz_request_ready(db: AsyncSession, request_id: int) -> ProductionChzRequest:
    request = await _get_production_chz_request_or_404(db, request_id)
    request.status = ProductionChzStatus.ready
    request.ready_at = utc_now_naive()
    request.is_active = False
    await db.commit()
    await db.refresh(request)
    return request


async def _get_production_order_or_404(db: AsyncSession, production_order_id: int) -> ProductionOrder:
    order = await db.scalar(
        select(ProductionOrder)
        .execution_options(populate_existing=True)
        .options(*PRODUCTION_LOAD_OPTIONS)
        .where(ProductionOrder.id == production_order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


async def _get_production_chz_request_or_404(db: AsyncSession, request_id: int) -> ProductionChzRequest:
    request = await db.scalar(
        select(ProductionChzRequest)
        .options(
            selectinload(ProductionChzRequest.items),
            selectinload(ProductionChzRequest.production_order),
            selectinload(ProductionChzRequest.requested_by),
        )
        .where(ProductionChzRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Production CHZ request not found")
    return request


async def _get_item_or_404(db: AsyncSession, item_id: int) -> Item:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    return item


async def _get_supply_request_or_404(db: AsyncSession, supply_request_id: int) -> ProductionSupplyRequest:
    request = await db.scalar(
        select(ProductionSupplyRequest)
        .options(
            selectinload(ProductionSupplyRequest.production_order).selectinload(ProductionOrder.items).selectinload(ProductionOrderItem.item),
            selectinload(ProductionSupplyRequest.items).selectinload(ProductionSupplyRequestItem.item),
            selectinload(ProductionSupplyRequest.items).selectinload(ProductionSupplyRequestItem.production_order_item).selectinload(ProductionOrderItem.item),
            selectinload(ProductionSupplyRequest.items).selectinload(ProductionSupplyRequestItem.selected_stock).selectinload(Stock.cell).selectinload(Cell.warehouse),
            selectinload(ProductionSupplyRequest.items).selectinload(ProductionSupplyRequestItem.selected_cell).selectinload(Cell.warehouse),
        )
        .where(ProductionSupplyRequest.id == supply_request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Production supply request not found")
    return request


async def _create_supply_request_record(
    db: AsyncSession,
    *,
    order: ProductionOrder,
    request_type: ProductionSupplyType,
    comment: str | None,
) -> ProductionSupplyRequest:
    # ✅ Ищем существующий НЕЗАВЕРШЕННЫЙ request того же типа
    existing_request = next(
        (
            request
            for request in order.supply_requests
            if request.request_type == request_type and request.status != ProductionSupplyStatus.completed
        ),
        None,
    )
    
    # ✅ Если есть - добавляем в него, а не создаем новый
    if existing_request is not None:
        return existing_request
    
    # Если нет - создаем новый
    request = ProductionSupplyRequest(
        production_order_id=order.id,
        request_type=request_type,
        status=ProductionSupplyStatus.requested,
        comment=comment,
    )
    db.add(request)
    await db.flush()
    return request


def _ensure_supply_item_inventory_type(*, item: Item, request_type: ProductionSupplyType) -> None:
    expected_inventory_type = (
        ItemInventoryType.raw_material
        if request_type == ProductionSupplyType.raw_material
        else ItemInventoryType.consumable
    )
    if item.inventory_type != expected_inventory_type:
        raise HTTPException(status_code=400, detail="Selected item has incompatible inventory type")


async def _find_matching_supply_item(
    db: AsyncSession,
    *,
    title: str,
    size: str | None,
    inventory_type: ProductionSupplyType,
) -> Item | None:
    expected_inventory_type = (
        ItemInventoryType.raw_material
        if inventory_type == ProductionSupplyType.raw_material
        else ItemInventoryType.consumable
    )
    
    # ✅ Ищем ТОЛЬКО по названию (игнорируем размер)
    candidates = list(
        (
            await db.scalars(
                select(Item).where(
                    Item.title == title,  # Точное совпадение
                    Item.inventory_type == expected_inventory_type,
                    Item.is_deleted.is_(False)
                )
            )
        ).all()
    )
    
    if not candidates:
        # Если не найден - создаем новый БЕЗ размера
        new_item = Item(
            title=title,
            name=title,
            product_type="",
            size="",
            color="",
            inventory_type=expected_inventory_type,
        )
        db.add(new_item)
        await db.flush()
        return new_item
    
    # Если есть несколько - берем первый (или тот, у которого есть размер)
    if size:
        exact_size_match = next((item for item in candidates if item.size == size), None)
        if exact_size_match is not None:
            return exact_size_match
    
    return candidates[0]


def _normalize_title(value: str | None) -> str:
    return (value or "").strip().lower()


def _resource_supply_requests(order: ProductionOrder) -> list[ProductionSupplyRequest]:
    return [
        request
        for request in order.supply_requests
        if request.request_type in {ProductionSupplyType.raw_material, ProductionSupplyType.consumable}
    ]


def _remaining_pairs_for_order_item(item: ProductionOrderItem) -> int:
    """Возвращает количество пар, доступных для передачи на склад."""
    # Если есть фактически произведенное количество - используем его
    # Иначе используем плановое
    total_available = item.produced_pairs if item.produced_pairs > 0 else item.pairs_quantity
    # Вычитаем уже переданное
    return max(total_available - item.transferred_pairs, 0)


def _pending_receipt_quantity(order: ProductionOrder, production_order_item_id: int) -> int:
    """Возвращает количество пар, уже заказанных к передаче но еще не переданных."""
    total = 0
    for request in order.supply_requests:
        if request.request_type != ProductionSupplyType.finished_goods_receipt:
            continue
        if request.status == ProductionSupplyStatus.completed:
            continue
        for request_item in request.items:
            if request_item.production_order_item_id != production_order_item_id:
                continue
            total += max(request_item.quantity - request_item.fulfilled_quantity, 0)
    return total


async def _get_or_create_production_cell(db: AsyncSession) -> Cell:
    warehouse = await db.scalar(select(Warehouse).where(Warehouse.name == PRODUCTION_WAREHOUSE_NAME))
    if warehouse is None:
        warehouse = Warehouse(name=PRODUCTION_WAREHOUSE_NAME)
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


async def _add_stock_to_production_cell(
    db: AsyncSession,
    *,
    source_stock: Stock,
    quantity: int,
) -> Stock:
    production_cell = await _get_or_create_production_cell(db)
    destination = await db.scalar(
        select(Stock).where(
            Stock.cell_id == production_cell.id,
            Stock.item_id == source_stock.item_id,
            Stock.batch_number == source_stock.batch_number,
            Stock.size == source_stock.size,
            Stock.color == source_stock.color,
            Stock.venchik == source_stock.venchik,
            Stock.inventory_type == source_stock.inventory_type,
            Stock.manufacturer == source_stock.manufacturer,
        )
    )
    if destination is None:
        destination = Stock(
            item_id=source_stock.item_id,
            cell_id=production_cell.id,
            pairs_quantity=0,
            reserved_pairs=0,
            pairs_per_box=source_stock.pairs_per_box,
            batch_number=source_stock.batch_number,
            size=source_stock.size,
            color=source_stock.color,
            venchik=source_stock.venchik,
            inventory_type=source_stock.inventory_type,
            manufacturer=source_stock.manufacturer,
        )
        db.add(destination)
        await db.flush()

    destination.pairs_quantity += quantity
    destination.reserved_pairs = 0
    return destination


async def _fulfill_supply_issue(
    db: AsyncSession,
    *,
    request: ProductionSupplyRequest,
    request_item: ProductionSupplyRequestItem,
    stock_id: int | None,
    quantity: int,
) -> None:
    if not stock_id:
        raise HTTPException(status_code=400, detail="Select a stock item for fulfillment")
    
    # ✅ Проверяем существование остатка
    stock = await db.get(Stock, stock_id)
    if stock is None:
        raise HTTPException(status_code=404, detail=f"Stock {stock_id} not found or already deleted")

    expected_inventory_type = (
        StockInventoryType.raw_material
        if request.request_type == ProductionSupplyType.raw_material
        else StockInventoryType.consumable
    )
    if stock.inventory_type != expected_inventory_type:
        raise HTTPException(status_code=400, detail="Selected stock has incompatible inventory type")
    if stock.item_id != request_item.item_id:
        raise HTTPException(status_code=400, detail="Selected stock does not match the requested item")
    if request_item.size and stock.size != request_item.size:
        raise HTTPException(status_code=400, detail="Selected stock does not match the requested size")
    if request_item.manufacturer and stock.manufacturer != request_item.manufacturer:
        raise HTTPException(status_code=400, detail="Selected stock does not match the requested manufacturer")
    if quantity > available_pairs(stock):
        raise HTTPException(status_code=400, detail="Not enough stock for the requested fulfillment quantity")

    destination_stock = await _add_stock_to_production_cell(
        db,
        source_stock=stock,
        quantity=quantity,
    )

    source_cell_id = stock.cell_id

    # ✅ Обновляем количество
    new_quantity = stock.pairs_quantity - quantity
    
    # ✅ Если остаток становится нулевым - удаляем его
    if new_quantity <= 0:
        await db.flush()
        await db.delete(stock)
        selected_stock_id = None
    else:
        stock.pairs_quantity = new_quantity
        selected_stock_id = stock_id
    
    request_item.fulfilled_quantity += quantity
    request_item.selected_stock_id = selected_stock_id or destination_stock.id
    request_item.selected_cell_id = source_cell_id


async def _fulfill_finished_goods_receipt(
    db: AsyncSession,
    *,
    request: ProductionSupplyRequest,
    request_item: ProductionSupplyRequestItem,
    cell_id: int | None,
    quantity: int,
    user_id: int | None,
) -> None:
    if not cell_id:
        raise HTTPException(status_code=400, detail="Select a target cell for finished goods receipt")
    if request.production_order is None:
        raise HTTPException(status_code=400, detail="Production order is missing for the task")

    production_order_item = request_item.production_order_item
    if production_order_item is None:
        raise HTTPException(status_code=400, detail="The warehouse receipt task is not linked to a production item")
    
    # ✅ Проверяем партию у позиции
    if not production_order_item.batch_number:
        raise HTTPException(status_code=400, detail="Assign a batch number to the production order item before receiving finished goods into stock")
    
    # Проверка ДО создания остатка
    remaining_to_transfer = _remaining_pairs_for_order_item(production_order_item)
    if quantity > remaining_to_transfer:
        raise HTTPException(
            status_code=400, 
            detail=f"Receipt quantity exceeds the available quantity for transfer. Available: {remaining_to_transfer}, requested: {quantity}"
        )

    # Получаем или создаем остаток
    stock = await _receive_finished_goods_to_stock(
        db,
        order=request.production_order,
        production_order_item=production_order_item,
        cell_id=cell_id,
        quantity=quantity,
        user_id=user_id,
    )
    
    # ✅ Проверяем, не стал ли остаток нулевым (если quantity было отрицательным)
    if stock and stock.pairs_quantity <= 0:
        await db.delete(stock)
        request_item.fulfilled_quantity += quantity
        request_item.selected_cell_id = cell_id
        request_item.selected_stock_id = None
    else:
        request_item.fulfilled_quantity += quantity
        request_item.selected_cell_id = cell_id
        request_item.selected_stock_id = stock.id if stock else None

# backend/app/services/production.py

async def _receive_finished_goods_to_stock(
    db: AsyncSession,
    *,
    order: ProductionOrder,
    production_order_item: ProductionOrderItem,
    cell_id: int,
    quantity: int,
    user_id: int | None,
) -> Stock | None:
    target_cell = await db.scalar(
        select(Cell)
        .options(selectinload(Cell.stocks))
        .where(Cell.id == cell_id)
    )
    if target_cell is None:
        raise HTTPException(status_code=404, detail="Cell not found")

    # Проверяем, что в ячейке нет других типов остатков
    incompatible_stock = next(
        (stock for stock in target_cell.stocks if stock.pairs_quantity > 0 and stock.inventory_type != StockInventoryType.finished_goods),
        None,
    )
    if incompatible_stock is not None:
        raise HTTPException(
            status_code=400, 
            detail=f"Finished goods cannot be transferred into a cell with another inventory type. Cell contains {incompatible_stock.inventory_type}"
        )

    item = production_order_item.item or await _get_item_or_404(db, production_order_item.item_id)
    
    # ✅ БЕРЁМ ДАННЫЕ ИЗ POSITION ЗАКАЗА
    stock_size = production_order_item.item_size or (item.size if item else None)
    stock_color = production_order_item.item_color or (item.color if item else None)
    stock_batch = order.batch_number or production_order_item.batch_number  # <-- важно!
    
    # Ищем существующий остаток с такими же характеристиками
    stock = await db.scalar(
        select(Stock).where(
            Stock.cell_id == cell_id,
            Stock.item_id == production_order_item.item_id,
            Stock.batch_number == stock_batch,
            Stock.size == stock_size,
            Stock.color == stock_color,
            Stock.venchik.is_(None),
            Stock.inventory_type == StockInventoryType.finished_goods,
            Stock.manufacturer.is_(None),
        )
    )
    
    if stock is None:
        stock = Stock(
            item_id=production_order_item.item_id,
            cell_id=cell_id,
            pairs_quantity=0,
            reserved_pairs=0,
            pairs_per_box=item.max_pairs_per_box,
            batch_number=stock_batch,        # ✅ партия
            size=stock_size,                 # ✅ размер
            color=stock_color,               # ✅ цвет
            venchik=None,
            inventory_type=StockInventoryType.finished_goods,
            manufacturer=None,
        )
        db.add(stock)
        await db.flush()

    # Добавляем количество
    stock.pairs_quantity += quantity
    
    # Если количество стало нулевым - удаляем остаток
    if stock.pairs_quantity <= 0:
        await db.delete(stock)
        await db.flush()
        return None
    
    # Обновляем переданное количество в позиции заказа
    production_order_item.transferred_pairs += quantity
    
    if production_order_item.produced_pairs < production_order_item.transferred_pairs:
        production_order_item.produced_pairs = production_order_item.transferred_pairs
    
    # Логируем перемещение
    db.add(
        ProductionTransfer(
            production_order_item_id=production_order_item.id,
            stock_id=stock.id,
            cell_id=cell_id,
            pairs_quantity=quantity,
            created_by_user_id=user_id,
        )
    )
    
    await db.flush()
    return stock


async def _consume_order_consumables(
    db: AsyncSession,
    *,
    order: ProductionOrder,
    allow_produced_fallback: bool,
) -> None:
    for request in order.supply_requests:
        if request.request_type != ProductionSupplyType.consumable:
            continue
        for request_item in request.items:
            target_quantity = await _planned_consumable_usage_for_item(
                db,
                order=order,
                request_item=request_item,
                allow_produced_fallback=allow_produced_fallback,
            )
            if target_quantity <= request_item.consumed_quantity:
                continue
            delta = target_quantity - request_item.consumed_quantity
            await _remove_consumables_from_production_cell(db, request_item=request_item, quantity=delta)
            request_item.consumed_quantity = target_quantity


async def _planned_consumable_usage_for_item(
    db: AsyncSession,
    *,
    order: ProductionOrder,
    request_item: ProductionSupplyRequestItem,
    allow_produced_fallback: bool,
) -> int:
    consumable_item = request_item.item or await _get_item_or_404(db, request_item.item_id)
    units_per_box = max(int(consumable_item.max_pairs_per_box or 0), 1)

    if request_item.production_order_item_id is not None:
        related_item = next(
            (item for item in order.items if item.id == request_item.production_order_item_id),
            None,
        )
        if related_item is None:
            return 0
        base_pairs = related_item.transferred_pairs
        if allow_produced_fallback:
            base_pairs = max(base_pairs, related_item.produced_pairs)
    else:
        transferred_pairs = sum(item.transferred_pairs for item in order.items)
        produced_pairs = sum(item.produced_pairs for item in order.items)
        base_pairs = transferred_pairs
        if allow_produced_fallback:
            base_pairs = max(base_pairs, produced_pairs)

    if base_pairs <= 0:
        return 0

    required_units = math.ceil(base_pairs / units_per_box)
    return min(required_units, request_item.fulfilled_quantity)


async def _remove_consumables_from_production_cell(
    db: AsyncSession,
    *,
    request_item: ProductionSupplyRequestItem,
    quantity: int,
) -> None:
    if quantity <= 0:
        return

    production_cell = await _get_or_create_production_cell(db)
    stocks = list(
        (
            await db.scalars(
                select(Stock)
                .where(
                    Stock.cell_id == production_cell.id,
                    Stock.item_id == request_item.item_id,
                    Stock.inventory_type == StockInventoryType.consumable,
                )
                .order_by(Stock.id.asc())
            )
        ).all()
    )
    if request_item.size:
        stocks = [stock for stock in stocks if stock.size == request_item.size]
    if request_item.manufacturer:
        stocks = [stock for stock in stocks if stock.manufacturer == request_item.manufacturer]

    available_total = sum(stock.pairs_quantity for stock in stocks)
    if available_total < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough consumables in production. Required: {quantity}, available: {available_total}",
        )

    remaining = quantity
    for stock in stocks:
        if remaining <= 0:
            break
        take = min(stock.pairs_quantity, remaining)
        stock.pairs_quantity -= take
        stock.reserved_pairs = 0
        remaining -= take
        if stock.pairs_quantity <= 0:
            await db.delete(stock)

async def _recalculate_production_order_status(order: ProductionOrder) -> None:
    resource_requests = _resource_supply_requests(order)
    all_supply_completed = bool(resource_requests) and all(
        request.status == ProductionSupplyStatus.completed for request in resource_requests
    )
    all_transferred = bool(order.items) and all(
        _remaining_pairs_for_order_item(item) == 0 for item in order.items
    )
    any_transferred = any(item.transferred_pairs > 0 for item in order.items)

    if all_transferred:
        order.status = ProductionOrderStatus.transferred
        return
    if any_transferred:
        order.status = ProductionOrderStatus.partially_transferred
        return
    if order.status in {ProductionOrderStatus.in_progress, ProductionOrderStatus.completed}:
        return
    if all_supply_completed:
        order.status = ProductionOrderStatus.ready_to_work
        return
    if resource_requests:
        order.status = ProductionOrderStatus.awaiting_resources
        return
    order.status = ProductionOrderStatus.pending


def _serialize_production_order(order: ProductionOrder) -> ProductionOrderResponse:
    active_chz_request = _get_active_production_chz_request(order.chz_requests)
    
    return ProductionOrderResponse(
        id=order.id,
        name=order.name,
        task_type=_normalize_production_task_type(order.task_type),
        status=order.status,
        priority=order.priority,
        comment=order.comment,
        related_order_id=order.related_order_id,
        related_order_name=order.related_order.name if order.related_order is not None else None,
        batch_number=order.batch_number,
        production_date=order.production_date,
        created_by_user_id=order.created_by_user_id,
        brigadier_user_id=order.brigadier_user_id,
        items=[
            ProductionOrderItemResponse(
                id=item.id,
                item_id=item.item_id,
                item_title=item.item.title if item.item is not None else f"Товар #{item.item_id}",
                item_size=item.item_size,
                item_color=item.item_color,
                pairs_quantity=item.pairs_quantity,
                produced_pairs=item.produced_pairs,
                transferred_pairs=item.transferred_pairs,
                batch_number=item.batch_number,           # <-- добавлено
                production_date=item.production_date,     # <-- добавлено
            )
            for item in order.items
        ],
        supply_requests=[
            ProductionSupplyRequestResponse(
                id=request.id,
                request_type=request.request_type,
                status=request.status,
                comment=request.comment,
                items=[
                    ProductionSupplyRequestItemResponse(
                        id=item.id,
                        item_id=item.item_id,
                        production_order_item_id=item.production_order_item_id,
                        item_title=item.item.title if item.item is not None else f"Товар #{item.item_id}",
                        item_size=item.item.size if item.item is not None else None,
                        quantity=item.quantity,
                        fulfilled_quantity=item.fulfilled_quantity,
                        size=item.size,
                        manufacturer=item.manufacturer,
                        selected_stock_id=item.selected_stock_id,
                        selected_cell_id=item.selected_cell_id,
                        selected_cell_location=_format_request_item_location(item),
                    )
                    for item in request.items
                ],
                created_at=request.created_at,
                updated_at=request.updated_at,
            )
            for request in order.supply_requests
        ],
        labor_entries=[
            ProductionLaborEntryResponse(
                id=entry.id,
                production_order_id=entry.production_order_id,
                employee_id=entry.employee_id,
                employee_name=entry.employee.full_name if entry.employee else None,
                work_date=entry.work_date,
                start_time=entry.start_time,
                end_time=entry.end_time,
                people_count=entry.people_count,
                comment=entry.comment,
                created_by_user_id=entry.created_by_user_id,
                created_at=entry.created_at,
            )
            for entry in sorted(order.labor_entries, key=lambda item: (item.work_date, item.start_time, item.id))
        ],
        active_chz_request=_serialize_production_chz_request(active_chz_request) if active_chz_request else None,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _get_active_production_chz_request(requests: Sequence[ProductionChzRequest]) -> ProductionChzRequest | None:
    active_requests = [
        request
        for request in requests
        if request.is_active and request.status != ProductionChzStatus.cancelled
    ]
    if not active_requests:
        return None
    return sorted(active_requests, key=lambda request: request.requested_at, reverse=True)[0]


def _serialize_production_chz_request(request: ProductionChzRequest) -> ProductionChzRequestResponse:
    return ProductionChzRequestResponse(
        id=request.id,
        production_order_id=request.production_order_id,
        order_name=request.order_name,
        requested_by_user_id=request.requested_by_user_id,
        requested_by_username=request.requested_by_username,
        request_type=request.request_type,
        status=request.status,
        is_active=request.is_active,
        comment=request.comment,
        external_request_id=request.external_request_id,
        requested_at=request.requested_at,
        acknowledged_at=request.acknowledged_at,
        ready_at=request.ready_at,
        items=[
            ProductionChzRequestItemResponse(
                id=item.id,
                production_order_item_id=item.production_order_item_id,
                item_id=item.item_id,
                pairs_quantity=item.pairs_quantity,
                item_title=item.item_title,
                item_size=item.item_size,
                item_color=item.item_color,
                batch_number=item.batch_number,
            )
            for item in request.items
        ],
    )


def _format_stock_location(stock: Stock | None) -> str | None:
    if stock is None or stock.cell is None:
        return None
    coord = f"{stock.cell.rack}-{stock.cell.tier}-{stock.cell.cell}"
    warehouse_name = stock.cell.warehouse.name if stock.cell.warehouse is not None else None
    return f"{warehouse_name} - {coord}" if warehouse_name else coord


def _format_cell_location(cell: Cell | None) -> str | None:
    if cell is None:
        return None
    coord = f"{cell.rack}-{cell.tier}-{cell.cell}"
    warehouse_name = cell.warehouse.name if cell.warehouse is not None else None
    return f"{warehouse_name} - {coord}" if warehouse_name else coord


def _format_request_item_location(item: ProductionSupplyRequestItem) -> str | None:
    return _format_stock_location(item.selected_stock) or _format_cell_location(item.selected_cell)


async def _push_production_chz_to_external_bridge(order: ProductionOrder, request: ProductionChzRequest) -> None:
    if not settings.chz_bridge_url:
        return

    endpoint = settings.chz_bridge_url.rstrip("/") + "/api/chz/requests"
    headers: dict[str, str] = {}
    if settings.chz_bridge_token_value:
        headers["X-CHZ-Token"] = settings.chz_bridge_token_value

    payload = {
        "request_id": request.id,
        "order_id": order.id,
        "order_name": order.name,
        "order_number": order.name,
        "customer": order.related_order.customer if order.related_order is not None else "Производство",
        "comment": request.comment,
        "request_type": "production",
        "requested_by_user_id": request.requested_by_user_id,
        "requested_by_username": request.requested_by.username if request.requested_by else None,
        "requested_at": request.requested_at.isoformat() if request.requested_at else None,
        "callback_path": "/integration/production-chz/requests",
        "items": [
            {
                "production_order_item_id": item.production_order_item_id,
                "item_id": item.item_id,
                "item_title": item.item_title,
                "item_size": item.item_size,
                "item_color": item.item_color,
                "batch_number": item.batch_number,
                "pairs_quantity": item.pairs_quantity,
            }
            for item in request.items
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.chz_request_timeout_seconds) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to push production CHZ request %s to external bridge", request.id)


async def get_audit_logs_for_production_order(db: AsyncSession, production_order_id: int):
    """Получить все аудит-логи, связанные с производственным заказом."""
    query = (
        select(AuditLog)
        .where(
            AuditLog.details['production_order_id'].cast(String) == str(production_order_id)
        )
        .order_by(AuditLog.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()
