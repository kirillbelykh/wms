from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.time import msk_day_bounds
from backend.app.models.audit import AuditLog


async def create_audit_log(
    db: AsyncSession,
    operation_type: str,
    user_id: int | None = None,
    item_id: int | None = None,
    stock_id: int | None = None,
    cell_id: int | None = None,
    warehouse_id: int | None = None,
    quantity: int | None = None,
    details: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        operation_type=operation_type,
        user_id=user_id,
        item_id=item_id,
        stock_id=stock_id,
        cell_id=cell_id,
        warehouse_id=warehouse_id,
        quantity=quantity,
        details=details,
    )
    db.add(log)
    await db.flush()
    return log


async def get_audit_logs(
    db: AsyncSession,
    operation_type: str | None = None,
    user_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    filters = _build_audit_filters(
        operation_type=operation_type,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
    )
    query = select(AuditLog)
    count_query = select(func.count()).select_from(AuditLog)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    total = int((await db.scalar(count_query)) or 0)
    logs = list((await db.scalars(query)).all())
    return logs, total


def _build_audit_filters(
    *,
    operation_type: str | None,
    user_id: int | None,
    from_date: str | None,
    to_date: str | None,
) -> list:
    filters: list = []
    if operation_type:
        filters.append(AuditLog.operation_type == operation_type)
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if from_date:
        start, _ = msk_day_bounds(date.fromisoformat(from_date))
        filters.append(AuditLog.created_at >= start)
    if to_date:
        _, end = msk_day_bounds(date.fromisoformat(to_date))
        filters.append(AuditLog.created_at <= end)
    return filters
