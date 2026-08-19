from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def _seed_stock(db_session, *, pairs_quantity: int = 200) -> Stock:
    warehouse = Warehouse(name="Main Warehouse")
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
        pairs_quantity=pairs_quantity,
        reserved_pairs=0,
        pairs_per_box=100,
        batch_number="260101",
        size="7,0",
        color="blue",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)
    return stock


async def test_create_order_uses_suggestions_without_reserving_stock_and_filters_by_shipping_date(client, db_session, auth_headers):
    stock = await _seed_stock(db_session, pairs_quantity=200)

    first_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-001",
            "customer": "Clinic A",
            "approved": True,
            "shipping_date": datetime(2026, 6, 17, 22, 30, tzinfo=UTC).isoformat(),
            "items": [{"stock_id": stock.id, "pairs_quantity": 50}],
        },
    )
    second_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-002",
            "customer": "Clinic B",
            "approved": False,
            "shipping_date": datetime(2026, 6, 19, 22, 30, tzinfo=UTC).isoformat(),
            "items": [{"stock_id": stock.id, "pairs_quantity": 60}],
        },
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    filtered = await client.get(
        "/orders",
        headers=auth_headers,
        params={
            "approved": "true",
            "shipping_date": "2026-06-18",
        },
    )

    assert filtered.status_code == 200
    payload = filtered.json()
    assert len(payload) == 1
    assert payload[0]["name"] == "ORD-001"
    assert payload[0]["shipping_date"] == "2026-06-18T01:30:00"
    assert payload[0]["items"][0]["suggested_cell_location"] == "Main Warehouse - 1-1-1"

    await db_session.refresh(stock)
    assert stock.reserved_pairs == 0


async def test_unapproved_order_cannot_switch_to_picking_status(client, db_session, auth_headers):
    stock = await _seed_stock(db_session, pairs_quantity=100)
    response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-UNAPPROVED",
            "customer": "Clinic C",
            "approved": False,
            "items": [{"stock_id": stock.id, "pairs_quantity": 20}],
        },
    )
    assert response.status_code == 201

    order_id = response.json()["id"]
    update_response = await client.patch(
        f"/orders/{order_id}",
        headers=auth_headers,
        json={"status": "picking"},
    )

    assert update_response.status_code == 400
    assert "unapproved order" in update_response.json()["detail"]


async def test_order_dates_are_normalized_to_msk_naive(client, db_session, auth_headers):
    stock = await _seed_stock(db_session, pairs_quantity=100)

    create_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-TZ",
            "customer": "Clinic TZ",
            "approved": True,
            "shipping_date": "2026-06-20T00:00:00+03:00",
            "items": [{"stock_id": stock.id, "pairs_quantity": 10}],
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["shipping_date"] == "2026-06-20T00:00:00"

    update_response = await client.patch(
        f"/orders/{payload['id']}",
        headers=auth_headers,
        json={"actual_shipping_date": "2026-06-20T07:15:00+00:00"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["actual_shipping_date"] == "2026-06-20T10:15:00"


async def test_create_order_item_without_stock_marks_position_as_waiting_for_production(client, db_session, auth_headers):
    warehouse = Warehouse(name="Future Warehouse")
    db_session.add(warehouse)
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
    await db_session.commit()
    await db_session.refresh(item)

    response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-PROD",
            "customer": "Clinic Waiting",
            "approved": True,
            "items": [{"item_id": item.id, "pairs_quantity": 40}],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["items"][0]["suggested_stock_id"] is None
    assert payload["items"][0]["suggested_cell_location"] is None
    assert payload["items"][0]["waiting_for_production"] is True


async def test_waiting_order_item_is_reserved_after_matching_stock_replenishment(client, db_session, auth_headers):
    warehouse = Warehouse(name="Reserve Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(cell)
    await db_session.flush()

    item = Item(
        title="хир с полимерным",
        name="Хир с полимерным 7,0",
        product_type="gloves",
        size="7,0",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    create_order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-RESERVE",
            "customer": "Clinic Reserve",
            "approved": True,
            "items": [{"item_id": item.id, "pairs_quantity": 50}],
        },
    )
    assert create_order_response.status_code == 201
    order_id = create_order_response.json()["id"]

    replenish_response = await client.post(
        f"/stocks/cell/{cell.id}",
        headers=auth_headers,
        json={
            "item_id": item.id,
            "pairs_quantity": 100,
            "pairs_per_box": 100,
            "batch_number": "260101",
            "size": "7,0",
            "color": "blue",
        },
    )
    assert replenish_response.status_code == 201

    order_response = await client.get(f"/orders/{order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    payload = order_response.json()
    assert payload["items"][0]["waiting_for_production"] is False
    assert payload["items"][0]["suggested_stock_id"] == replenish_response.json()["id"]
    assert payload["items"][0]["suggested_cell_location"] == "Reserve Warehouse - 1-1-1"


async def test_packed_order_can_be_shipped_and_gets_actual_shipping_date(client, db_session, auth_headers):
    stock = await _seed_stock(db_session, pairs_quantity=100)

    create_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-SHIP",
            "customer": "Clinic Ship",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 100}],
        },
    )
    assert create_response.status_code == 201
    order_payload = create_response.json()
    order_id = order_payload["id"]
    order_item_id = order_payload["items"][0]["id"]

    pick_response = await client.post(
        "/picking/pick",
        headers=auth_headers,
        json={
            "order_item_id": order_item_id,
            "stock_id": stock.id,
            "pairs_quantity": 100,
        },
    )
    assert pick_response.status_code == 200

    complete_response = await client.post(f"/picking/{order_id}/complete", headers=auth_headers)
    assert complete_response.status_code == 200

    ship_response = await client.post(f"/orders/{order_id}/ship", headers=auth_headers)
    assert ship_response.status_code == 200
    shipped_payload = ship_response.json()
    assert shipped_payload["status"] == "shipped"
    assert shipped_payload["actual_shipping_date"] is not None
