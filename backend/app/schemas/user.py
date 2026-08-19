from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreateByAdmin(BaseModel):
    username: str
    email: str | None = None
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    role: str = "viewer"


class UserResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    permissions: list[str] = Field(default_factory=list)
    full_name: str | None = None
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    username: str | None = None
    email: str | None = None
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
