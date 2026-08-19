from __future__ import annotations

import pytest

from backend.app.core.seed_permissions import seed_permissions

pytestmark = pytest.mark.asyncio


async def test_seed_permissions_is_idempotent_for_existing_roles(db_session):
    await seed_permissions(db_session)
    await seed_permissions(db_session)
