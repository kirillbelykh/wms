from __future__ import annotations

import pytest

from backend.app.core.security import create_refresh_token

pytestmark = pytest.mark.asyncio


async def test_root_returns_200(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


async def test_login_returns_access_and_refresh_tokens(client, admin_user):
    response = await client.post(
        "/auth/login",
        data={"username": admin_user.username, "password": "StrongPass123!"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["refresh_token"]
    assert payload["token_type"] == "bearer"


async def test_login_with_wrong_credentials(client, admin_user):
    response = await client.post(
        "/auth/login",
        data={"username": admin_user.username, "password": "wrongpassword"},
    )
    assert response.status_code == 401


async def test_access_without_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_refresh_with_invalid_token(client):
    response = await client.post("/auth/refresh", json={"refresh_token": "invalid.token.here"})
    assert response.status_code == 401


async def test_refresh_returns_new_access_token(client, admin_user):
    refresh_token = create_refresh_token({"sub": str(admin_user.id), "role": admin_user.role})
    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert response.status_code == 200
    assert response.json()["access_token"]
