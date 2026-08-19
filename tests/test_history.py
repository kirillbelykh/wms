from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import select

from backend.app.models.audit import AuditLog
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.order import Order
from backend.app.models.pick_operation import PickOperation
from backend.app.models.warehouse import Warehouse
from backend.app.models.stock import Stock

pytestmark = pytest.mark.asyncio


async def _seed_history_context(db_session):
    warehouse_a = Warehouse(name="Склад А")
    warehouse_b = Warehouse(name="Склад Б")
    db_session.add_all([warehouse_a, warehouse_b])
    await db_session.flush()

    from_cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse_a.id)
    to_cell = Cell(rack=2, tier=1, cell=3, warehouse_id=warehouse_b.id)
    db_session.add_all([from_cell, to_cell])
    await db_session.flush()

    item = Item(
        title="Хир",
        name="Хирургические",
        product_type="gloves",
        size="7,0",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    return warehouse_a, warehouse_b, from_cell, to_cell, item


async def test_history_enriches_move_details(client, db_session, admin_user, auth_headers):
    warehouse_a, warehouse_b, from_cell, to_cell, item = await _seed_history_context(db_session)

    log = AuditLog(
        operation_type="move",
        user_id=admin_user.id,
        item_id=item.id,
        cell_id=from_cell.id,
        warehouse_id=warehouse_a.id,
        quantity=25,
        details={"from_cell_id": from_cell.id, "to_cell_id": to_cell.id},
        created_at=datetime(2026, 6, 19, 9, 0, 0),
    )
    db_session.add(log)
    await db_session.commit()

    response = await client.get("/history", headers=auth_headers, params={"operation_type": "move"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert len(payload["items"]) == 1
    details = payload["items"][0]["details"]
    assert details["from_cell"] == "1-1-1"
    assert details["to_cell"] == "2-1-3"
    assert details["from_warehouse"] == warehouse_a.name
    assert details["to_warehouse"] == warehouse_b.name


async def test_history_returns_paginated_response(client, db_session, admin_user, auth_headers):
    warehouse, _, from_cell, _, item = await _seed_history_context(db_session)

    first = AuditLog(
        operation_type="replenish",
        user_id=admin_user.id,
        item_id=item.id,
        cell_id=from_cell.id,
        warehouse_id=warehouse.id,
        quantity=10,
        created_at=datetime(2026, 6, 19, 7, 0, 0),
    )
    second = AuditLog(
        operation_type="withdraw",
        user_id=admin_user.id,
        item_id=item.id,
        cell_id=from_cell.id,
        warehouse_id=warehouse.id,
        quantity=5,
        created_at=datetime(2026, 6, 19, 8, 0, 0),
    )
    third = AuditLog(
        operation_type="move",
        user_id=admin_user.id,
        item_id=item.id,
        cell_id=from_cell.id,
        warehouse_id=warehouse.id,
        quantity=3,
        details={"from_cell_id": from_cell.id, "to_cell_id": from_cell.id},
        created_at=datetime(2026, 6, 19, 9, 0, 0),
    )
    db_session.add_all([first, second, third])
    await db_session.commit()

    response = await client.get("/history", headers=auth_headers, params={"limit": 2, "offset": 1})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert payload["limit"] == 2
    assert payload["offset"] == 1
    assert len(payload["items"]) == 2
    assert [item["id"] for item in payload["items"]] == [second.id, first.id]


async def test_auth_me_includes_role_permissions(client, auth_headers):
    response = await client.get("/auth/me", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert "manage_roles" in payload["permissions"]
    assert "view_marking" in payload["permissions"]


async def test_rollback_create_order_soft_deletes_order(client, db_session, auth_headers):
    _, _, cell, _, item = await _seed_history_context(db_session)
    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=100,
        reserved_pairs=0,
        pairs_per_box=100,
        batch_number="260101",
        size=item.size,
        color=item.color,
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    create_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ROLLBACK-ORDER",
            "customer": "Rollback Clinic",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 10}],
        },
    )
    assert create_response.status_code == 201
    order_id = create_response.json()["id"]

    history_response = await client.get("/history", headers=auth_headers, params={"operation_type": "create_order"})
    assert history_response.status_code == 200
    log = history_response.json()["items"][0]
    assert log["can_rollback"] is True

    rollback_response = await client.post(f"/history/{log['id']}/rollback", headers=auth_headers)
    assert rollback_response.status_code == 200

    order = await db_session.get(Order, order_id)
    assert order is not None
    assert order.is_deleted is True


async def test_rollback_pick_restores_stock_and_order_progress(client, db_session, auth_headers):
    _, _, cell, _, item = await _seed_history_context(db_session)
    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=100,
        reserved_pairs=0,
        pairs_per_box=100,
        batch_number="260101",
        size=item.size,
        color=item.color,
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    create_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ROLLBACK-PICK",
            "customer": "Rollback Clinic",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 50}],
        },
    )
    assert create_response.status_code == 201
    order_payload = create_response.json()
    order_item_id = order_payload["items"][0]["id"]

    pick_response = await client.post(
        "/picking/pick",
        headers=auth_headers,
        json={"order_item_id": order_item_id, "stock_id": stock.id, "pairs_quantity": 20},
    )
    assert pick_response.status_code == 200

    history_response = await client.get("/history", headers=auth_headers, params={"operation_type": "pick"})
    assert history_response.status_code == 200
    log = history_response.json()["items"][0]
    assert log["can_rollback"] is True

    rollback_response = await client.post(f"/history/{log['id']}/rollback", headers=auth_headers)
    assert rollback_response.status_code == 200

    await db_session.refresh(stock)
    assert stock.pairs_quantity == 100
    assert (await db_session.scalar(select(PickOperation).where(PickOperation.order_item_id == order_item_id))) is None

    order_response = await client.get(f"/orders/{order_payload['id']}", headers=auth_headers)
    assert order_response.status_code == 200
    item_payload = order_response.json()["items"][0]
    assert item_payload["picked_pairs"] == 0
    assert item_payload["status"] == "pending"


async def test_update_suggested_stock_does_not_create_history_log(client, db_session, auth_headers):
    warehouse_a, warehouse_b, from_cell, to_cell, item = await _seed_history_context(db_session)

    first_stock = Stock(
        item_id=item.id,
        cell_id=from_cell.id,
        pairs_quantity=50,
        reserved_pairs=0,
        pairs_per_box=50,
        batch_number="260801",
        size=item.size,
        color=item.color,
    )
    second_stock = Stock(
        item_id=item.id,
        cell_id=to_cell.id,
        pairs_quantity=50,
        reserved_pairs=0,
        pairs_per_box=50,
        batch_number="260802",
        size=item.size,
        color=item.color,
    )
    db_session.add_all([first_stock, second_stock])
    await db_session.commit()
    await db_session.refresh(first_stock)
    await db_session.refresh(second_stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "NO-HISTORY-SUGGESTED-STOCK",
            "customer": "Clinic Route",
            "approved": True,
            "items": [{"stock_id": first_stock.id, "pairs_quantity": 10}],
        },
    )
    assert order_response.status_code == 201
    order_payload = order_response.json()

    update_response = await client.patch(
        f"/orders/{order_payload['id']}/items/{order_payload['items'][0]['id']}/suggested-stock",
        headers=auth_headers,
        json={"stock_id": second_stock.id},
    )
    assert update_response.status_code == 200

    audit_logs = (
        await db_session.scalars(
            select(AuditLog).where(
                AuditLog.operation_type == "update_suggested_stock",
                AuditLog.details["order_id"].as_integer() == order_payload["id"],
            )
        )
    ).all()
    assert audit_logs == []
