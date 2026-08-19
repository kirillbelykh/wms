from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.web_push import vapid_public_key
from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.push import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    PushPublicKeyResponse,
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    PushTestRequest,
    PushTestResponse,
)
from backend.app.services.push import (
    delete_push_subscription,
    get_notification_preferences,
    send_test_push_notification,
    update_notification_preferences,
    upsert_push_subscription,
)

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/public-key", response_model=PushPublicKeyResponse)
async def get_public_key(current_user: Annotated[User, Depends(get_current_user)]) -> PushPublicKeyResponse:
    return PushPublicKeyResponse(public_key=vapid_public_key())


@router.post("/subscriptions", response_model=PushSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    payload: PushSubscriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    user_agent: Annotated[str | None, Header(alias="User-Agent")] = None,
) -> PushSubscriptionResponse:
    await upsert_push_subscription(db, user_id=current_user.id, payload=payload, user_agent=user_agent)
    await db.commit()
    return PushSubscriptionResponse(subscribed=True)


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subscription(
    payload: PushSubscriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await delete_push_subscription(db, payload.endpoint)
    await db.commit()


@router.post("/test", response_model=PushTestResponse)
async def test_push_notification(
    payload: PushTestRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> PushTestResponse:
    sent_count = await send_test_push_notification(
        user_id=current_user.id,
        endpoint=payload.endpoint,
        username=current_user.username,
    )
    return PushTestResponse(sent=sent_count > 0, sent_count=sent_count)


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_preferences(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreferencesResponse:
    return NotificationPreferencesResponse(
        options=await get_notification_preferences(db, current_user.id)
    )


@router.patch("/preferences", response_model=NotificationPreferencesResponse)
async def update_preferences(
    payload: NotificationPreferencesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreferencesResponse:
    options = await update_notification_preferences(
        db,
        user_id=current_user.id,
        preferences=payload.preferences,
    )
    await db.commit()
    return NotificationPreferencesResponse(options=options)
