from __future__ import annotations

import pytest

from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def _seed_order_for_chz(client, db_session, auth_headers) -> tuple[int, list[int]]:
    warehouse = Warehouse(name="CHZ Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    first_cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    second_cell = Cell(rack=1, tier=1, cell=2, warehouse_id=warehouse.id)
    db_session.add_all([first_cell, second_cell])
    await db_session.flush()

    first_item = Item(
        title="стер латекс",
        name="Стерильные латексные M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=125,
    )
    second_item = Item(
        title="стер латекс",
        name="Стерильные латексные L",
        product_type="gloves",
        size="L",
        color="natural",
        max_pairs_per_box=125,
    )
    db_session.add_all([first_item, second_item])
    await db_session.flush()

    first_stock = Stock(
        item_id=first_item.id,
        cell_id=first_cell.id,
        pairs_quantity=50,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260101",
        size="M",
        color="natural",
    )
    second_stock = Stock(
        item_id=second_item.id,
        cell_id=second_cell.id,
        pairs_quantity=43,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260202",
        size="L",
        color="natural",
    )
    db_session.add_all([first_stock, second_stock])
    await db_session.commit()
    await db_session.refresh(first_stock)
    await db_session.refresh(second_stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-CHZ",
            "customer": "Clinic CHZ",
            "approved": True,
            "items": [
                {"stock_id": first_stock.id, "pairs_quantity": 50},
                {"stock_id": second_stock.id, "pairs_quantity": 43},
            ],
        },
    )
    assert order_response.status_code == 201
    payload = order_response.json()
    return payload["id"], [item["id"] for item in payload["items"]]


async def test_packing_proposal_and_chz_request_lifecycle(
    client,
    db_session,
    auth_headers,
    integration_chz_headers,
):
    order_id, order_item_ids = await _seed_order_for_chz(client, db_session, auth_headers)

    proposal_response = await client.get(
        f"/picking/{order_id}/packing-proposal",
        headers=auth_headers,
    )
    assert proposal_response.status_code == 200
    proposal_payload = proposal_response.json()
    assert proposal_payload["has_proposals"] is True
    assert len(proposal_payload["proposals"]) == 1
    assert proposal_payload["proposals"][0]["total_pairs"] == 93
    assert len(proposal_payload["proposals"][0]["items"]) == 2

    create_request_response = await client.post(
        f"/orders/{order_id}/chz-requests",
        headers=auth_headers,
        json={"order_item_ids": order_item_ids, "comment": "Need labels"},
    )
    assert create_request_response.status_code == 200
    request_payload = create_request_response.json()
    assert request_payload["status"] == "requested"
    assert request_payload["is_active"] is True
    assert request_payload["comment"] == "Need labels"
    assert len(request_payload["items"]) == 2
    assert request_payload["requested_by_username"] == "admin"

    orders_response = await client.get("/orders", headers=auth_headers)
    assert orders_response.status_code == 200
    listed_order = next(order for order in orders_response.json() if order["id"] == order_id)
    assert listed_order["active_chz_request"]["id"] == request_payload["id"]
    assert listed_order["active_chz_request"]["requested_by_username"] == "admin"

    order_requests_response = await client.get(f"/orders/{order_id}/chz-requests", headers=auth_headers)
    assert order_requests_response.status_code == 200
    assert order_requests_response.json()[0]["requested_by_username"] == "admin"

    order_response = await client.get(f"/orders/{order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    assert order_response.json()["requires_chz"] is True

    pending_response = await client.get(
        "/integration/chz/requests/pending",
        headers=integration_chz_headers,
    )
    assert pending_response.status_code == 200
    pending_payload = pending_response.json()
    assert [request["id"] for request in pending_payload] == [request_payload["id"]]
    assert pending_payload[0]["order_id"] == order_id
    assert pending_payload[0]["order_name"] == "ORD-CHZ"
    assert pending_payload[0]["order_customer"] == "Clinic CHZ"
    assert pending_payload[0]["comment"] == "Need labels"

    acknowledge_response = await client.post(
        f"/integration/chz/requests/{request_payload['id']}/acknowledge",
        headers=integration_chz_headers,
    )
    assert acknowledge_response.status_code == 200
    assert acknowledge_response.json()["status"] == "acknowledged"
    assert acknowledge_response.json()["is_active"] is True

    pending_after_ack_response = await client.get(
        "/integration/chz/requests/pending",
        headers=integration_chz_headers,
    )
    assert pending_after_ack_response.status_code == 200
    assert [request["id"] for request in pending_after_ack_response.json()] == [request_payload["id"]]

    ready_response = await client.post(
        f"/integration/chz/requests/{request_payload['id']}/ready",
        headers=integration_chz_headers,
    )
    assert ready_response.status_code == 200
    assert ready_response.json()["status"] == "ready"
    assert ready_response.json()["is_active"] is False

    order_after_ready = await client.get(f"/orders/{order_id}", headers=auth_headers)
    assert order_after_ready.status_code == 200
    assert order_after_ready.json()["requires_chz"] is False
    assert order_after_ready.json()["active_chz_request"]["status"] == "ready"


async def test_integration_archive_hides_chz_request_from_pending(
    client,
    db_session,
    auth_headers,
    integration_chz_headers,
):
    order_id, order_item_ids = await _seed_order_for_chz(client, db_session, auth_headers)

    create_request_response = await client.post(
        f"/orders/{order_id}/chz-requests",
        headers=auth_headers,
        json={"order_item_ids": order_item_ids},
    )
    assert create_request_response.status_code == 200
    request_payload = create_request_response.json()

    archive_response = await client.post(
        "/integration/chz/requests/archive",
        headers=integration_chz_headers,
        json={"entries": [{"source": "shipment", "request_id": request_payload["id"]}]},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["changed"] == 1

    pending_response = await client.get(
        "/integration/chz/requests/pending",
        headers=integration_chz_headers,
    )
    assert pending_response.status_code == 200
    assert pending_response.json() == []

    registry_response = await client.get("/chz/registry", headers=auth_headers)
    assert registry_response.status_code == 200
    archived_rows = [
        row
        for row in registry_response.json()
        if row["source"] == "shipment" and row["request_id"] == request_payload["id"]
    ]
    assert archived_rows
    assert {row["status"] for row in archived_rows} == {"cancelled"}
