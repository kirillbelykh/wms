from __future__ import annotations

import redis.asyncio as aioredis

from backend.app.core.config import settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    global _redis

    if settings.redis_disabled:
        return None

    if _redis is None:
        try:
            _redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await _redis.ping()
            logger.info("Redis connection established")
        except Exception:
            logger.exception("Redis connection failed, rate limiting will be bypassed")
            _redis = None
            return None

    return _redis


async def check_login_rate_limit(identifier: str) -> bool:
    redis = await get_redis()
    if redis is None:
        return True

    try:
        key = f"login_attempts:{identifier}"
        current = await redis.get(key)
        if current is None:
            await redis.setex(key, settings.login_rate_window, 1)
            return True
        if int(current) >= settings.login_rate_limit:
            return False
        await redis.incr(key)
        return True
    except Exception:
        logger.exception("Redis rate-limit check failed")
        return True


async def get_remaining_attempts(identifier: str) -> int:
    redis = await get_redis()
    if redis is None:
        return settings.login_rate_limit

    try:
        current = await redis.get(f"login_attempts:{identifier}")
        if current is None:
            return settings.login_rate_limit
        return max(0, settings.login_rate_limit - int(current))
    except Exception:
        logger.exception("Redis remaining-attempts lookup failed")
        return settings.login_rate_limit


async def reset_rate_limit(identifier: str) -> bool:
    redis = await get_redis()
    if redis is None:
        return True

    try:
        await redis.delete(f"login_attempts:{identifier}")
        return True
    except Exception:
        logger.exception("Redis rate-limit reset failed")
        return False
