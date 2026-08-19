from __future__ import annotations

from sqlalchemy import func, select

from backend.app.models.audit import AuditLog
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.order import Order, OrderItem, OrderItemStatus, OrderStatus
from backend.app.models.pick_operation import PickOperation
from backend.app.models.production import (
    ProductionOrder,
    ProductionOrderItem,
    ProductionSupplyRequest,
    ProductionSupplyRequestItem,
    ProductionSupplyStatus,
    ProductionSupplyType,
    ProductionTransfer,
)
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse


async def _create_stock(db_session, *, name: str = "Bulk Stock") -> Stock:
    warehouse = Warehouse(name=f"{name} Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(cell)
    await db_session.flush()

    item = Item(
        title=name,
        name=f"{name} M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=100,
        reserved_pairs=0,
        pairs_per_box=100,
        batch_number="260701",
        size="M",
        color="natural",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)
    return stock


async def test_bulk_stock_delete_is_atomic_when_any_stock_is_missing(client, db_session, auth_headers):
    stock = await _create_stock(db_session, name="Atomic Bulk")

    response = await client.post(
        "/stocks/bulk-delete",
        headers=auth_headers,
        json={"stock_ids": [stock.id, stock.id + 999]},
    )

    assert response.status_code == 404
    remaining_count = await db_session.scalar(select(func.count(Stock.id)).where(Stock.id == stock.id))
    assert remaining_count == 1

    audit_count = await db_session.scalar(
        select(func.count(AuditLog.id)).where(AuditLog.operation_type == "delete_stock")
    )
    assert audit_count == 0


async def test_bulk_stock_delete_clears_references_and_keeps_audit(client, db_session, auth_headers):
    stock = await _create_stock(db_session, name="Referenced Bulk")
    stock_id = stock.id
    stock_cell_id = stock.cell_id
    item = await db_session.get(Item, stock.item_id)
    assert item is not None

    order = Order(
        name="order-with-stock-ref",
        status=OrderStatus.picking,
        customer="Test customer",
        approved=True,
    )
    db_session.add(order)
    await db_session.flush()
    order_id = order.id

    order_item = OrderItem(
        order_id=order.id,
        item_id=item.id,
        pairs_quantity=100,
        picked_pairs=0,
        status=OrderItemStatus.pending,
        suggested_stock_id=stock_id,
    )
    db_session.add(order_item)
    await db_session.flush()
    order_item_id = order_item.id

    production_order = ProductionOrder(name="production-with-stock-ref")
    db_session.add(production_order)
    await db_session.flush()

    production_item = ProductionOrderItem(
        production_order_id=production_order.id,
        item_id=item.id,
        pairs_quantity=100,
    )
    db_session.add(production_item)
    await db_session.flush()

    supply_request = ProductionSupplyRequest(
        production_order_id=production_order.id,
        request_type=ProductionSupplyType.raw_material,
        status=ProductionSupplyStatus.requested,
    )
    db_session.add(supply_request)
    await db_session.flush()

    supply_item = ProductionSupplyRequestItem(
        request_id=supply_request.id,
        item_id=item.id,
        production_order_item_id=production_item.id,
        quantity=100,
        selected_stock_id=stock_id,
    )
    transfer = ProductionTransfer(
        production_order_item_id=production_item.id,
        stock_id=stock_id,
        cell_id=stock_cell_id,
        pairs_quantity=100,
    )
    pick_operation = PickOperation(
        order_item_id=order_item.id,
        stock_id=stock_id,
        cell_id=stock_cell_id,
        item_id=item.id,
        pairs_quantity=10,
    )
    db_session.add_all([supply_item, transfer, pick_operation])
    await db_session.commit()
    supply_item_id = supply_item.id
    transfer_id = transfer.id
    pick_operation_id = pick_operation.id

    response = await client.post(
        "/stocks/bulk-delete",
        headers=auth_headers,
        json={"stock_ids": [stock_id]},
    )

    assert response.status_code == 200
    assert response.json() == {"deleted_count": 1, "stock_ids": [stock_id]}

    db_session.expire_all()
    remaining_count = await db_session.scalar(select(func.count(Stock.id)).where(Stock.id == stock_id))
    assert remaining_count == 0

    refreshed_order = await db_session.get(Order, order_id)
    refreshed_order_item = await db_session.get(OrderItem, order_item_id)
    refreshed_supply_item = await db_session.get(ProductionSupplyRequestItem, supply_item_id)
    refreshed_transfer = await db_session.get(ProductionTransfer, transfer_id)
    refreshed_pick_operation = await db_session.get(PickOperation, pick_operation_id)

    assert refreshed_order is not None
    assert refreshed_order.status == OrderStatus.pending
    assert refreshed_order_item is not None
    assert refreshed_order_item.suggested_stock_id is None
    assert refreshed_supply_item is not None
    assert refreshed_supply_item.selected_stock_id is None
    assert refreshed_transfer is not None
    assert refreshed_transfer.stock_id is None
    assert refreshed_pick_operation is not None
    assert refreshed_pick_operation.stock_id is None

    audit_log = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.operation_type == "delete_stock",
            AuditLog.details["source_stock_id"].as_integer() == stock_id,
        )
    )
    assert audit_log is not None
    assert audit_log.stock_id is None
