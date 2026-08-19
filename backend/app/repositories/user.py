from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.user import User


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    return await db.scalar(select(User).where(User.username == username))


async def get_all_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[User]:
    return list((await db.scalars(select(User).offset(skip).limit(limit))).all())


async def create_user(db: AsyncSession, user: User) -> User:
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user: User, update_data: dict[str, object]) -> User:
    for key, value in update_data.items():
        if value is not None and hasattr(user, key):
            setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user: User) -> User:
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user


async def count_users(db: AsyncSession) -> int:
    return int(await db.scalar(select(func.count()).select_from(User)) or 0)
