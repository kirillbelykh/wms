from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.time import to_msk
from backend.app.dependencies.auth import PermissionChecker
from backend.app.dependencies.database import get_db
from backend.app.models.cell import Cell
from backend.app.models.item import Item
from backend.app.models.user import User
from backend.app.models.warehouse import Warehouse
from backend.app.services.audit import get_history
from backend.app.services.history_rollback import can_rollback_log, rollback_audit_log

router = APIRouter(prefix="/history", tags=["history"])


class AuditLogResponse(BaseModel):
    id: int
    operation_type: str
    user_id: int | None
    item_id: int | None
    stock_id: int | None
    cell_id: int | None
    warehouse_id: int | None
    quantity: int | None
    details: dict | None
    created_at: datetime
    user_email: str | None = None
    user_username: str | None = None
    item_title: str | None = None
    cell_coord: str | None = None
    warehouse_name: str | None = None
    can_rollback: bool = False

    model_config = ConfigDict(from_attributes=True)


class AuditLogPageResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    limit: int
    offset: int


@router.get("", response_model=AuditLogPageResponse)
async def list_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("view_history")),
    operation_type: str | None = None,
    user_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    logs, total = await get_history(
        db,
        operation_type=operation_type,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )

    user_ids = {log.user_id for log in logs if log.user_id is not None}
    item_ids = {log.item_id for log in logs if log.item_id is not None}
    cell_ids = {log.cell_id for log in logs if log.cell_id is not None}
    warehouse_ids = {log.warehouse_id for log in logs if log.warehouse_id is not None}
    for log in logs:
        details = log.details or {}
        for key in ("from_cell_id", "to_cell_id"):
            cell_id = details.get(key)
            if isinstance(cell_id, int):
                cell_ids.add(cell_id)

    users = list((await db.scalars(select(User).where(User.id.in_(user_ids)))).all()) if user_ids else []
    items = list((await db.scalars(select(Item).where(Item.id.in_(item_ids)))).all()) if item_ids else []
    cells = list((await db.scalars(select(Cell).where(Cell.id.in_(cell_ids)))).all()) if cell_ids else []
    warehouse_ids.update(cell.warehouse_id for cell in cells)
    warehouses = (
        list((await db.scalars(select(Warehouse).where(Warehouse.id.in_(warehouse_ids)))).all())
        if warehouse_ids
        else []
    )

    user_map = {user.id: user for user in users}
    item_map = {item.id: item for item in items}
    cell_map = {cell.id: cell for cell in cells}
    warehouse_map = {warehouse.id: warehouse for warehouse in warehouses}

    result: list[AuditLogResponse] = []
    for log in logs:
        user = user_map.get(log.user_id) if log.user_id is not None else None
        item = item_map.get(log.item_id) if log.item_id is not None else None
        cell = cell_map.get(log.cell_id) if log.cell_id is not None else None
        warehouse = warehouse_map.get(log.warehouse_id) if log.warehouse_id is not None else None
        details = _enrich_audit_details(log.details, cell_map, warehouse_map)

        if warehouse is None and cell is not None:
            warehouse = warehouse_map.get(cell.warehouse_id)

        result.append(
            AuditLogResponse(
                id=log.id,
                operation_type=log.operation_type,
                user_id=log.user_id,
                item_id=log.item_id,
                stock_id=log.stock_id,
                cell_id=log.cell_id,
                warehouse_id=log.warehouse_id,
                quantity=log.quantity,
                details=details,
                created_at=to_msk(log.created_at) or log.created_at,
                user_email=user.email if user else None,
                user_username=user.username if user else None,
                item_title=item.title if item else None,
                cell_coord=f"{cell.rack}-{cell.tier}-{cell.cell}" if cell else None,
                warehouse_name=warehouse.name if warehouse else None,
                can_rollback=can_rollback_log(log),
            )
        )

    return AuditLogPageResponse(items=result, total=total, limit=limit, offset=offset)


@router.post("/{log_id}/rollback", response_model=AuditLogResponse)
async def rollback_history_item(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("rollback_history")),
):
    log = await rollback_audit_log(db, log_id=log_id, user_id=current_user.id)

    user = await db.scalar(select(User).where(User.id == log.user_id)) if log.user_id is not None else None
    item = await db.scalar(select(Item).where(Item.id == log.item_id)) if log.item_id is not None else None
    cell = await db.scalar(select(Cell).where(Cell.id == log.cell_id)) if log.cell_id is not None else None
    warehouse = await db.scalar(select(Warehouse).where(Warehouse.id == log.warehouse_id)) if log.warehouse_id is not None else None
    if warehouse is None and cell is not None:
        warehouse = await db.scalar(select(Warehouse).where(Warehouse.id == cell.warehouse_id))
    return AuditLogResponse(
        id=log.id,
        operation_type=log.operation_type,
        user_id=log.user_id,
        item_id=log.item_id,
        stock_id=log.stock_id,
        cell_id=log.cell_id,
        warehouse_id=log.warehouse_id,
        quantity=log.quantity,
        details=_enrich_audit_details(log.details, {cell.id: cell} if cell else {}, {warehouse.id: warehouse} if warehouse else {}),
        created_at=to_msk(log.created_at) or log.created_at,
        user_email=user.email if user else None,
        user_username=user.username if user else None,
        item_title=item.title if item else None,
        cell_coord=f"{cell.rack}-{cell.tier}-{cell.cell}" if cell else None,
        warehouse_name=warehouse.name if warehouse else None,
        can_rollback=can_rollback_log(log),
    )


def _enrich_audit_details(
    details: dict | None,
    cell_map: dict[int, Cell],
    warehouse_map: dict[int, Warehouse],
) -> dict | None:
    if details is None:
        return None

    enriched = dict(details)
    from_cell_id = enriched.get("from_cell_id")
    to_cell_id = enriched.get("to_cell_id")

    if isinstance(from_cell_id, int):
        from_cell = cell_map.get(from_cell_id)
        if from_cell is not None:
            enriched["from_cell"] = f"{from_cell.rack}-{from_cell.tier}-{from_cell.cell}"
            from_warehouse = warehouse_map.get(from_cell.warehouse_id)
            if from_warehouse is not None:
                enriched["from_warehouse"] = from_warehouse.name

    if isinstance(to_cell_id, int):
        to_cell = cell_map.get(to_cell_id)
        if to_cell is not None:
            enriched["to_cell"] = f"{to_cell.rack}-{to_cell.tier}-{to_cell.cell}"
            to_warehouse = warehouse_map.get(to_cell.warehouse_id)
            if to_warehouse is not None:
                enriched["to_warehouse"] = to_warehouse.name

    return enriched
