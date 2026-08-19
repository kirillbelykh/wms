from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.warehouse import (
    StockBulkDeleteRequest,
    StockBulkDeleteResponse,
    StockCreate,
    StockMove,
    StockResponse,
    StockUpdate,
    StockWithdraw,
)
from backend.app.services.audit import log_operation
from backend.app.services.stock import (
    bulk_delete_stocks as service_bulk_delete_stocks,
    create_stock as service_create_stock,
    delete_stock as service_delete_stock,
    get_all_stocks as service_get_all_stocks,
    get_stock_by_id as service_get_stock,
    get_stocks_by_cell as service_get_stocks_by_cell,
    get_stocks_by_item as service_get_stocks_by_item,
    move_stock as service_move_stock,
    update_stock as service_update_stock,
    withdraw_stock as service_withdraw_stock,
)

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("", response_model=list[StockResponse])
async def get_all_stocks(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await service_get_all_stocks(db)


@router.get("/item/{item_id}", response_model=list[StockResponse])
async def get_by_item(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await service_get_stocks_by_item(db, item_id)


@router.get("/cell/{cell_id}", response_model=list[StockResponse])
async def get_by_cell(
    cell_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await service_get_stocks_by_cell(db, cell_id)


@router.get("/{stock_id}", response_model=StockResponse)
async def get_by_id(
    stock_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return await service_get_stock(db, stock_id)


@router.post("/cell/{cell_id}", response_model=StockResponse, status_code=status.HTTP_201_CREATED)
async def create(
    cell_id: int,
    stock_data: StockCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("create_stock"))],
):
    stock = await service_create_stock(db, cell_id, stock_data)
    await log_operation(
        db,
        operation_type="replenish",
        user_id=current_user.id,
        item_id=stock.item_id,
        stock_id=stock.id,
        cell_id=cell_id,
        quantity=stock_data.pairs_quantity,
        details={
            "batch": stock_data.batch_number,
            "size": stock_data.size,
            "color": stock_data.color,
            "venchik": stock_data.venchik,
            "pairs_per_box": stock_data.pairs_per_box,
            "action": "Пополнение ячейки",
        },
    )
    await db.commit()
    return stock


@router.patch("/{stock_id}", response_model=StockResponse)
async def update(
    stock_id: int,
    stock_data: StockUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_stock"))],
):
    old_stock = await service_get_stock(db, stock_id)
    updated_stock = await service_update_stock(db, stock_id, stock_data)

    await log_operation(
        db,
        operation_type="update_stock",
        user_id=current_user.id,
        item_id=updated_stock.item_id,
        stock_id=None,
        cell_id=updated_stock.cell_id,
        quantity=updated_stock.pairs_quantity,
        details={
            "old_quantity": old_stock.pairs_quantity,
            "new_quantity": updated_stock.pairs_quantity,
            "pairs_per_box": old_stock.pairs_per_box,
            "batch_number": old_stock.batch_number,
            "size": old_stock.size,
            "color": old_stock.color,
            "venchik": old_stock.venchik,
            "inventory_type": old_stock.inventory_type.value if hasattr(old_stock.inventory_type, "value") else str(old_stock.inventory_type),
            "manufacturer": old_stock.manufacturer,
            "action": "Обновление остатка",
        },
    )
    await db.commit()
    return updated_stock


@router.post("/{stock_id}/withdraw")
async def withdraw(
    stock_id: int,
    withdraw_data: StockWithdraw,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("withdraw_stock"))],
):
    # ✅ Логирование теперь внутри service_withdraw_stock
    result = await service_withdraw_stock(
        db, 
        stock_id, 
        withdraw_data.pairs_quantity,
        user_id=current_user.id  # <-- передаем user_id в сервис
    )
    return result


@router.post("/{stock_id}/move", response_model=dict)
async def move(
    stock_id: int,
    move_data: StockMove,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("move_stock"))],
):
    # ✅ Логирование теперь внутри service_move_stock
    result = await service_move_stock(
        db, 
        stock_id, 
        move_data.to_cell_id, 
        move_data.pairs_quantity,
        user_id=current_user.id
    )
    return result


@router.post("/bulk-delete", response_model=StockBulkDeleteResponse)
async def bulk_delete(
    payload: StockBulkDeleteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_stock"))],
):
    return await service_bulk_delete_stocks(db, payload.stock_ids, user_id=current_user.id)


@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    stock_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_stock"))],
):
    stock_before = await service_get_stock(db, stock_id)
    await log_operation(
        db,
        operation_type="delete_stock",
        user_id=current_user.id,
        item_id=stock_before.item_id,
        stock_id=None,
        cell_id=stock_before.cell_id,
        quantity=stock_before.pairs_quantity,
        details={
            "source_stock_id": stock_id,
            "pairs_per_box": stock_before.pairs_per_box,
            "batch_number": stock_before.batch_number,
            "size": stock_before.size,
            "color": stock_before.color,
            "venchik": stock_before.venchik,
            "inventory_type": stock_before.inventory_type.value if hasattr(stock_before.inventory_type, "value") else str(stock_before.inventory_type),
            "manufacturer": stock_before.manufacturer,
            "action": "Удаление остатка",
        },
    )
    await service_delete_stock(db, stock_id)
