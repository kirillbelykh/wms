from __future__ import annotations

import pytest
from py_vapid import Vapid
from pywebpush import WebPushException
from sqlalchemy import select

from backend.app.core.web_push import vapid_private_key
from backend.app.models.push_subscription import PushSubscription
from backend.app.models.user import User
from backend.app.services.push import _deliver_push_payload

pytestmark = pytest.mark.asyncio


async def test_notification_preferences_can_be_updated(client, auth_headers):
    response = await client.get("/push/preferences", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["options"]
    assert all(option["enabled"] is True for option in payload["options"])

    update_response = await client.patch(
        "/push/preferences",
        headers=auth_headers,
        json={"preferences": {"order_created": False, "production": True, "unknown": False}},
    )
    assert update_response.status_code == 200
    updated = {option["key"]: option["enabled"] for option in update_response.json()["options"]}
    assert updated["order_created"] is False
    assert updated["production"] is True
    assert "unknown" not in updated

    response = await client.get("/push/preferences", headers=auth_headers)
    assert response.status_code == 200
    current = {option["key"]: option["enabled"] for option in response.json()["options"]}
    assert current["order_created"] is False


async def test_push_public_key_is_available(client, auth_headers):
    response = await client.get("/push/public-key", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["public_key"]


async def test_push_test_endpoint_uses_current_device_subscription(client, auth_headers, monkeypatch):
    async def fake_send_test_push_notification(*, user_id: int, endpoint: str, username: str | None) -> int:
        assert user_id > 0
        assert endpoint == "https://example.com/push/device-1"
        assert username == "admin"
        return 1

    monkeypatch.setattr(
        "backend.app.api.push.send_test_push_notification",
        fake_send_test_push_notification,
    )

    response = await client.post(
        "/push/test",
        headers=auth_headers,
        json={"endpoint": "https://example.com/push/device-1"},
    )
    assert response.status_code == 200
    assert response.json() == {"sent": True, "sent_count": 1}


async def test_vapid_private_key_can_be_loaded_by_pywebpush():
    vapid = Vapid.from_string(vapid_private_key())
    assert vapid is not None


async def test_forbidden_push_subscription_is_removed(db_session, admin_user: User, monkeypatch):
    subscription = PushSubscription(
        user_id=admin_user.id,
        endpoint="https://fcm.googleapis.com/fcm/send/device-1",
        p256dh="p256dh",
        auth="auth",
        user_agent="pytest",
    )
    db_session.add(subscription)
    await db_session.commit()
    await db_session.refresh(subscription)

    class FakeResponse:
        status_code = 403

    def raise_forbidden(*args, **kwargs):
        raise WebPushException("Push failed: 403 Forbidden", response=FakeResponse())

    monkeypatch.setattr("backend.app.services.push._send_push", raise_forbidden)

    sent_count = await _deliver_push_payload(
        db_session,
        subscriptions=[subscription],
        payload={"title": "Test"},
        notification_key=None,
        respect_preferences=False,
    )

    assert sent_count == 0
    remaining = list((await db_session.scalars(select(PushSubscription))).all())
    assert remaining == []
