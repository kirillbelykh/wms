from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import raise_obj_not_found
from backend.app.models.cell import Cell
from backend.app.models.stock import Stock
from backend.app.schemas.warehouse import CellCreate, CellResponse, CellUpdate


async def get_cells(db: AsyncSession, warehouse_id: int | None = None) -> list[CellResponse]:
    totals_subquery = (
        select(
            Stock.cell_id.label("cell_id"),
            func.coalesce(func.sum(Stock.pairs_quantity), 0).label("total_pairs"),
        )
        .group_by(Stock.cell_id)
        .subquery()
    )

    query = (
        select(
            Cell,
            func.coalesce(totals_subquery.c.total_pairs, 0).label("total_pairs"),
        )
        .outerjoin(totals_subquery, totals_subquery.c.cell_id == Cell.id)
        .where(Cell.is_deleted.is_(False))
        .order_by(Cell.rack, Cell.tier, Cell.cell)
    )
    if warehouse_id is not None:
        query = query.where(Cell.warehouse_id == warehouse_id)

    rows = (await db.execute(query)).all()
    return [
        CellResponse(
            id=cell.id,
            rack=cell.rack,
            cell=cell.cell,
            tier=cell.tier,
            warehouse_id=cell.warehouse_id,
            total_pairs=int(total_pairs or 0),
            occupied=int(total_pairs or 0) > 0,
        )
        for cell, total_pairs in rows
    ]


async def create_cell(db: AsyncSession, cell_data: CellCreate) -> Cell:
    cell = Cell(**cell_data.model_dump())
    db.add(cell)
    await db.commit()
    await db.refresh(cell)
    return cell


async def update_cell(db: AsyncSession, cell_data: CellUpdate, cell_id: int) -> Cell:
    cell = await db.scalar(select(Cell).where(Cell.id == cell_id, Cell.is_deleted.is_(False)))
    if cell is None:
        raise_obj_not_found("Cell")

    for field_name, field_value in cell_data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(cell, field_name, field_value)

    await db.commit()
    await db.refresh(cell)
    return cell


async def delete_cell_by_id(db: AsyncSession, cell_id: int) -> Cell:
    cell = await db.scalar(select(Cell).where(Cell.id == cell_id, Cell.is_deleted.is_(False)))
    if cell is None:
        raise_obj_not_found("Cell")

    occupied_pairs = await db.scalar(
        select(func.coalesce(func.sum(Stock.pairs_quantity), 0)).where(
            Stock.cell_id == cell.id,
            Stock.pairs_quantity > 0,
        )
    )
    if int(occupied_pairs or 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a cell that still contains stock")

    cell.is_deleted = True
    await db.commit()
    await db.refresh(cell)
    return cell
