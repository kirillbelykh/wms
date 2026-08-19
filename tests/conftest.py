from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import backend.app.models  # noqa: F401
from backend.app.core import redis as redis_module
from backend.app.core.config import settings
from backend.app.core.database import Base
from backend.app.core.security import hash_password
from backend.app.core.seed_permissions import seed_permissions
from backend.app.dependencies.database import get_db
from backend.app.main import app
from backend.app.models.user import User, UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
TEST_PASSWORD = "StrongPass123!"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    autoflush=False,
    expire_on_commit=False,
)


async def override_get_db() -> AsyncIterator[AsyncSession]:
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(scope="session", autouse=True)
async def test_app() -> AsyncIterator[None]:
    old_redis_disabled = settings.redis_disabled
    old_chz_bridge_url = settings.chz_bridge_url
    old_chz_bridge_token = settings.chz_bridge_token
    old_web_push_disabled = settings.web_push_disabled

    settings.redis_disabled = True
    settings.chz_bridge_url = None
    settings.chz_bridge_token = SecretStr("test-chz-token")
    settings.web_push_disabled = True
    redis_module._redis = None
    app.dependency_overrides[get_db] = override_get_db

    yield

    app.dependency_overrides.clear()
    settings.redis_disabled = old_redis_disabled
    settings.chz_bridge_url = old_chz_bridge_url
    settings.chz_bridge_token = old_chz_bridge_token
    settings.web_push_disabled = old_web_push_disabled
    redis_module._redis = None
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def reset_database() -> AsyncIterator[None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        await seed_permissions(session)

    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    user = User(
        username="admin",
        email="admin@example.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.ADMIN.value,
        full_name="Test Admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, admin_user: User) -> dict[str, str]:
    response = await client.post(
        "/auth/login",
        data={"username": admin_user.username, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def integration_chz_headers() -> dict[str, str]:
    return {"X-CHZ-Token": "test-chz-token"}
