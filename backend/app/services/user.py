from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.exceptions import raise_credentials_exception, raise_email_already_registered
from backend.app.core.redis import check_login_rate_limit, get_remaining_attempts, reset_rate_limit
from backend.app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from backend.app.core.time import utc_now_naive
from backend.app.models.user import User, UserRole
from backend.app.repositories import user as user_repo
from backend.app.schemas.user import TokenRefreshResponse, TokenResponse, UserCreateByAdmin, UserUpdate


async def register_user(
    db: AsyncSession,
    user_data: UserCreateByAdmin,
    role: str = UserRole.VIEWER.value,
) -> User:
    existing = await user_repo.get_user_by_email(db, user_data.email) if user_data.email else None
    if existing:
        raise_email_already_registered()

    existing_username = await user_repo.get_user_by_username(db, user_data.username)
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        role=role,
        full_name=user_data.full_name,
        is_active=True,
        last_login=None,
    )
    return await user_repo.create_user(db, user)


async def login_user(
    db: AsyncSession,
    username: str,
    password: str,
    *,
    client_ip: str = "unknown",
) -> TokenResponse:
    if not await check_login_rate_limit(client_ip):
        remaining = await get_remaining_attempts(client_ip)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Remaining attempts: {remaining}",
            headers={"Retry-After": str(settings.login_rate_window)},
        )

    user = await user_repo.get_user_by_username(db, username)
    if not user or not user.is_active:
        raise_credentials_exception()

    if not verify_password(password, user.password_hash):
        raise_credentials_exception()

    user.last_login = utc_now_naive()
    await db.commit()
    await reset_rate_limit(client_ip)

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id), "role": user.role}),
        refresh_token=create_refresh_token({"sub": str(user.id), "role": user.role}),
    )


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenRefreshResponse:
    payload = decode_token(refresh_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await user_repo.get_user_by_id(db, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return TokenRefreshResponse(
        access_token=create_access_token({"sub": str(user.id), "role": user.role}),
    )


async def get_all_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[User]:
    return await user_repo.get_all_users(db, skip, limit)


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await user_repo.get_user_by_id(db, user_id)


async def update_user_by_admin(db: AsyncSession, user_id: int, update_data: UserUpdate) -> User:
    user = await user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    if "password" in update_dict and update_dict["password"]:
        update_dict["password_hash"] = hash_password(str(update_dict["password"]))
        del update_dict["password"]

    return await user_repo.update_user(db, user, update_dict)


async def deactivate_user(db: AsyncSession, user_id: int) -> User:
    user = await user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await user_repo.deactivate_user(db, user)


async def count_users(db: AsyncSession) -> int:
    return await user_repo.count_users(db)
