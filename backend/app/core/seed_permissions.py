from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.logging import get_logger
from backend.app.core.permissions import DEFAULT_ROLE_PERMISSIONS, PERMISSIONS
from backend.app.models.role import Permission, Role

logger = get_logger(__name__)


async def seed_permissions(db: AsyncSession) -> None:
    existing_permissions = {
        permission.code: permission
        for permission in (await db.scalars(select(Permission))).all()
    }
    created_permission_codes: set[str] = set()

    for group, permissions in PERMISSIONS.items():
        for code, description in permissions:
            if code in existing_permissions:
                continue
            permission = Permission(code=code, description=description, group=group)
            db.add(permission)
            existing_permissions[code] = permission
            created_permission_codes.add(code)

    await db.flush()

    existing_roles = {
        role.name: role
        for role in (
            await db.scalars(
                select(Role).options(selectinload(Role.permissions))
            )
        ).all()
    }

    for role_name, permission_codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = existing_roles.get(role_name)
        if role is None:
            role = Role(
                name=role_name,
                description=f"Системная роль: {role_name}",
                is_system=True,
            )
            db.add(role)
            role.permissions = [
                existing_permissions[code]
                for code in permission_codes
                if code in existing_permissions
            ]
            continue

        current_codes = {permission.code for permission in role.permissions}
        codes_to_add: set[str]
        if role_name == "admin":
            codes_to_add = set(existing_permissions) - current_codes
        else:
            codes_to_add = set(permission_codes).intersection(created_permission_codes) - current_codes

        if codes_to_add:
            role.permissions.extend(existing_permissions[code] for code in sorted(codes_to_add))

    await db.commit()
    logger.info("Permissions and default roles have been seeded")
