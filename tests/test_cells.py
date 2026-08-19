from __future__ import annotations

import pytest

from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.stock import Stock
from backend.app.models.warehouse import Warehouse

pytestmark = pytest.mark.asyncio


async def test_cannot_delete_cell_with_stock(client, db_session, auth_headers):
    warehouse = Warehouse(name="Delete Guard Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    db_session.add(cell)

    item = Item(
        title="Delete guard item",
        name="Delete guard item",
        product_type="gloves",
        size="M",
        color="blue",
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
        color="blue",
        inventory_type="finished_goods",
    )
    db_session.add(stock)
    await db_session.commit()

    response = await client.delete(f"/cells/{cell.id}", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot delete a cell that still contains stock"

    await db_session.refresh(cell)
    assert cell.is_deleted is False


async def test_stocks_endpoint_excludes_deleted_cells(client, db_session, auth_headers):
    warehouse = Warehouse(name="Deleted Cell Warehouse")
    db_session.add(warehouse)
    await db_session.flush()

    visible_cell = Cell(rack=1, tier=1, cell=1, warehouse_id=warehouse.id)
    hidden_cell = Cell(rack=1, tier=1, cell=2, warehouse_id=warehouse.id, is_deleted=True)
    db_session.add_all([visible_cell, hidden_cell])

    item = Item(
        title="Deleted cell item",
        name="Deleted cell item",
        product_type="gloves",
        size="L",
        color="white",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    db_session.add_all(
        [
            Stock(
                item_id=item.id,
                cell_id=visible_cell.id,
                pairs_quantity=50,
                reserved_pairs=0,
                pairs_per_box=50,
                batch_number="260702",
                size="L",
                color="white",
                inventory_type="finished_goods",
            ),
            Stock(
                item_id=item.id,
                cell_id=hidden_cell.id,
                pairs_quantity=75,
                reserved_pairs=0,
                pairs_per_box=75,
                batch_number="260703",
                size="L",
                color="white",
                inventory_type="finished_goods",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/stocks", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()

    returned_cell_ids = {row["cell_id"] for row in payload}
    assert visible_cell.id in returned_cell_ids
    assert hidden_cell.id not in returned_cell_ids
