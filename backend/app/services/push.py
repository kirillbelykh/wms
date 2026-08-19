from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal
from backend.app.core.logging import get_logger
from backend.app.core.web_push import push_payload_json, push_subscription_info, vapid_private_key
from backend.app.models.notification_preference import NotificationPreference
from backend.app.models.push_subscription import PushSubscription
from backend.app.schemas.push import NotificationPreferenceOption, PushSubscriptionCreate

logger = get_logger(__name__)

NOTIFICATION_OPTIONS: tuple[dict[str, str], ...] = (
    {
        "key": "order_created",
        "label": "Новые заказы",
        "description": "Создание новых клиентских заказов.",
    },
    {
        "key": "order_updates",
        "label": "Изменения заказов",
        "description": "Удаление, изменение и смена статусов заказов.",
    },
    {
        "key": "marking",
        "label": "Маркировка заказов",
        "description": "Запросы маркировки и готовность кодов по заказам.",
    },
    {
        "key": "production",
        "label": "Производство",
        "description": "Создание, запуск, завершение и передача продукции на склад.",
    },
    {
        "key": "production_supplies",
        "label": "Складские задания производства",
        "description": "Заявки на сырье, упаковку и выполнение складских заданий.",
    },
    {
        "key": "production_marking",
        "label": "Маркировка производства",
        "description": "Запросы маркировки для производственных заданий.",
    },
)

NOTIFICATION_OPTION_KEYS = {option["key"] for option in NOTIFICATION_OPTIONS}

EVENT_NOTIFICATION_KEYS: dict[str, str] = {
    "order_created": "order_created",
    "order_deleted": "order_updates",
    "order_updated": "order_updates",
    "order_status_changed": "order_updates",
    "chz_request_created": "marking",
    "chz_request_acknowledged": "marking",
    "manual_chz_requested": "marking",
    "manual_chz_acknowledged": "marking",
    "manual_chz_ready": "marking",
    "chz_codes_ready": "marking",
    "production_order_created": "production",
    "production_ready_to_work": "production",
    "production_stock_transferred": "production",
    "production_completed": "production",
    "production_supply_requested": "production_supplies",
    "production_supply_fulfilled": "production_supplies",
    "production_chz_requested": "production_marking",
    "production_chz_acknowledged": "production_marking",
    "production_chz_ready": "production_marking",
}


async def upsert_push_subscription(
    db: AsyncSession,
    *,
    user_id: int,
    payload: PushSubscriptionCreate,
    user_agent: str | None,
) -> PushSubscription:
    existing = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if existing is None:
        existing = PushSubscription(
            user_id=user_id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=user_agent,
        )
        db.add(existing)
    else:
        existing.user_id = user_id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = user_agent

    await db.flush()
    return existing


async def delete_push_subscription(db: AsyncSession, endpoint: str) -> None:
    await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))


async def get_notification_preferences(db: AsyncSession, user_id: int) -> list[NotificationPreferenceOption]:
    rows = list(
        (
            await db.scalars(
                select(NotificationPreference).where(NotificationPreference.user_id == user_id)
            )
        ).all()
    )
    enabled_by_key = {row.notification_key: row.enabled for row in rows}
    return [
        NotificationPreferenceOption(
            key=option["key"],
            label=option["label"],
            description=option["description"],
            enabled=enabled_by_key.get(option["key"], True),
        )
        for option in NOTIFICATION_OPTIONS
    ]


async def update_notification_preferences(
    db: AsyncSession,
    *,
    user_id: int,
    preferences: dict[str, bool],
) -> list[NotificationPreferenceOption]:
    existing_rows = list(
        (
            await db.scalars(
                select(NotificationPreference).where(NotificationPreference.user_id == user_id)
            )
        ).all()
    )
    rows_by_key = {row.notification_key: row for row in existing_rows}

    for key, enabled in preferences.items():
        if key not in NOTIFICATION_OPTION_KEYS:
            continue

        row = rows_by_key.get(key)
        if row is None:
            row = NotificationPreference(user_id=user_id, notification_key=key, enabled=enabled)
            db.add(row)
        else:
            row.enabled = enabled

    await db.flush()
    return await get_notification_preferences(db, user_id)


async def send_push_notifications(event: str, data: dict[str, Any]) -> None:
    payload = build_push_payload(event, data)
    if payload is None:
        return

    async with AsyncSessionLocal() as db:
        subscriptions = list((await db.scalars(select(PushSubscription))).all())
        if not subscriptions:
            return

        await _deliver_push_payload(
            db,
            subscriptions=subscriptions,
            payload=payload,
            notification_key=payload["notification_key"],
        )


async def send_test_push_notification(
    *,
    user_id: int,
    endpoint: str,
    username: str | None,
) -> int:
    async with AsyncSessionLocal() as db:
        subscription = await db.scalar(
            select(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.endpoint == endpoint,
            )
        )
        if subscription is None:
            return 0

        return await _deliver_push_payload(
            db,
            subscriptions=[subscription],
            payload={
                "title": "Проверка push-уведомлений",
                "body": f"Уведомления для {username or 'пользователя'} работают на этом устройстве.",
                "url": "/settings",
                "tag": f"wms-test-{user_id}",
                "icon": "/favicon.svg",
                "badge": "/favicon.svg",
                "requireInteraction": True,
            },
            notification_key=None,
            respect_preferences=False,
        )


async def _notification_enabled_by_user(
    db: AsyncSession,
    *,
    user_ids: set[int],
    notification_key: str,
) -> dict[int, bool]:
    if not user_ids:
        return {}

    rows = list(
        (
            await db.scalars(
                select(NotificationPreference).where(
                    NotificationPreference.user_id.in_(user_ids),
                    NotificationPreference.notification_key == notification_key,
                )
            )
        ).all()
    )
    return {row.user_id: row.enabled for row in rows}


async def _deliver_push_payload(
    db: AsyncSession,
    *,
    subscriptions: Sequence[PushSubscription],
    payload: dict[str, Any],
    notification_key: str | None,
    respect_preferences: bool = True,
) -> int:
    enabled_by_user: dict[int, bool] = {}
    if respect_preferences and notification_key:
        enabled_by_user = await _notification_enabled_by_user(
            db,
            user_ids={subscription.user_id for subscription in subscriptions},
            notification_key=notification_key,
        )

    expired_ids: list[int] = []
    sent_count = 0

    for subscription in subscriptions:
        if respect_preferences and notification_key and not enabled_by_user.get(subscription.user_id, True):
            continue

        try:
            await asyncio.to_thread(_send_push, subscription, payload)
            sent_count += 1
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {403, 404, 410}:
                expired_ids.append(subscription.id)
                logger.warning(
                    "Removing expired or incompatible web push subscription: id=%s status=%s",
                    subscription.id,
                    status_code,
                )
            else:
                logger.warning("Failed to send web push notification: %s", exc)
        except Exception:
            logger.exception("Unexpected web push notification error")

    if expired_ids:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(expired_ids)))
        await db.commit()

    logger.info(
        "Web push delivery finished: sent=%s subscriptions=%s notification_key=%s",
        sent_count,
        len(subscriptions),
        notification_key or "manual-test",
    )
    return sent_count


def _send_push(subscription: PushSubscription, payload: dict[str, Any]) -> None:
    webpush(
        subscription_info=push_subscription_info(subscription.endpoint, subscription.p256dh, subscription.auth),
        data=push_payload_json(payload),
        vapid_private_key=vapid_private_key(),
        vapid_claims={"sub": settings.web_push_subject},
        ttl=60 * 60,
        timeout=10,
    )


def build_push_payload(event: str, data: dict[str, Any]) -> dict[str, Any] | None:
    notification_key = EVENT_NOTIFICATION_KEYS.get(event)
    if notification_key is None:
        return None

    title = "WMS"
    body = "Новое событие в системе"
    url = "/orders"

    order_id = data.get("order_id")
    order_name = data.get("order_name") or (f"#{order_id}" if order_id else "заказ")
    production_order_id = data.get("production_order_id")
    production_name = data.get("name") or (f"#{production_order_id}" if production_order_id else "задание")

    if event == "order_created":
        title = "Новый заказ"
        body = f"{order_name} создан пользователем {data.get('created_by') or 'WMS'}"
        url = f"/orders/{order_id}" if order_id else "/orders"
    elif event == "order_deleted":
        title = "Заказ удален"
        body = f"Заказ {order_name} удален"
        url = "/orders"
    elif event == "order_updated":
        title = "Заказ обновлен"
        body = f"Изменен заказ {order_name}"
        url = f"/orders/{order_id}" if order_id else "/orders"
    elif event == "order_status_changed":
        title = "Статус заказа изменен"
        body = f"У заказа {order_name} изменился статус"
        url = f"/orders/{order_id}" if order_id else "/orders"
    elif event in {"chz_request_created", "manual_chz_requested"}:
        title = "Запрос маркировки"
        body = f"Создан запрос маркировки для {order_name}"
        url = "/marking/turnover/chz"
    elif event in {"chz_request_acknowledged", "manual_chz_acknowledged"}:
        title = "Маркировка в работе"
        body = f"Запрос маркировки принят в работу"
        url = "/marking/turnover/chz"
    elif event in {"chz_codes_ready", "manual_chz_ready"}:
        title = "Маркировка готова"
        body = f"Коды маркировки готовы для {order_name}"
        url = f"/orders/{order_id}" if order_id else "/marking/turnover/chz"
    elif event == "production_order_created":
        title = "Новое производство"
        body = f"Создано производственное задание {production_name}"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_supply_requested":
        title = "Нужны ресурсы"
        body = f"Для задания {production_name} запрошены ресурсы"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_supply_fulfilled":
        title = "Ресурсы переданы"
        body = f"Складское задание выполнено для {production_name}"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_ready_to_work":
        title = "Производство готово к работе"
        body = f"Задание {production_name} можно запускать"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_chz_requested":
        title = "Маркировка производства"
        body = f"Создан запрос маркировки для {production_name}"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_chz_acknowledged":
        title = "Маркировка производства в работе"
        body = "Оператор принял запрос маркировки производства"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_chz_ready":
        title = "Маркировка производства готова"
        body = f"Коды маркировки готовы для задания {production_name}"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_stock_transferred":
        title = "Готовая продукция на складе"
        body = f"Продукция по заданию {production_name} передана на склад"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    elif event == "production_completed":
        title = "Производство завершено"
        body = f"Задание {production_name} отмечено выполненным"
        url = f"/production/{production_order_id}" if production_order_id else "/production"
    else:
        return None

    return {
        "title": title,
        "body": body,
        "url": url,
        "tag": f"wms-{event}-{order_id or production_order_id or data.get('request_id') or ''}",
        "icon": "/favicon.svg",
        "badge": "/favicon.svg",
        "notification_key": notification_key,
    }
