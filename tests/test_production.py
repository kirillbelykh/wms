from __future__ import annotations

import pytest

from backend.app.models.cell import Cell
from backend.app.models.item import Item, ItemInventoryType
from backend.app.models.stock import Stock, StockInventoryType
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def test_production_supply_request_fulfillment_moves_order_to_ready(client, db_session, auth_headers):
    warehouse = Warehouse(name="Production Resources")
    db_session.add(warehouse)
    await db_session.flush()

    resource_cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(resource_cell)
    await db_session.flush()

    raw_item = Item(
        title="стер латекс",
        name="Стер латекс M",
        product_type="gloves",
        size="M",
        color="natural",
        inventory_type=ItemInventoryType.raw_material,
        max_pairs_per_box=125,
    )
    finished_item = Item(
        title="стер латекс",
        name="Стер латекс готовый M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=125,
    )
    db_session.add_all([raw_item, finished_item])
    await db_session.flush()

    raw_stock = Stock(
        item_id=raw_item.id,
        cell_id=resource_cell.id,
        pairs_quantity=500,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260101",
        size="M",
        color="natural",
        inventory_type=StockInventoryType.raw_material,
        manufacturer="Бенови",
    )
    db_session.add(raw_stock)
    await db_session.commit()
    await db_session.refresh(raw_stock)

    create_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-001",
            "priority": 7,
            "items": [{"item_id": finished_item.id, "pairs_quantity": 300}],
        },
    )
    assert create_response.status_code == 200
    production_order_id = create_response.json()["id"]

    supply_response = await client.post(
        f"/production-orders/{production_order_id}/supply-requests",
        headers=auth_headers,
        json={
            "request_type": "raw_material",
            "comment": "Нужно сырье для партии",
            "items": [{"item_id": raw_item.id, "quantity": 300, "size": "M", "manufacturer": "Бенови"}],
        },
    )
    assert supply_response.status_code == 200
    order_after_supply = await client.get(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert order_after_supply.status_code == 200
    request_payload = order_after_supply.json()["supply_requests"][0]

    fulfill_response = await client.post(
        f"/production-orders/supply-requests/{request_payload['id']}/fulfill",
        headers=auth_headers,
        json={
            "items": [
                {
                    "request_item_id": request_payload["items"][0]["id"],
                    "stock_id": raw_stock.id,
                    "quantity": 300,
                }
            ]
        },
    )
    assert fulfill_response.status_code == 200
    fulfilled_payload = fulfill_response.json()
    assert fulfilled_payload["status"] == "ready_to_work"
    assert fulfilled_payload["supply_requests"][0]["status"] == "completed"


async def test_production_transfer_reserves_waiting_sales_order(client, db_session, auth_headers):
    warehouse = Warehouse(name="Finished Goods")
    db_session.add(warehouse)
    await db_session.flush()

    finished_cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(finished_cell)
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

    sales_order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-FUTURE",
            "customer": "Clinic Future",
            "approved": True,
            "items": [{"item_id": item.id, "pairs_quantity": 20}],
        },
    )
    assert sales_order_response.status_code == 201
    sales_order_id = sales_order_response.json()["id"]

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-RESERVE",
            "priority": 8,
            "items": [{"item_id": item.id, "pairs_quantity": 20}],
        },
    )
    assert production_response.status_code == 200
    production_payload = production_response.json()
    production_order_id = production_payload["id"]
    production_order_item_id = production_payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260201", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    transfer_response = await client.post(
        f"/production-orders/{production_order_id}/transfer",
        headers=auth_headers,
        json={
            "production_order_item_id": production_order_item_id,
            "cell_id": finished_cell.id,
            "pairs_quantity": 20,
        },
    )
    assert transfer_response.status_code == 200
    assert transfer_response.json()["status"] == "transferred"

    updated_sales_order = await client.get(f"/orders/{sales_order_id}", headers=auth_headers)
    assert updated_sales_order.status_code == 200
    sales_payload = updated_sales_order.json()
    assert sales_payload["items"][0]["waiting_for_production"] is False
    assert sales_payload["items"][0]["suggested_cell_location"] == "Finished Goods - 1-1-1"


async def test_production_partial_transfer_stays_partially_transferred(client, db_session, auth_headers):
    warehouse = Warehouse(name="Finished Goods Partial")
    db_session.add(warehouse)
    await db_session.flush()

    finished_cell = Cell(rack=1, tier=1, cell=2, warehouse_id=warehouse.id)
    db_session.add(finished_cell)
    await db_session.flush()

    item = Item(
        title="Partial transfer gloves",
        name="Partial transfer gloves 7,5",
        product_type="gloves",
        size="7,5",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-PARTIAL-TRANSFER",
            "priority": 8,
            "items": [{"item_id": item.id, "pairs_quantity": 20}],
        },
    )
    assert production_response.status_code == 200
    payload = production_response.json()
    production_order_id = payload["id"]
    production_order_item_id = payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260221", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    produced_response = await client.patch(
        f"/production-orders/{production_order_id}/items/{production_order_item_id}/produced",
        headers=auth_headers,
        json={"produced_pairs": 20},
    )
    assert produced_response.status_code == 200

    transfer_response = await client.post(
        f"/production-orders/{production_order_id}/transfer",
        headers=auth_headers,
        json={
            "production_order_item_id": production_order_item_id,
            "cell_id": finished_cell.id,
            "pairs_quantity": 10,
        },
    )
    assert transfer_response.status_code == 200
    assert transfer_response.json()["status"] == "partially_transferred"


async def test_production_can_be_completed_after_full_transfer(client, db_session, auth_headers):
    warehouse = Warehouse(name="Finished Goods Complete")
    db_session.add(warehouse)
    await db_session.flush()

    finished_cell = Cell(rack=1, tier=1, cell=3, warehouse_id=warehouse.id)
    db_session.add(finished_cell)
    await db_session.flush()

    item = Item(
        title="Transfer complete gloves",
        name="Transfer complete gloves 8,0",
        product_type="gloves",
        size="8,0",
        color="white",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-COMPLETE-AFTER-TRANSFER",
            "priority": 9,
            "items": [{"item_id": item.id, "pairs_quantity": 20}],
        },
    )
    assert production_response.status_code == 200
    payload = production_response.json()
    production_order_id = payload["id"]
    production_order_item_id = payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260222", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    transfer_response = await client.post(
        f"/production-orders/{production_order_id}/transfer",
        headers=auth_headers,
        json={
            "production_order_item_id": production_order_item_id,
            "cell_id": finished_cell.id,
            "pairs_quantity": 20,
        },
    )
    assert transfer_response.status_code == 200
    assert transfer_response.json()["status"] == "transferred"

    complete_response = await client.post(
        f"/production-orders/{production_order_id}/complete",
        headers=auth_headers,
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "completed"


async def test_production_order_rejects_non_finished_goods_items(client, db_session, auth_headers):
    raw_item = Item(
        title="Latex raw",
        name="Latex raw M",
        product_type="gloves",
        size="M",
        color="natural",
        inventory_type=ItemInventoryType.raw_material,
        max_pairs_per_box=125,
    )
    db_session.add(raw_item)
    await db_session.commit()
    await db_session.refresh(raw_item)

    response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-RAW",
            "priority": 5,
            "items": [{"item_id": raw_item.id, "pairs_quantity": 100}],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only finished goods can be added to a production order"


async def test_supply_request_rejects_items_with_wrong_inventory_type(client, db_session, auth_headers):
    finished_item = Item(
        title="Ster latex",
        name="Ster latex M",
        product_type="gloves",
        size="M",
        color="natural",
        inventory_type=ItemInventoryType.finished_goods,
        max_pairs_per_box=125,
    )
    consumable_item = Item(
        title="Box",
        name="Box corrugated",
        product_type="packing",
        size="",
        color="",
        inventory_type=ItemInventoryType.consumable,
        max_pairs_per_box=1,
    )
    db_session.add_all([finished_item, consumable_item])
    await db_session.commit()
    await db_session.refresh(finished_item)
    await db_session.refresh(consumable_item)

    create_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-TYPES",
            "priority": 5,
            "items": [{"item_id": finished_item.id, "pairs_quantity": 100}],
        },
    )
    assert create_response.status_code == 200
    production_order_id = create_response.json()["id"]

    response = await client.post(
        f"/production-orders/{production_order_id}/supply-requests",
        headers=auth_headers,
        json={
            "request_type": "raw_material",
            "items": [{"item_id": consumable_item.id, "quantity": 10}],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Selected item has incompatible inventory type"


async def test_production_item_progress_limits_transfer_when_fact_is_set(client, db_session, auth_headers):
    warehouse = Warehouse(name="Finished Goods Progress")
    db_session.add(warehouse)
    await db_session.flush()

    finished_cell = Cell(rack=1, tier=1, cell=2, warehouse_id=warehouse.id)
    db_session.add(finished_cell)
    await db_session.flush()

    item = Item(
        title="С…РёСЂ СЃ РїРѕР»РёРјРµСЂРЅС‹Рј",
        name="РҐРёСЂ СЃ РїРѕР»РёРјРµСЂРЅС‹Рј 8,0",
        product_type="gloves",
        size="8,0",
        color="blue",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-PROGRESS",
            "priority": 6,
            "items": [{"item_id": item.id, "pairs_quantity": 20}],
        },
    )
    assert production_response.status_code == 200
    production_payload = production_response.json()
    production_order_id = production_payload["id"]
    production_order_item_id = production_payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260220", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    produced_response = await client.patch(
        f"/production-orders/{production_order_id}/items/{production_order_item_id}/produced",
        headers=auth_headers,
        json={"produced_pairs": 5},
    )
    assert produced_response.status_code == 200
    assert produced_response.json()["items"][0]["produced_pairs"] == 5

    too_large_transfer = await client.post(
        f"/production-orders/{production_order_id}/transfer",
        headers=auth_headers,
        json={
            "production_order_item_id": production_order_item_id,
            "cell_id": finished_cell.id,
            "pairs_quantity": 10,
        },
    )
    assert too_large_transfer.status_code == 400

    valid_transfer = await client.post(
        f"/production-orders/{production_order_id}/transfer",
        headers=auth_headers,
        json={
            "production_order_item_id": production_order_item_id,
            "cell_id": finished_cell.id,
            "pairs_quantity": 5,
        },
    )
    assert valid_transfer.status_code == 200
    assert valid_transfer.json()["items"][0]["transferred_pairs"] == 5


async def test_production_chz_request_keeps_comment_and_is_visible_in_pending_queue(
    client,
    db_session,
    auth_headers,
    integration_chz_headers,
):
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

    create_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-CHZ",
            "priority": 9,
            "items": [{"item_id": item.id, "pairs_quantity": 100}],
        },
    )
    assert create_response.status_code == 200
    production_payload = create_response.json()
    production_order_id = production_payload["id"]
    production_order_item_id = production_payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260303", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    chz_response = await client.post(
        f"/production-orders/{production_order_id}/chz-requests",
        headers=auth_headers,
        json={
            "production_order_item_ids": [production_order_item_id],
            "comment": "Нужны этикетки для производственной партии",
        },
    )
    assert chz_response.status_code == 200
    active_request = chz_response.json()["active_chz_request"]
    assert active_request["comment"] == "Нужны этикетки для производственной партии"

    pending_response = await client.get(
        "/integration/production-chz/requests/pending",
        headers=integration_chz_headers,
    )
    assert pending_response.status_code == 200
    pending_payload = pending_response.json()
    assert [request["id"] for request in pending_payload] == [active_request["id"]]
    assert pending_payload[0]["comment"] == "Нужны этикетки для производственной партии"


async def test_delete_production_order_removes_pending_order(client, db_session, auth_headers):
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

    create_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-DELETE",
            "priority": 5,
            "items": [{"item_id": item.id, "pairs_quantity": 50}],
        },
    )
    assert create_response.status_code == 200
    production_order_id = create_response.json()["id"]

    delete_response = await client.delete(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    get_response = await client.get(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert get_response.status_code == 404


async def test_delete_production_order_rejects_order_with_chz_request(client, db_session, auth_headers):
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

    create_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-DELETE-CHZ",
            "priority": 8,
            "items": [{"item_id": item.id, "pairs_quantity": 100}],
        },
    )
    assert create_response.status_code == 200
    production_payload = create_response.json()
    production_order_id = production_payload["id"]
    production_order_item_id = production_payload["items"][0]["id"]

    start_response = await client.post(
        f"/production-orders/{production_order_id}/start",
        headers=auth_headers,
        json={"batch_number": "260404", "production_date": "2026-06-19"},
    )
    assert start_response.status_code == 200

    chz_response = await client.post(
        f"/production-orders/{production_order_id}/chz-requests",
        headers=auth_headers,
        json={"production_order_item_ids": [production_order_item_id]},
    )
    assert chz_response.status_code == 200

    delete_response = await client.delete(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert delete_response.status_code == 400
    assert delete_response.json()["detail"] == "Cannot delete a production order after a CHZ request has been created"
