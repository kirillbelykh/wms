from __future__ import annotations

from collections.abc import Sequence

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import settings
from backend.app.core.logging import get_logger
from backend.app.core.time import utc_now_naive
from backend.app.models.chz import (
    ChzRequest,
    ChzRequestItem,
    ChzRequestStatus,
    ManualChzRequest,
    ManualChzRequestItem,
)
from backend.app.models.item import Item, ItemInventoryType
from backend.app.models.order import Order, OrderItem, OrderStatus
from backend.app.models.production import ProductionChzRequest, ProductionChzRequestItem
from backend.app.models.production import ProductionChzStatus
from backend.app.schemas.chz import ChzRegistryEntryRef, ChzRegistryEntryResponse, ManualChzRequestCreate, ManualChzRequestResponse
from backend.app.schemas.warehouse import ChzRequestCreate, ChzRequestResponse

logger = get_logger(__name__)

CHZ_ORDER_LOAD_OPTIONS = (
    selectinload(Order.items).selectinload(OrderItem.item),
    selectinload(Order.items).selectinload(OrderItem.suggested_stock),
    selectinload(Order.chz_requests).selectinload(ChzRequest.items),
    selectinload(Order.chz_requests).selectinload(ChzRequest.order),
    selectinload(Order.chz_requests).selectinload(ChzRequest.requested_by),
)

MANUAL_CHZ_LOAD_OPTIONS = (
    selectinload(ManualChzRequest.items),
    selectinload(ManualChzRequest.requested_by),
)


async def create_chz_request(
    db: AsyncSession,
    *,
    order_id: int,
    payload: ChzRequestCreate,
    requested_by_user_id: int | None,
) -> ChzRequest:
    order = await db.scalar(
        select(Order)
        .options(*CHZ_ORDER_LOAD_OPTIONS)
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if not payload.order_item_ids:
        raise HTTPException(status_code=400, detail="Select at least one order item")

    order_items = [item for item in order.items if item.id in set(payload.order_item_ids)]
    if len(order_items) != len(set(payload.order_item_ids)):
        raise HTTPException(status_code=400, detail="Some selected order items do not belong to the order")

    for existing_request in order.chz_requests:
        if existing_request.is_active and existing_request.status != ChzRequestStatus.ready:
            existing_request.is_active = False
            existing_request.status = ChzRequestStatus.cancelled

    chz_request = ChzRequest(
        order_id=order.id,
        requested_by_user_id=requested_by_user_id,
        status=ChzRequestStatus.requested,
        is_active=True,
        comment=payload.comment,
    )
    db.add(chz_request)
    await db.flush()

    for order_item in order_items:
        db.add(
            ChzRequestItem(
                chz_request_id=chz_request.id,
                order_item_id=order_item.id,
                item_id=order_item.item_id,
                pairs_quantity=max(order_item.pairs_quantity - order_item.picked_pairs, 0),
                item_title=order_item.item.title if order_item.item else f"Товар #{order_item.item_id}",
                item_size=order_item.item_size or (order_item.item.size if order_item.item else None),
                item_color=order_item.item_color or (order_item.item.color if order_item.item else None),
                batch_number=order_item.suggested_stock.batch_number if order_item.suggested_stock else None,
            )
        )

    await db.commit()
    created_request = await _get_request_or_404(db, chz_request.id)

    await _push_to_external_bridge(order, created_request)
    return created_request


async def list_order_chz_requests(db: AsyncSession, order_id: int) -> list[ChzRequest]:
    order = await db.scalar(
        select(Order)
        .options(
            selectinload(Order.chz_requests).selectinload(ChzRequest.items),
            selectinload(Order.chz_requests).selectinload(ChzRequest.order),
            selectinload(Order.chz_requests).selectinload(ChzRequest.requested_by),
        )
        .where(Order.id == order_id, Order.is_deleted.is_(False))
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    return sorted(order.chz_requests, key=lambda request: request.requested_at, reverse=True)


async def list_pending_requests(db: AsyncSession) -> list[ChzRequest]:
    return list(
        (
            await db.scalars(
                select(ChzRequest)
                .options(
                    selectinload(ChzRequest.items),
                    selectinload(ChzRequest.order),
                    selectinload(ChzRequest.requested_by),
                )
                .where(
                    ChzRequest.is_active.is_(True),
                    ChzRequest.status.in_([ChzRequestStatus.requested, ChzRequestStatus.acknowledged]),
                )
                .order_by(ChzRequest.requested_at.asc())
            )
        ).all()
    )


async def acknowledge_request(
    db: AsyncSession,
    request_id: int,
    *,
    external_request_id: str | None = None,
) -> ChzRequest:
    request = await _get_request_or_404(db, request_id)
    request.status = ChzRequestStatus.acknowledged
    request.acknowledged_at = utc_now_naive()
    if external_request_id:
        request.external_request_id = external_request_id
    await db.commit()
    await db.refresh(request)
    return request


async def mark_request_ready(db: AsyncSession, request_id: int) -> ChzRequest:
    request = await _get_request_or_404(db, request_id)
    request.status = ChzRequestStatus.ready
    request.ready_at = utc_now_naive()
    request.is_active = False
    await db.commit()
    await db.refresh(request)
    return request


async def mark_order_active_request_ready(db: AsyncSession, order_id: int) -> ChzRequest:
    requests = await list_order_chz_requests(db, order_id)
    active_request = next(
        (
            request
            for request in requests
            if request.is_active and request.status != ChzRequestStatus.cancelled
        ),
        None,
    )
    if active_request is None:
        raise HTTPException(status_code=404, detail="No active CHZ request found")
    return await mark_request_ready(db, active_request.id)


async def create_manual_chz_request(
    db: AsyncSession,
    *,
    payload: ManualChzRequestCreate,
    requested_by_user_id: int | None,
) -> ManualChzRequest:
    item = await db.get(Item, payload.item_id)
    if item is None or item.is_deleted:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.inventory_type != ItemInventoryType.finished_goods:
        raise HTTPException(status_code=400, detail="Only finished goods can be used for a manual CHZ request")

    request = ManualChzRequest(
        requested_by_user_id=requested_by_user_id,
        status=ChzRequestStatus.requested,
        is_active=True,
        comment=payload.comment,
    )
    db.add(request)
    await db.flush()

    db.add(
        ManualChzRequestItem(
            request_id=request.id,
            item_id=item.id,
            pairs_quantity=payload.pairs_quantity,
            item_title=item.title,
            item_size=payload.item_size or item.size or None,
            item_color=payload.item_color or item.color or None,
            item_venchik=payload.item_venchik,
            batch_number=payload.batch_number,
        )
    )

    await db.commit()
    created_request = await _get_manual_request_or_404(db, request.id)
    await _push_manual_request_to_external_bridge(created_request)
    return created_request


async def list_pending_manual_requests(db: AsyncSession) -> list[ManualChzRequest]:
    return list(
        (
            await db.scalars(
                select(ManualChzRequest)
                .options(*MANUAL_CHZ_LOAD_OPTIONS)
                .where(
                    ManualChzRequest.is_active.is_(True),
                    ManualChzRequest.status.in_([ChzRequestStatus.requested, ChzRequestStatus.acknowledged]),
                )
                .order_by(ManualChzRequest.requested_at.asc())
            )
        ).all()
    )


async def acknowledge_manual_request(
    db: AsyncSession,
    request_id: int,
    *,
    external_request_id: str | None = None,
) -> ManualChzRequest:
    request = await _get_manual_request_or_404(db, request_id)
    request.status = ChzRequestStatus.acknowledged
    request.acknowledged_at = utc_now_naive()
    if external_request_id:
        request.external_request_id = external_request_id
    await db.commit()
    await db.refresh(request)
    return request


async def mark_manual_request_ready(db: AsyncSession, request_id: int) -> ManualChzRequest:
    request = await _get_manual_request_or_404(db, request_id)
    request.status = ChzRequestStatus.ready
    request.ready_at = utc_now_naive()
    request.is_active = False
    await db.commit()
    await db.refresh(request)
    return request


async def list_chz_registry_entries(db: AsyncSession) -> list[ChzRegistryEntryResponse]:
    shipment_requests = list(
        (
            await db.scalars(
                select(ChzRequest)
                .options(
                    selectinload(ChzRequest.items),
                    selectinload(ChzRequest.order),
                    selectinload(ChzRequest.requested_by),
                )
                .order_by(ChzRequest.requested_at.desc(), ChzRequest.id.desc())
            )
        ).all()
    )
    production_requests = list(
        (
            await db.scalars(
                select(ProductionChzRequest)
                .options(
                    selectinload(ProductionChzRequest.items),
                    selectinload(ProductionChzRequest.production_order),
                    selectinload(ProductionChzRequest.requested_by),
                )
                .order_by(ProductionChzRequest.requested_at.desc(), ProductionChzRequest.id.desc())
            )
        ).all()
    )
    manual_requests = list(
        (
            await db.scalars(
                select(ManualChzRequest)
                .options(*MANUAL_CHZ_LOAD_OPTIONS)
                .order_by(ManualChzRequest.requested_at.desc(), ManualChzRequest.id.desc())
            )
        ).all()
    )

    rows: list[ChzRegistryEntryResponse] = []
    for request in shipment_requests:
        for item in request.items:
            rows.append(
                ChzRegistryEntryResponse(
                    request_id=request.id,
                    source="shipment",
                    status=request.status.value if hasattr(request.status, "value") else str(request.status),
                    is_active=request.is_active,
                    order_id=request.order_id,
                    order_name=request.order_name,
                    author=request.requested_by_username,
                    comment=request.comment,
                    requested_at=request.requested_at,
                    acknowledged_at=request.acknowledged_at,
                    ready_at=request.ready_at,
                    item_id=item.item_id,
                    item_title=item.item_title,
                    item_size=item.item_size,
                    item_color=item.item_color,
                    batch_number=item.batch_number,
                    pairs_quantity=item.pairs_quantity,
                )
            )
    for request in production_requests:
        for item in request.items:
            rows.append(
                ChzRegistryEntryResponse(
                    request_id=request.id,
                    source="production",
                    status=request.status.value if hasattr(request.status, "value") else str(request.status),
                    is_active=request.is_active,
                    production_order_id=request.production_order_id,
                    order_id=request.production_order_id,
                    order_name=request.order_name,
                    author=request.requested_by_username,
                    comment=request.comment,
                    requested_at=request.requested_at,
                    acknowledged_at=request.acknowledged_at,
                    ready_at=request.ready_at,
                    item_id=item.item_id,
                    item_title=item.item_title,
                    item_size=item.item_size,
                    item_color=item.item_color,
                    batch_number=item.batch_number,
                    pairs_quantity=item.pairs_quantity,
                )
            )
    for request in manual_requests:
        for item in request.items:
            rows.append(
                ChzRegistryEntryResponse(
                    request_id=request.id,
                    source="manual",
                    status=request.status.value if hasattr(request.status, "value") else str(request.status),
                    is_active=request.is_active,
                    order_name=request.order_name,
                    author=request.requested_by_username,
                    comment=request.comment,
                    requested_at=request.requested_at,
                    acknowledged_at=request.acknowledged_at,
                    ready_at=request.ready_at,
                    item_id=item.item_id,
                    item_title=item.item_title,
                    item_size=item.item_size,
                    item_color=item.item_color,
                    item_venchik=item.item_venchik,
                    batch_number=item.batch_number,
                    pairs_quantity=item.pairs_quantity,
                )
            )

    return sorted(rows, key=lambda row: (row.requested_at, row.request_id), reverse=True)


async def cancel_chz_registry_entries(
    db: AsyncSession,
    entries: Sequence[ChzRegistryEntryRef],
) -> int:
    unique_entries = {
        (entry.source.strip().lower(), entry.request_id)
        for entry in entries
        if entry.request_id > 0
    }
    if not unique_entries:
        raise HTTPException(status_code=400, detail="Select at least one CHZ request")

    changed = 0
    for source, request_id in unique_entries:
        if source == "shipment":
            request = await _get_request_or_404(db, request_id)
            if request.status != ChzRequestStatus.cancelled or request.is_active:
                request.status = ChzRequestStatus.cancelled
                request.is_active = False
                changed += 1
            continue

        if source == "manual":
            request = await _get_manual_request_or_404(db, request_id)
            if request.status != ChzRequestStatus.cancelled or request.is_active:
                request.status = ChzRequestStatus.cancelled
                request.is_active = False
                changed += 1
            continue

        if source == "production":
            request = await _get_production_request_or_404(db, request_id)
            if request.status != ProductionChzStatus.cancelled or request.is_active:
                request.status = ProductionChzStatus.cancelled
                request.is_active = False
                changed += 1
            continue

        raise HTTPException(status_code=400, detail=f"Unsupported CHZ request source: {source}")

    await db.commit()
    return changed


async def _get_request_or_404(db: AsyncSession, request_id: int) -> ChzRequest:
    request = await db.scalar(
        select(ChzRequest)
        .options(
            selectinload(ChzRequest.items),
            selectinload(ChzRequest.order),
            selectinload(ChzRequest.requested_by),
        )
        .where(ChzRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="CHZ request not found")
    return request


async def _get_production_request_or_404(db: AsyncSession, request_id: int) -> ProductionChzRequest:
    request = await db.scalar(
        select(ProductionChzRequest)
        .options(
            selectinload(ProductionChzRequest.items),
            selectinload(ProductionChzRequest.production_order),
            selectinload(ProductionChzRequest.requested_by),
        )
        .where(ProductionChzRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Production CHZ request not found")
    return request


async def _get_manual_request_or_404(db: AsyncSession, request_id: int) -> ManualChzRequest:
    request = await db.scalar(
        select(ManualChzRequest)
        .options(*MANUAL_CHZ_LOAD_OPTIONS)
        .where(ManualChzRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Manual CHZ request not found")
    return request


async def _push_to_external_bridge(order: Order, request: ChzRequest) -> None:
    if not settings.chz_bridge_url:
        return

    endpoint = settings.chz_bridge_url.rstrip("/") + "/api/chz/requests"
    headers: dict[str, str] = {}
    if settings.chz_bridge_token_value:
        headers["X-CHZ-Token"] = settings.chz_bridge_token_value

    payload = {
        "request_id": request.id,
        "order_id": order.id,
        "order_name": order.name,
        "customer": order.customer,
        "comment": request.comment,
        "request_type": "shipment",
        "requested_by_user_id": request.requested_by_user_id,
        "requested_by_username": request.requested_by.username if request.requested_by else None,
        "requested_at": request.requested_at.isoformat() if request.requested_at else None,
        "items": [
            {
                "order_item_id": item.order_item_id,
                "item_id": item.item_id,
                "item_title": item.item_title,
                "item_size": item.item_size,
                "item_color": item.item_color,
                "batch_number": item.batch_number,
                "pairs_quantity": item.pairs_quantity,
            }
            for item in request.items
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.chz_request_timeout_seconds) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to push CHZ request %s to external bridge", request.id)


async def _push_manual_request_to_external_bridge(request: ManualChzRequest) -> None:
    if not settings.chz_bridge_url:
        return

    endpoint = settings.chz_bridge_url.rstrip("/") + "/api/chz/requests"
    headers: dict[str, str] = {}
    if settings.chz_bridge_token_value:
        headers["X-CHZ-Token"] = settings.chz_bridge_token_value

    payload = {
        "request_id": request.id,
        "order_name": request.order_name,
        "customer": "Ручной запрос",
        "comment": request.comment,
        "request_type": "manual",
        "requested_by_user_id": request.requested_by_user_id,
        "requested_by_username": request.requested_by_username,
        "requested_at": request.requested_at.isoformat() if request.requested_at else None,
        "callback_path": "/integration/manual-chz/requests",
        "items": [
            {
                "item_id": item.item_id,
                "item_title": item.item_title,
                "item_size": item.item_size,
                "item_color": item.item_color,
                "item_venchik": item.item_venchik,
                "batch_number": item.batch_number,
                "pairs_quantity": item.pairs_quantity,
            }
            for item in request.items
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.chz_request_timeout_seconds) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to push manual CHZ request %s to external bridge", request.id)
