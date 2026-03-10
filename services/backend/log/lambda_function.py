"""AWS Lambda entrypoint for the log service.

This keeps the service Lambda-first while reusing the FastAPI app/router logic.
"""

from __future__ import annotations

from typing import Any

from mangum import Mangum

from app.main import create_app

_asgi_handler: Mangum | None = None


def _get_asgi_handler() -> Mangum:
    """Create/caches the Mangum adapter for the FastAPI app."""
    global _asgi_handler
    if _asgi_handler is None:
        _asgi_handler = Mangum(create_app(), lifespan="auto")
    return _asgi_handler


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda handler compatible with API Gateway HTTP API v2 proxy events."""
    return _get_asgi_handler()(event, context)

