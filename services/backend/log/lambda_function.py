"""AWS Lambda entrypoint for the direct log-service router."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

from app.config import Settings
from app.lambda_router import LambdaRouter
from app.repository import LogRepository
from app.service import LogService

# Configure logging for CloudWatch - CRITICAL for production visibility
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(asctime)s %(name)s - %(message)s",
    force=True,  # Override any existing handlers
)


@dataclass
class _Runtime:
    settings: Settings
    service: LogService
    router: LambdaRouter


_runtime: _Runtime | None = None
LOGGER = logging.getLogger("log")


def _build_runtime() -> _Runtime:
    settings = Settings()
    service = LogService(LogRepository(settings))
    if settings.run_migrations_on_start:
        try:
            service.bootstrap()
        except Exception:
            LOGGER.exception("log service bootstrap failed")
    return _Runtime(
        settings=settings, service=service, router=LambdaRouter(service, settings)
    )


def _get_runtime() -> _Runtime:
    global _runtime
    if _runtime is None:
        _runtime = _build_runtime()
    return _runtime


def handle_event(
    event: dict[str, Any],
    *,
    service: LogService,
    settings: Settings,
) -> dict[str, Any]:
    """Handle a Lambda event with injected dependencies (test helper)."""
    return LambdaRouter(service, settings).handle(event)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda handler compatible with API Gateway proxy events."""
    del context
    return _get_runtime().router.handle(event)
