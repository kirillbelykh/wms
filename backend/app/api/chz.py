from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.websocket import notify_all
from backend.app.core.config import settings
from backend.app.dependencies.auth import PermissionChecker, get_current_user
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.chz import ChzRegistryBulkAction, ChzRegistryEntryResponse, ManualChzRequestCreate, ManualChzRequestResponse
from backend.app.schemas.warehouse import ChzRequestCreate, ChzRequestResponse
from backend.app.services.audit import log_operation
from backend.app.services.chz import (
    acknowledge_manual_request,
    acknowledge_request,
    cancel_chz_registry_entries,
    create_manual_chz_request,
    create_chz_request,
    list_chz_registry_entries,
    list_pending_manual_requests,
    list_order_chz_requests,
    list_pending_requests,
    mark_order_active_request_ready,
    mark_manual_request_ready,
    mark_request_ready,
)

router = APIRouter(tags=["chz"])


def require_chz_token(x_chz_token: str | None = Header(default=None)) -> None:
    expected_token = settings.chz_bridge_token_value
    if not expected_token or x_chz_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid CHZ integration token")


@router.post("/orders/{order_id}/chz-requests", response_model=ChzRequestResponse)
async def request_chz_for_order(
    order_id: int,
    payload: ChzRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    request = await create_chz_request(
        db,
        order_id=order_id,
        payload=payload,
        requested_by_user_id=current_user.id,
    )
    await log_operation(
        db,
        operation_type="create_chz_request",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "request_id": request.id,
            "order_item_ids": payload.order_item_ids,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "chz_request_created",
            {
                "order_id": order_id,
                "request_id": request.id,
                "order_name": request.order.name if request.order is not None else None,
            },
        )
    )
    return ChzRequestResponse.model_validate(request)


@router.get("/chz/registry", response_model=list[ChzRegistryEntryResponse])
async def get_chz_registry(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_chz_registry"))],
):
    return await list_chz_registry_entries(db)


@router.post("/chz/registry/archive", response_model=list[ChzRegistryEntryResponse])
async def archive_chz_registry_entries(
    payload: ChzRegistryBulkAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("delete_chz_request"))],
):
    changed = await cancel_chz_registry_entries(db, payload.entries)
    await log_operation(
        db,
        operation_type="archive_chz_requests",
        user_id=current_user.id,
        details={
            "entries": [entry.model_dump() for entry in payload.entries],
            "changed": changed,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "chz_requests_archived",
            {
                "entries": [entry.model_dump() for entry in payload.entries],
                "changed": changed,
                "archived_by": current_user.username,
            },
        )
    )
    return await list_chz_registry_entries(db)


@router.post("/integration/chz/requests/archive", dependencies=[Depends(require_chz_token)])
async def archive_integration_chz_requests(
    payload: ChzRegistryBulkAction,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    changed = await cancel_chz_registry_entries(db, payload.entries)
    await log_operation(
        db,
        operation_type="archive_chz_requests",
        details={
            "entries": [entry.model_dump() for entry in payload.entries],
            "changed": changed,
            "source": "chz_integration",
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "chz_requests_archived",
            {
                "entries": [entry.model_dump() for entry in payload.entries],
                "changed": changed,
                "archived_by": "chz_integration",
            },
        )
    )
    return {"success": True, "changed": changed}


@router.post("/chz/manual-requests", response_model=ManualChzRequestResponse)
async def request_manual_chz(
    payload: ManualChzRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("create_manual_chz_request"))],
):
    request = await create_manual_chz_request(
        db,
        payload=payload,
        requested_by_user_id=current_user.id,
    )
    await log_operation(
        db,
        operation_type="create_manual_chz_request",
        user_id=current_user.id,
        details={
            "request_id": request.id,
            "order_name": request.order_name,
            "comment": request.comment,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "manual_chz_requested",
            {
                "request_id": request.id,
                "order_name": request.order_name,
            },
        )
    )
    return ManualChzRequestResponse.model_validate(request)


@router.get("/orders/{order_id}/chz-requests", response_model=list[ChzRequestResponse])
async def get_order_chz_requests(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    requests = await list_order_chz_requests(db, order_id)
    return [ChzRequestResponse.model_validate(request) for request in requests]


@router.post("/orders/{order_id}/chz-ready", response_model=ChzRequestResponse)
async def mark_codes_ready_for_order(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("update_order"))],
):
    existing_requests = await list_order_chz_requests(db, order_id)
    previous_request = next((candidate for candidate in existing_requests if candidate.is_active), None)
    previous_status = previous_request.status.value if previous_request and hasattr(previous_request.status, "value") else str(previous_request.status) if previous_request else None
    request = await mark_order_active_request_ready(db, order_id)
    await log_operation(
        db,
        operation_type="mark_chz_ready",
        user_id=current_user.id,
        details={
            "order_id": order_id,
            "request_id": request.id,
            "previous_status": previous_status,
        },
    )
    await db.commit()
    asyncio.create_task(
        notify_all(
            "chz_codes_ready",
            {
                "order_id": order_id,
                "request_id": request.id,
                "order_name": request.order.name if request.order is not None else None,
            },
        )
    )
    return ChzRequestResponse.model_validate(request)


@router.get("/integration/chz/requests/pending", response_model=list[ChzRequestResponse], dependencies=[Depends(require_chz_token)])
async def get_pending_chz_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    requests = await list_pending_requests(db)
    return [ChzRequestResponse.model_validate(request) for request in requests]


@router.post("/integration/chz/requests/{request_id}/acknowledge", response_model=ChzRequestResponse, dependencies=[Depends(require_chz_token)])
async def acknowledge_chz_request(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await acknowledge_request(db, request_id)
    asyncio.create_task(
        notify_all(
            "chz_request_acknowledged",
            {
                "order_id": request.order_id,
                "request_id": request.id,
                "order_name": request.order.name if request.order is not None else None,
            },
        )
    )
    return ChzRequestResponse.model_validate(request)


@router.get(
    "/integration/manual-chz/requests/pending",
    response_model=list[ManualChzRequestResponse],
    dependencies=[Depends(require_chz_token)],
)
async def get_pending_manual_chz_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    requests = await list_pending_manual_requests(db)
    return [ManualChzRequestResponse.model_validate(request) for request in requests]


@router.post(
    "/integration/manual-chz/requests/{request_id}/acknowledge",
    response_model=ManualChzRequestResponse,
    dependencies=[Depends(require_chz_token)],
)
async def acknowledge_manual_chz(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await acknowledge_manual_request(db, request_id)
    asyncio.create_task(
        notify_all(
            "manual_chz_acknowledged",
            {
                "request_id": request.id,
                "order_name": request.order_name,
            },
        )
    )
    return ManualChzRequestResponse.model_validate(request)


@router.post(
    "/integration/manual-chz/requests/{request_id}/ready",
    response_model=ManualChzRequestResponse,
    dependencies=[Depends(require_chz_token)],
)
async def mark_manual_chz_ready(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await mark_manual_request_ready(db, request_id)
    asyncio.create_task(
        notify_all(
            "manual_chz_ready",
            {
                "request_id": request.id,
                "order_name": request.order_name,
            },
        )
    )
    return ManualChzRequestResponse.model_validate(request)


@router.post("/integration/chz/requests/{request_id}/ready", response_model=ChzRequestResponse, dependencies=[Depends(require_chz_token)])
async def mark_chz_request_ready(
    request_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await mark_request_ready(db, request_id)
    asyncio.create_task(
        notify_all(
            "chz_codes_ready",
            {
                "order_id": request.order_id,
                "request_id": request.id,
                "order_name": request.order.name if request.order is not None else None,
            },
        )
    )
    return ChzRequestResponse.model_validate(request)
