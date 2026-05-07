"""
Domain exceptions + structured logging setup.

Exception hierarchy:
    StrawberryError (base)
    ├── NotFoundError      → 404
    ├── ValidationError    → 400
    ├── ProviderError      → 502 (LLM/image provider failure)
    ├── PermissionError    → 403
    └── ConflictError      → 409
"""
from __future__ import annotations

import logging
import os
import sys
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# ============================================================================
# Domain exceptions
# ============================================================================

class StrawberryError(Exception):
    """Base for all domain errors. Maps to a JSON response with status_code."""
    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        context: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.context = context or {}


class NotFoundError(StrawberryError):
    status_code = 404
    code = "not_found"


class ValidationError(StrawberryError):
    status_code = 400
    code = "validation_error"


class ProviderError(StrawberryError):
    """Upstream LLM / image provider failed."""
    status_code = 502
    code = "provider_error"


class PermissionError(StrawberryError):  # noqa: A001 - shadow built-in intentionally
    status_code = 403
    code = "permission_denied"


class ConflictError(StrawberryError):
    status_code = 409
    code = "conflict"


# ============================================================================
# Structured logging
# ============================================================================

def configure_logging(*, json_logs: bool | None = None, level: str = "INFO") -> None:
    """Configure structlog. Pretty in dev, JSON in prod."""
    if json_logs is None:
        json_logs = os.getenv("LOG_JSON", "").lower() in ("1", "true", "yes")

    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if json_logs:
        shared_processors.append(structlog.processors.JSONRenderer())
    else:
        shared_processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level.upper(), logging.INFO)),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


# ============================================================================
# FastAPI exception handlers
# ============================================================================

log = structlog.get_logger(__name__)


def install_exception_handlers(app: FastAPI) -> None:
    """Attach JSON exception handlers for domain errors and unhandled crashes."""

    @app.exception_handler(StrawberryError)
    async def _domain_handler(request: Request, exc: StrawberryError) -> JSONResponse:
        log.warning(
            "domain_error",
            path=request.url.path,
            method=request.method,
            code=exc.code,
            message=exc.message,
            context=exc.context,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "code": exc.code,
                "context": exc.context or None,
            },
        )

    @app.exception_handler(Exception)
    async def _crash_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "code": "internal_error",
            },
        )
