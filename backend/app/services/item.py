from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.packing_rules import resolve_pairs_per_box
from backend.app.core.exceptions import raise_obj_not_found
from backend.app.models.item import Item
from backend.app.schemas.warehouse import ItemCreate, ItemUpdate


async def get_items(db: AsyncSession, skip: int = 0, limit: int = 1000) -> list[Item]:
    return list(
        (
            await db.scalars(
                select(Item)
                .where(Item.is_deleted.is_(False))
                .order_by(Item.title)
                .offset(skip)
                .limit(limit)
            )
        ).all()
    )


async def create_item(db: AsyncSession, item_data: ItemCreate) -> Item:
    payload = item_data.model_dump()
    if payload.get("max_pairs_per_box") is None:
        payload["max_pairs_per_box"] = resolve_pairs_per_box(item_data.title)
    item = Item(**payload)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_item(db: AsyncSession, item_data: ItemUpdate, item_id: int) -> Item:
    item = await db.scalar(select(Item).where(Item.id == item_id, Item.is_deleted.is_(False)))
    if item is None:
        raise_obj_not_found("Item")

    for field_name, field_value in item_data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(item, field_name, field_value)

    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item_id: int) -> Item:
    item = await db.scalar(select(Item).where(Item.id == item_id, Item.is_deleted.is_(False)))
    if item is None:
        raise_obj_not_found("Item")

    item.is_deleted = True
    await db.commit()
    await db.refresh(item)
    return item
