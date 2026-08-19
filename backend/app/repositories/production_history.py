# backend/app/repositories/production_history.py

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.production import ProductionHistory


async def create_production_history(
    db: AsyncSession,
    production_order_item_id: int,
    old_produced_pairs: int,
    new_produced_pairs: int,
    changed_by_user_id: int | None = None,
    comment: str | None = None,
) -> ProductionHistory:
    history = ProductionHistory(
        production_order_item_id=production_order_item_id,
        old_produced_pairs=old_produced_pairs,
        new_produced_pairs=new_produced_pairs,
        changed_by_user_id=changed_by_user_id,
        comment=comment,
    )
    db.add(history)
    await db.flush()
    return history


async def get_production_history_by_order_item(
    db: AsyncSession,
    production_order_item_id: int,
    limit: int = 100,
) -> list[ProductionHistory]:
    result = await db.scalars(
        select(ProductionHistory)
        .where(ProductionHistory.production_order_item_id == production_order_item_id)
        .order_by(ProductionHistory.created_at.desc())
        .limit(limit)
    )
    return list(result.all())


async def get_production_history_by_order(
    db: AsyncSession,
    production_order_id: int,
    limit: int = 500,
) -> list[ProductionHistory]:
    result = await db.scalars(
        select(ProductionHistory)
        .join(ProductionHistory.production_order_item)
        .where(ProductionHistory.production_order_item.has(production_order_id=production_order_id))
        .order_by(ProductionHistory.created_at.desc())
        .limit(limit)
        .options(selectinload(ProductionHistory.changed_by))
    )
    return list(result.all())