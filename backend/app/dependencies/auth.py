from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.security import decode_access_token
from backend.app.dependencies.database import get_db
from backend.app.models.role import Role as RoleModel
from backend.app.models.user import User
from backend.app.repositories.user import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise _credentials_exception()

    user_id = payload.get("sub")
    if user_id is None:
        raise _credentials_exception()

    user = await get_user_by_id(db, int(user_id))
    if user is None:
        raise _credentials_exception()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


class PermissionChecker:
    def __init__(self, permission_code: str):
        self.permission_code = permission_code

    async def __call__(
        self,
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> User:
        role = await db.scalar(
            select(RoleModel)
            .options(selectinload(RoleModel.permissions))
            .where(RoleModel.name == current_user.role)
        )
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' not found",
            )

        permission_codes = {permission.code for permission in role.permissions}
        if self.permission_code not in permission_codes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {self.permission_code}",
            )

        return current_user


require_admin = PermissionChecker("manage_users")
require_permission = PermissionChecker
