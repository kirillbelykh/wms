from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.app.core.db_base import Base
from backend.app.core.config import settings


connect_args: dict[str, object] = {}
if settings.async_database_url.startswith("sqlite+aiosqlite://"):
    connect_args["check_same_thread"] = False


engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    expire_on_commit=False,
)
