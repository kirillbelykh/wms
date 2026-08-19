from __future__ import annotations

from pydantic import BaseModel, Field


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1)
    keys: PushKeys


class PushPublicKeyResponse(BaseModel):
    public_key: str


class PushSubscriptionResponse(BaseModel):
    subscribed: bool


class PushTestRequest(BaseModel):
    endpoint: str = Field(min_length=1)


class PushTestResponse(BaseModel):
    sent: bool
    sent_count: int


class NotificationPreferenceOption(BaseModel):
    key: str
    label: str
    description: str
    enabled: bool


class NotificationPreferencesResponse(BaseModel):
    options: list[NotificationPreferenceOption]


class NotificationPreferencesUpdate(BaseModel):
    preferences: dict[str, bool]
