from __future__ import annotations

import pytest
from sqlalchemy import func, select

from backend.app.models.audit import AuditLog
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def _seed_order_for_picking(client, db_session, auth_headers) -> tuple[int, int, int]:
    warehouse = Warehouse(name="Picking Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(cell)
    await db_session.flush()

    item = Item(
        title="хир с полимерным",
        name="Хирургические с полимерным покрытием",
        product_type="gloves",
        size="7,0",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=120,
        reserved_pairs=0,
        pairs_per_box=100,
        batch_number="260101",
        size="7,0",
        color="blue",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-PICK",
            "customer": "Clinic Pick",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 100}],
        },
    )
    assert order_response.status_code == 201

    order_payload = order_response.json()
    return order_payload["id"], order_payload["items"][0]["id"], stock.id


async def test_partial_picking_updates_progress_and_cancel_restores_stock(client, db_session, auth_headers):
    order_id, order_item_id, stock_id = await _seed_order_for_picking(client, db_session, auth_headers)

    pick_response = await client.post(
        "/picking/pick",
        headers=auth_headers,
        json={
            "order_item_id": order_item_id,
            "stock_id": stock_id,
            "pairs_quantity": 40,
        },
    )

    assert pick_response.status_code == 200
    assert pick_response.json()["picked_pairs"] == 40
    assert pick_response.json()["remaining_to_pick"] == 60
    assert pick_response.json()["stock_remaining"] == 80
    assert pick_response.json()["is_completed"] is False

    picking_list_response = await client.get(f"/orders/{order_id}/picking-list", headers=auth_headers)
    assert picking_list_response.status_code == 200
    assert picking_list_response.json()[0]["picked_pairs"] == 40
    assert picking_list_response.json()[0]["pairs_required"] == 60
    assert picking_list_response.json()[0]["suggested_cell_location"] == "Picking Warehouse - 1-1-1"

    operations_response = await client.get(
        f"/picking/orders/{order_id}/pick-operations",
        headers=auth_headers,
    )
    assert operations_response.status_code == 200
    assert len(operations_response.json()) == 1

    cancel_response = await client.post(f"/picking/{order_id}/cancel", headers=auth_headers)
    assert cancel_response.status_code == 200
    assert cancel_response.json()["message"] == "Picking cancelled"

    stock_response = await client.get(f"/stocks/{stock_id}", headers=auth_headers)
    assert stock_response.status_code == 200
    assert stock_response.json()["pairs_quantity"] == 120
    assert stock_response.json()["reserved_pairs"] == 0

    order_response = await client.get(f"/orders/{order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    order_payload = order_response.json()
    assert order_payload["status"] == "pending"
    assert order_payload["items"][0]["picked_pairs"] == 0
    assert order_payload["items"][0]["status"] == "pending"

    operations_after_cancel = await client.get(
        f"/picking/orders/{order_id}/pick-operations",
        headers=auth_headers,
    )
    assert operations_after_cancel.status_code == 200
    assert operations_after_cancel.json() == []


async def test_start_picking_endpoint_updates_order_status_and_audit(client, db_session, auth_headers):
    order_id, _, _ = await _seed_order_for_picking(client, db_session, auth_headers)

    start_response = await client.post(f"/picking/{order_id}/start", headers=auth_headers)
    assert start_response.status_code == 200
    assert start_response.json()["status"] == "picking"

    audit_logs_count = await db_session.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.operation_type == "start_picking",
            AuditLog.details["order_id"].as_integer() == order_id,
        )
    )
    assert audit_logs_count == 1


async def test_complete_partial_picking_marks_order_partially_packed(client, db_session, auth_headers):
    order_id, order_item_id, stock_id = await _seed_order_for_picking(client, db_session, auth_headers)

    pick_response = await client.post(
        "/picking/pick",
        headers=auth_headers,
        json={
            "order_item_id": order_item_id,
            "stock_id": stock_id,
            "pairs_quantity": 40,
        },
    )
    assert pick_response.status_code == 200

    complete_response = await client.post(f"/picking/{order_id}/complete", headers=auth_headers)
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "partially_packed"

    order_response = await client.get(f"/orders/{order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    assert order_response.json()["status"] == "partially_packed"


async def test_full_picking_of_last_stock_does_not_break_audit_log(client, db_session, auth_headers):
    warehouse = Warehouse(name="Picking Warehouse Exact")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=2, warehouse_id=warehouse.id)
    db_session.add(cell)
    await db_session.flush()

    item = Item(
        title="Хир с полимерным",
        name="Хирургические с полимерным покрытием",
        product_type="gloves",
        size="7,0",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=50,
        reserved_pairs=0,
        pairs_per_box=50,
        batch_number="260202",
        size="7,0",
        color="blue",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-PICK-EXACT",
            "customer": "Clinic Exact",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 50}],
        },
    )
    assert order_response.status_code == 201
    order_payload = order_response.json()
    order_item_id = order_payload["items"][0]["id"]

    pick_response = await client.post(
        "/picking/pick",
        headers=auth_headers,
        json={
            "order_item_id": order_item_id,
            "stock_id": stock.id,
            "pairs_quantity": 50,
        },
    )

    assert pick_response.status_code == 200
    assert pick_response.json()["picked_pairs"] == 50
    assert pick_response.json()["remaining_to_pick"] == 0
    assert pick_response.json()["stock_remaining"] == 0
    assert pick_response.json()["is_completed"] is True

    stock_response = await client.get(f"/stocks/{stock.id}", headers=auth_headers)
    assert stock_response.status_code == 404

    audit_logs_count = await db_session.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.operation_type == "pick",
            AuditLog.details["order_item_id"].as_integer() == order_item_id,
        )
    )
    assert audit_logs_count == 1


async def test_full_stock_withdraw_does_not_keep_deleted_stock_fk(client, db_session, auth_headers):
    warehouse = Warehouse(name="Withdraw Warehouse Exact")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=3, warehouse_id=warehouse.id)
    db_session.add(cell)
    await db_session.flush()

    item = Item(
        title="стер латекс",
        name="Стер латекс M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=125,
    )
    db_session.add(item)
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=1000,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260202",
        size="M",
        color="natural",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    withdraw_response = await client.post(
        f"/stocks/{stock.id}/withdraw",
        headers=auth_headers,
        json={"pairs_quantity": 1000},
    )

    assert withdraw_response.status_code == 200

    stock_response = await client.get(f"/stocks/{stock.id}", headers=auth_headers)
    assert stock_response.status_code == 404

    audit_log = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.operation_type == "stock_withdraw",
            AuditLog.details["source_stock_id"].as_integer() == stock.id,
        )
    )
    assert audit_log is not None
    assert audit_log.stock_id is None


async def test_full_stock_move_does_not_keep_deleted_stock_fk(client, db_session, auth_headers):
    warehouse = Warehouse(name="Move Warehouse Exact")
    db_session.add(warehouse)
    await db_session.flush()

    from_cell = Cell(rack=1, tier=1, cell=4, warehouse_id=warehouse.id)
    to_cell = Cell(rack=1, tier=1, cell=5, warehouse_id=warehouse.id)
    db_session.add_all([from_cell, to_cell])
    await db_session.flush()

    item = Item(
        title="стер латекс",
        name="Стер латекс M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=125,
    )
    db_session.add(item)
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=from_cell.id,
        pairs_quantity=300,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260303",
        size="M",
        color="natural",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    move_response = await client.post(
        f"/stocks/{stock.id}/move",
        headers=auth_headers,
        json={"to_cell_id": to_cell.id, "pairs_quantity": 300},
    )

    assert move_response.status_code == 200
    assert move_response.json()["from_stock_deleted"] is True

    source_response = await client.get(f"/stocks/{stock.id}", headers=auth_headers)
    assert source_response.status_code == 404

    target_stock = await db_session.scalar(
        select(Stock).where(
            Stock.cell_id == to_cell.id,
            Stock.item_id == item.id,
        )
    )
    assert target_stock is not None
    assert target_stock.pairs_quantity == 300

    audit_log = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.operation_type == "move",
            AuditLog.details["source_stock_id"].as_integer() == stock.id,
        )
    )
    assert audit_log is not None
    assert audit_log.stock_id is None
