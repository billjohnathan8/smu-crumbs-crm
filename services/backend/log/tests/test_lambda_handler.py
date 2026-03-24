"""Smoke tests for the direct log-service AWS Lambda handler."""

from __future__ import annotations

import json
from dataclasses import dataclass

import lambda_function
from app.lambda_router import LambdaRouter


@dataclass(frozen=True)
class FakeSettings:
    jwt_hmac_secret: str = "test-secret"
    auth_mode: str = "local"
    cognito_jwks_url: str = ""
    cognito_issuer: str = ""
    cognito_audience: str = ""
    client_service_url: str = "http://localhost:8080"


class FakeService:
    def __init__(self) -> None:
        self.bootstrap_calls = 0

    def bootstrap(self) -> None:
        self.bootstrap_calls += 1

    def health(self) -> bool:
        return True

    def list_logs(self, **_kwargs):
        return [], 0


def _runtime(service: FakeService) -> lambda_function._Runtime:
    settings = FakeSettings()
    return lambda_function._Runtime(
        settings=settings,
        service=service,
        router=LambdaRouter(service, settings),
    )


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


def _rest_proxy_event(method: str, path: str) -> dict:
    return {
        "httpMethod": method,
        "path": path,
        "headers": {
            "host": "localhost",
        },
        "requestContext": {
            "stage": "dev",
            "path": path,
        },
        "isBase64Encoded": False,
    }


def test_lambda_handler_health_ok(monkeypatch) -> None:
    service = FakeService()
    monkeypatch.setattr(lambda_function, "_runtime", _runtime(service))

    response = lambda_function.lambda_handler(
        _http_api_v2_event("GET", "/health"), None
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "ok"
    assert body["service"] == "log"


def test_lambda_handler_unauthorized_without_token(monkeypatch) -> None:
    service = FakeService()
    monkeypatch.setattr(lambda_function, "_runtime", _runtime(service))

    response = lambda_function.lambda_handler(
        _http_api_v2_event("GET", "/api/logs"), None
    )

    assert response["statusCode"] == 401
    body = json.loads(response["body"])
    assert body["error"] == "unauthorized"


def test_lambda_handler_supports_rest_proxy_shape(monkeypatch) -> None:
    service = FakeService()
    monkeypatch.setattr(lambda_function, "_runtime", _runtime(service))

    response = lambda_function.lambda_handler(
        _rest_proxy_event("GET", "/_user_request_/health"),
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "ok"


def test_lambda_handler_builds_runtime_once(monkeypatch) -> None:
    calls = {"count": 0}
    runtime = _runtime(FakeService())

    def fake_build_runtime() -> lambda_function._Runtime:
        calls["count"] += 1
        return runtime

    monkeypatch.setattr(lambda_function, "_runtime", None)
    monkeypatch.setattr(lambda_function, "_build_runtime", fake_build_runtime)

    first = lambda_function.lambda_handler(_http_api_v2_event("GET", "/health"), None)
    second = lambda_function.lambda_handler(_http_api_v2_event("GET", "/health"), None)

    assert first["statusCode"] == 200
    assert second["statusCode"] == 200
    assert calls["count"] == 1
