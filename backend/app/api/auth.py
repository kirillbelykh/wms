from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.role import Role
from backend.app.models.user import User
from backend.app.schemas.user import RefreshRequest, TokenRefreshResponse, TokenResponse, UserResponse
from backend.app.services.user import login_user, refresh_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    client_ip = request.client.host if request.client else "unknown"
    return await login_user(db, form_data.username, form_data.password, client_ip=client_ip)


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token(
    request: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await refresh_access_token(db, request.refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_user(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    role = await db.scalar(
        select(Role)
        .options(selectinload(Role.permissions))
        .where(Role.name == user.role)
    )
    response = UserResponse.model_validate(user)
    response.permissions = sorted(permission.code for permission in role.permissions) if role else []
    return response
