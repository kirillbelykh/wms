from __future__ import annotations

import base64
import hashlib
import json
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from backend.app.core.config import settings

P256_ORDER = int("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


@lru_cache
def _private_key() -> ec.EllipticCurvePrivateKey:
    digest = hashlib.sha256(settings.secret_key_value.encode("utf-8")).digest()
    scalar = (int.from_bytes(digest, "big") % (P256_ORDER - 1)) + 1
    return ec.derive_private_key(scalar, ec.SECP256R1())


@lru_cache
def vapid_private_key_pem() -> str:
    return _private_key().private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("ascii")


@lru_cache
def vapid_private_key() -> str:
    raw_private_key = _private_key().private_numbers().private_value.to_bytes(32, "big")
    return _base64url(raw_private_key)


@lru_cache
def vapid_public_key() -> str:
    public_key = _private_key().public_key()
    raw_public_key = public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _base64url(raw_public_key)


def push_subscription_info(endpoint: str, p256dh: str, auth: str) -> dict:
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
    }


def push_payload_json(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
