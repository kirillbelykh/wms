from __future__ import annotations

import pytest

from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def test_packing_proposal_splits_boxes_and_merges_sizes(client, db_session, auth_headers):
    warehouse = Warehouse(name="7")
    db_session.add(warehouse)
    await db_session.flush()

    cells = [
        Cell(rack=1, tier=1, cell=index, warehouse_id=warehouse.id)
        for index in range(1, 5)
    ]
    db_session.add_all(cells)
    await db_session.flush()

    items = [
        Item(
            title="хир с полимерным",
            name="Хир с полимерным 7",
            product_type="gloves",
            size="7",
            color="natural",
            max_pairs_per_box=100,
        ),
        Item(
            title="хир с полимерным",
            name="Хир с полимерным 6",
            product_type="gloves",
            size="6",
            color="natural",
            max_pairs_per_box=100,
        ),
        Item(
            title="стер латекс",
            name="Стер латекс M",
            product_type="gloves",
            size="M",
            color="natural",
            max_pairs_per_box=125,
        ),
        Item(
            title="стер латекс",
            name="Стер латекс L",
            product_type="gloves",
            size="L",
            color="natural",
            max_pairs_per_box=125,
        ),
    ]
    db_session.add_all(items)
    await db_session.flush()

    stocks = [
        Stock(
            item_id=items[0].id,
            cell_id=cells[0].id,
            pairs_quantity=50,
            reserved_pairs=0,
            pairs_per_box=100,
            batch_number="260101",
            size="7",
            color="natural",
        ),
        Stock(
            item_id=items[1].id,
            cell_id=cells[1].id,
            pairs_quantity=150,
            reserved_pairs=0,
            pairs_per_box=100,
            batch_number="260235",
            size="6",
            color="natural",
        ),
        Stock(
            item_id=items[2].id,
            cell_id=cells[2].id,
            pairs_quantity=100,
            reserved_pairs=0,
            pairs_per_box=125,
            batch_number="260202",
            size="M",
            color="natural",
        ),
        Stock(
            item_id=items[3].id,
            cell_id=cells[3].id,
            pairs_quantity=50,
            reserved_pairs=0,
            pairs_per_box=125,
            batch_number="260425",
            size="L",
            color="natural",
        ),
    ]
    db_session.add_all(stocks)
    await db_session.commit()
    for stock in stocks:
        await db_session.refresh(stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-PACK",
            "customer": "Clinic Pack",
            "approved": True,
            "items": [
                {"stock_id": stocks[0].id, "pairs_quantity": 50},
                {"stock_id": stocks[1].id, "pairs_quantity": 150},
                {"stock_id": stocks[2].id, "pairs_quantity": 100},
                {"stock_id": stocks[3].id, "pairs_quantity": 50},
            ],
        },
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]

    proposal_response = await client.get(
        f"/picking/{order_id}/packing-proposal",
        headers=auth_headers,
    )
    assert proposal_response.status_code == 200
    payload = proposal_response.json()
    assert payload["has_proposals"] is True
    assert len(payload["proposals"]) == 1

    first_box = payload["proposals"][0]

    assert first_box["total_pairs"] == 100
    assert [(item["size"], item["batch"], item["pairs_quantity"]) for item in first_box["items"]] == [
        ("7", "260101", 50),
        ("6", "260235", 50),
    ]


async def test_packing_proposal_skips_exact_full_boxes(client, db_session, auth_headers):
    warehouse = Warehouse(name="Sterile")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    item = Item(
        title="стер нитрил",
        name="Стер нитрил M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=125,
    )
    db_session.add_all([cell, item])
    await db_session.flush()

    stock = Stock(
        item_id=item.id,
        cell_id=cell.id,
        pairs_quantity=10_000,
        reserved_pairs=0,
        pairs_per_box=125,
        batch_number="260701",
        size="M",
        color="natural",
    )
    db_session.add(stock)
    await db_session.commit()
    await db_session.refresh(stock)

    order_response = await client.post(
        "/orders",
        headers=auth_headers,
        json={
            "name": "ORD-FULL-BOXES",
            "customer": "Clinic Pack",
            "approved": True,
            "items": [{"stock_id": stock.id, "pairs_quantity": 10_000}],
        },
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]

    proposal_response = await client.get(
        f"/picking/{order_id}/packing-proposal",
        headers=auth_headers,
    )
    assert proposal_response.status_code == 200
    payload = proposal_response.json()
    assert payload["has_proposals"] is False
    assert payload["proposals"] == []
