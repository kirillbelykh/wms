from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.repositories import audit as audit_repo


async def log_operation(db: AsyncSession, **kwargs):
    return await audit_repo.create_audit_log(db, **kwargs)


async def get_history(db: AsyncSession, **kwargs):
    return await audit_repo.get_audit_logs(db, **kwargs)
