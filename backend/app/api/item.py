from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.warehouse import ItemCreate, ItemResponse, ItemUpdate
from backend.app.services.item import create_item as create_new_item
from backend.app.services.item import delete_item as delete_item_by_id
from backend.app.services.item import get_items as get_all_items
from backend.app.services.item import update_item as update_item_by_id

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=list[ItemResponse])
async def get_items(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
):
    return await get_all_items(db, skip, limit)


@router.post("", response_model=ItemResponse)
async def create_item(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("create_item"))],
    item_data: ItemCreate,
):
    return await create_new_item(db, item_data)


@router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_item"))],
    item_data: ItemUpdate,
    item_id: int,
):
    return await update_item_by_id(db, item_data, item_id)


@router.delete("/{item_id}", status_code=status.HTTP_200_OK)
async def delete_item(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_item"))],
    item_id: int,
):
    return await delete_item_by_id(db, item_id)
