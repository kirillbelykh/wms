from __future__ import annotations

from datetime import timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from backend.app.core.config import settings
from backend.app.core.time import utc_now


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _build_token_payload(data: dict[str, Any] | int | str) -> dict[str, Any]:
    if isinstance(data, dict):
        return data.copy()
    return {"sub": str(data)}


def create_access_token(data: dict[str, Any] | int | str, expires_delta: timedelta | None = None) -> str:
    payload = _build_token_payload(data)
    payload.update(
        {
            "exp": utc_now() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes)),
            "iat": utc_now(),
            "type": "access",
        }
    )
    return jwt.encode(payload, settings.secret_key_value, algorithm=settings.algorithm)


def create_refresh_token(data: dict[str, Any] | int | str, expires_delta: timedelta | None = None) -> str:
    payload = _build_token_payload(data)
    payload.update(
        {
            "exp": utc_now() + (expires_delta or timedelta(days=settings.refresh_token_expire_days)),
            "iat": utc_now(),
            "type": "refresh",
        }
    )
    return jwt.encode(payload, settings.secret_key_value, algorithm=settings.algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.secret_key_value, algorithms=[settings.algorithm])
    except JWTError:
        return None


def decode_access_token(token: str) -> dict[str, Any] | None:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        return None
    return payload
