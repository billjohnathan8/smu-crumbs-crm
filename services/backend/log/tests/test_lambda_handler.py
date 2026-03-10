"""Smoke tests for the log-service AWS Lambda handler."""

from __future__ import annotations

import json

import pytest

mangum = pytest.importorskip("mangum")
Mangum = mangum.Mangum

# Imported after `importorskip` so the test module is skipped cleanly when `mangum`
# is unavailable in local/dev environments.
import lambda_function  # noqa: E402
from app.main import create_app  # noqa: E402


class _FakeLogService:
    def bootstrap(self) -> None:
        return

    def health(self) -> bool:
        return True

    def list_logs(self, **_kwargs):
        return [], 0


def _http_api_v2_event(method: str, path: str) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {
            "host": "example.execute-api.ap-southeast-1.amazonaws.com",
            "x-forwarded-proto": "https",
        },
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "pytest",
            }
        },
        "isBase64Encoded": False,
    }


def test_lambda_handler_health_ok(monkeypatch) -> None:
    asgi_handler = Mangum(create_app(_FakeLogService()))
    monkeypatch.setattr(lambda_function, "_get_asgi_handler", lambda: asgi_handler)

    response = lambda_function.lambda_handler(
        _http_api_v2_event("GET", "/health"), None
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "ok"
    assert body["service"] == "log"


def test_lambda_handler_unauthorized_without_token(monkeypatch) -> None:
    asgi_handler = Mangum(create_app(_FakeLogService()))
    monkeypatch.setattr(lambda_function, "_get_asgi_handler", lambda: asgi_handler)

    response = lambda_function.lambda_handler(
        _http_api_v2_event("GET", "/api/logs"),
        None,
    )

    assert response["statusCode"] == 401
    body = json.loads(response["body"])
    assert body["error"] == "unauthorized"
