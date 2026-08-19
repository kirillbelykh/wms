from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    MSK_TZ = ZoneInfo("Europe/Moscow")
except ZoneInfoNotFoundError:
    # Windows dev environments may miss the IANA timezone database.
    MSK_TZ = timezone(timedelta(hours=3))


def utc_now() -> datetime:
    return datetime.now(UTC)


def utc_now_naive() -> datetime:
    return utc_now().replace(tzinfo=None)


def ensure_aware(value: datetime, *, default_tz=UTC) -> datetime:
    if value.tzinfo is not None:
        return value
    return value.replace(tzinfo=default_tz)


def to_msk(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return ensure_aware(value).astimezone(MSK_TZ)


def to_msk_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return ensure_aware(value, default_tz=MSK_TZ).astimezone(MSK_TZ).replace(tzinfo=None)


def msk_day_bounds(value: date) -> tuple[datetime, datetime]:
    start = datetime.combine(value, time.min, tzinfo=MSK_TZ)
    end = datetime.combine(value, time.max, tzinfo=MSK_TZ)
    return start.astimezone(UTC), end.astimezone(UTC)
