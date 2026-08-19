from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import raise_obj_not_found
from backend.app.models.warehouse import Warehouse
from backend.app.schemas.warehouse import WarehouseCreate, WarehouseResponse, WarehouseUpdate
from backend.app.services.cell import get_cells


async def get_all_warehouses(db: AsyncSession) -> list[WarehouseResponse]:
    warehouses = list((await db.scalars(select(Warehouse).order_by(Warehouse.name))).all())
    cells = await get_cells(db)
    cells_by_warehouse: dict[int, list] = defaultdict(list)
    for cell in cells:
        cells_by_warehouse[cell.warehouse_id].append(cell)

    return [
        WarehouseResponse(
            id=warehouse.id,
            name=warehouse.name,
            cells=cells_by_warehouse.get(warehouse.id, []),
        )
        for warehouse in warehouses
    ]


async def create_warehouse(db: AsyncSession, warehouse_data: WarehouseCreate) -> Warehouse:
    warehouse = Warehouse(name=warehouse_data.name)
    db.add(warehouse)
    await db.commit()
    await db.refresh(warehouse)
    return warehouse


async def update_warehouse(db: AsyncSession, warehouse_data: WarehouseUpdate, warehouse_id: int) -> Warehouse:
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise_obj_not_found("Warehouse")

    if warehouse_data.name is not None:
        warehouse.name = warehouse_data.name

    await db.commit()
    await db.refresh(warehouse)
    return warehouse


async def delete_warehouse(db: AsyncSession, warehouse_id: int) -> None:
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise_obj_not_found("Warehouse")

    await db.delete(warehouse)
    await db.commit()
