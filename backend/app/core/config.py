from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url
    if database_url.startswith("postgresql+psycopg2://"):
        return database_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if database_url.startswith("sqlite:///"):
        return database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return database_url


class Settings(BaseSettings):
    database_url: str
    secret_key: SecretStr
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    redis_url: str = "redis://redis:6379/0"
    redis_disabled: bool = False
    login_rate_limit: int = 5
    login_rate_window: int = 60
    cors_origin: str | None = None
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:4173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:4173",
            "http://127.0.0.1:5173",
        ]
    )
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    timezone: str = "Europe/Moscow"
    chz_bridge_url: str | None = None
    chz_bridge_token: SecretStr | None = None
    chz_request_timeout_seconds: int = 10
    web_push_subject: str = "mailto:admin@wms.local"
    web_push_disabled: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        raise TypeError("cors_origins must be a comma-separated string or list")

    @computed_field
    @property
    def async_database_url(self) -> str:
        return _normalize_database_url(self.database_url)

    @property
    def secret_key_value(self) -> str:
        return self.secret_key.get_secret_value()

    @property
    def chz_bridge_token_value(self) -> str | None:
        if self.chz_bridge_token is None:
            return None
        return self.chz_bridge_token.get_secret_value()

    @property
    def allowed_cors_origins(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.cors_origin and self.cors_origin not in origins:
            origins.append(self.cors_origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
