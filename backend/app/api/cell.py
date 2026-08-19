from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.warehouse import CellCreate, CellResponse, CellUpdate
from backend.app.services.cell import create_cell as create_new_cell
from backend.app.services.cell import delete_cell_by_id, get_cells, update_cell as update_cell_by_id

router = APIRouter(prefix="/cells", tags=["cells"])


@router.get("", response_model=list[CellResponse])
async def get_all_cells(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    warehouse_id: int | None = Query(None, description="ID склада для фильтрации"),
):
    return await get_cells(db, warehouse_id)


@router.post("", response_model=CellResponse, status_code=status.HTTP_201_CREATED)
async def create_cell(
    db: Annotated[AsyncSession, Depends(get_db)],
    cell_data: CellCreate,
    current_user: Annotated[User, Depends(PermissionChecker("create_cell"))],
):
    cell = await create_new_cell(db, cell_data)
    return CellResponse(
        id=cell.id,
        rack=cell.rack,
        cell=cell.cell,
        tier=cell.tier,
        warehouse_id=cell.warehouse_id,
        total_pairs=0,
        occupied=False,
    )


@router.patch("/{cell_id}", response_model=CellResponse)
async def update_cell(
    db: Annotated[AsyncSession, Depends(get_db)],
    cell_data: CellUpdate,
    cell_id: int,
    current_user: Annotated[User, Depends(PermissionChecker("update_cell"))],
):
    cell = await update_cell_by_id(db, cell_data, cell_id)
    return CellResponse(
        id=cell.id,
        rack=cell.rack,
        cell=cell.cell,
        tier=cell.tier,
        warehouse_id=cell.warehouse_id,
        total_pairs=0,
        occupied=False,
    )


@router.delete("/{cell_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cell(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_cell"))],
    cell_id: int,
):
    await delete_cell_by_id(db, cell_id)
