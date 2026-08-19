from __future__ import annotations

import logging
import logging.config
from typing import Final


DEFAULT_LOG_FORMAT: Final[str] = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"


def configure_logging(level: str = "INFO") -> None:
    normalized_level = level.upper()
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": DEFAULT_LOG_FORMAT,
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                }
            },
            "root": {
                "handlers": ["console"],
                "level": normalized_level,
            },
            "loggers": {
                "uvicorn": {"level": normalized_level},
                "uvicorn.error": {"level": normalized_level},
                "uvicorn.access": {"level": normalized_level},
                "sqlalchemy.engine": {"level": "WARNING"},
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
