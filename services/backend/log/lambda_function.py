"""AWS Lambda entrypoint for the direct log-service router."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import Settings
from app.lambda_router import LambdaRouter
from app.repository import LogRepository
from app.service import LogService


@dataclass
class _Runtime:
    settings: Settings
    service: LogService
    router: LambdaRouter


_runtime: _Runtime | None = None


def _build_runtime() -> _Runtime:
    settings = Settings()
    service = LogService(LogRepository(settings))
    service.bootstrap()
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
