from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.warehouse import WarehouseCreate, WarehouseResponse, WarehouseUpdate
from backend.app.services.warehouse import create_warehouse as create_new_warehouse
from backend.app.services.warehouse import delete_warehouse as delete_warehouse_by_id
from backend.app.services.warehouse import get_all_warehouses, update_warehouse as update_warehouse_by_id

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get("", response_model=list[WarehouseResponse])
async def get_warehouses(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_all_warehouses(db)


@router.post("", response_model=WarehouseResponse, status_code=status.HTTP_201_CREATED)
async def create_warehouse(
    db: Annotated[AsyncSession, Depends(get_db)],
    warehouse_data: WarehouseCreate,
    current_user: Annotated[User, Depends(PermissionChecker("create_warehouse"))],
):
    warehouse = await create_new_warehouse(db, warehouse_data)
    return WarehouseResponse(id=warehouse.id, name=warehouse.name, cells=[])


@router.patch("/{warehouse_id}", response_model=WarehouseResponse)
async def update_warehouse(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_warehouse"))],
    warehouse_data: WarehouseUpdate,
    warehouse_id: int,
):
    warehouse = await update_warehouse_by_id(db, warehouse_data, warehouse_id)
    return WarehouseResponse(id=warehouse.id, name=warehouse.name, cells=[])


@router.delete("/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_warehouse(
    db: Annotated[AsyncSession, Depends(get_db)],
    warehouse_id: int,
    current_user: Annotated[User, Depends(PermissionChecker("delete_warehouse"))],
):
    await delete_warehouse_by_id(db, warehouse_id)
