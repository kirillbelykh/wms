from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.dependencies.auth import require_admin
from backend.app.dependencies.database import get_db
from backend.app.models.role import Permission, Role
from backend.app.models.user import User
from backend.app.schemas.role import PermissionResponse, RoleCreate, RoleResponse, RoleUpdate

router = APIRouter(prefix="/admin/roles", tags=["admin-roles"])


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    return list((await db.scalars(select(Permission).order_by(Permission.group, Permission.code))).all())


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    return list(
        (
            await db.scalars(
                select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
            )
        ).all()
    )


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    role = await db.scalar(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    existing = await db.scalar(select(Role).where(Role.name == data.name))
    if existing:
        raise HTTPException(status_code=409, detail="Role already exists")

    role = Role(name=data.name, description=data.description, is_system=False)
    if data.permission_ids:
        role.permissions = list(
            (
                await db.scalars(select(Permission).where(Permission.id.in_(data.permission_ids)))
            ).all()
        )

    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    role = await db.scalar(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    if data.name is not None:
        existing = await db.scalar(select(Role).where(Role.name == data.name, Role.id != role_id))
        if existing:
            raise HTTPException(status_code=409, detail="Role with this name already exists")
        role.name = data.name

    if data.description is not None:
        role.description = data.description

    if data.permission_ids is not None:
        role.permissions = list(
            (
                await db.scalars(select(Permission).where(Permission.id.in_(data.permission_ids)))
            ).all()
        )

    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_200_OK)
async def delete_role(
    role_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: User = Depends(require_admin),
):
    role = await db.scalar(select(Role).where(Role.id == role_id))
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system role")

    await db.execute(update(User).where(User.role == role.name).values(role="viewer"))
    await db.delete(role)
    await db.commit()
    return {"message": f"Role '{role.name}' deleted"}
