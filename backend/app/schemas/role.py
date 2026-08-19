from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PermissionResponse(BaseModel):
    id: int
    code: str
    description: str
    group: str

    model_config = ConfigDict(from_attributes=True)


class RoleResponse(BaseModel):
    id: int
    name: str
    description: str
    is_system: bool
    permissions: list[PermissionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    permission_ids: list[int] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permission_ids: list[int] | None = None
