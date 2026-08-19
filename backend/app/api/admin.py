from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.user import UserCreateByAdmin, UserResponse, UserUpdate
from backend.app.services.user import count_users, get_all_users, get_user_by_id, register_user, update_user_by_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    return await get_all_users(db, skip=skip, limit=limit)


@router.get("/users/count")
async def users_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
):
    return {"total": await count_users(db)}


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_detail(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
):
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreateByAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
):
    return await register_user(db, user_data, role=user_data.role)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update_data: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
):
    if user_id == current_user.id and update_data.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate yourself",
        )

    return await update_user_by_admin(db, user_id, update_data)


@router.delete("/users/{user_id}/permanent", status_code=status.HTTP_200_OK)
async def permanently_delete_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("manage_users")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"message": f"User {user.username} permanently deleted"}


@router.get("/stats")
async def admin_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(PermissionChecker("view_admin_stats")),
):
    total_users = await count_users(db)
    active_users = int(
        await db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0
    )
    return {"total_users": total_users, "active_users": active_users}
