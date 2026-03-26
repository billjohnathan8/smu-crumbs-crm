import base64
import io
import json
import urllib.error

import pytest

import lambda_function


def _decode_jwt_payload(token: str) -> dict:
    payload_segment = token.split(".")[1]
    padding = "=" * (-len(payload_segment) % 4)
    payload_bytes = base64.urlsafe_b64decode(payload_segment + padding)
    return json.loads(payload_bytes.decode("utf-8"))


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    for key in (
        "LOG_API_BASE_URL",
        "VERIFICATION_LOG_AUTH_HEADER",
        "VERIFICATION_LOG_BEARER_TOKEN",
        "VERIFICATION_JWT_HMAC_SECRET",
        "VERIFICATION_JWT_HMAC_SECRET_ARN",
        "VERIFICATION_JWT_SUB",
        "VERIFICATION_JWT_ROLE",
        "VERIFICATION_JWT_TTL_SECONDS",
        "JWT_HMAC_SECRET_ARN",
    ):
        monkeypatch.delenv(key, raising=False)
    lambda_function._JWT_SECRET_CACHE = None
    yield
    lambda_function._JWT_SECRET_CACHE = None


def test_lambda_handler_missing_log_api_base_url_skips_feedback_records():
    event = {
        "Records": [
            {
                "Sns": {
                    "Message": json.dumps(
                        {"eventType": "Delivery", "mail": {"messageId": "ses-1"}}
                    )
                }
            }
        ]
    }
    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["skipped"] == 1
    assert body["updated"] == 0


def test_resolve_authorization_header_precedence(monkeypatch):
    monkeypatch.setenv("VERIFICATION_LOG_AUTH_HEADER", "Custom abc")
    monkeypatch.setenv("VERIFICATION_LOG_BEARER_TOKEN", "token-1")
    monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "secret")

    assert lambda_function._resolve_authorization_header() == "Custom abc"


def test_resolve_authorization_header_uses_bearer_token_when_no_explicit(monkeypatch):
    monkeypatch.setenv("VERIFICATION_LOG_BEARER_TOKEN", "token-1")
    assert lambda_function._resolve_authorization_header() == "Bearer token-1"


def test_resolve_authorization_header_mints_jwt(monkeypatch):
    monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "jwt-secret")
    monkeypatch.setenv("VERIFICATION_JWT_SUB", "SYSTEM_TEST")
    monkeypatch.setenv("VERIFICATION_JWT_ROLE", "admin")

    authorization = lambda_function._resolve_authorization_header()
    assert authorization is not None
    assert authorization.startswith("Bearer ")
    payload = _decode_jwt_payload(authorization.removeprefix("Bearer "))
    assert payload["sub"] == "SYSTEM_TEST"
    assert payload["role"] == "admin"
    assert payload["exp"] > payload["iat"]


def test_mint_service_jwt_uses_configured_ttl(monkeypatch):
    monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "jwt-secret")
    monkeypatch.setenv("VERIFICATION_JWT_TTL_SECONDS", "42")

    token = lambda_function._mint_service_jwt()
    assert token is not None
    payload = _decode_jwt_payload(token)
    assert payload["exp"] - payload["iat"] == 42


def test_load_service_jwt_secret_from_secrets_manager_and_cache(monkeypatch):
    monkeypatch.setenv(
        "VERIFICATION_JWT_HMAC_SECRET_ARN",
        "arn:aws:secretsmanager:ap-southeast-1:123:secret:verification",
    )
    calls = []

    class FakeSecretsManagerClient:
        def get_secret_value(self, SecretId):  # noqa: N803 - boto3 naming convention
            calls.append(SecretId)
            return {"SecretString": "secret-from-sm"}

    class FakeBoto3:
        @staticmethod
        def client(name):
            assert name == "secretsmanager"
            return FakeSecretsManagerClient()

    monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

    assert lambda_function._load_service_jwt_secret() == "secret-from-sm"
    assert lambda_function._load_service_jwt_secret() == "secret-from-sm"
    assert calls == ["arn:aws:secretsmanager:ap-southeast-1:123:secret:verification"]


def test_load_service_jwt_secret_returns_none_without_boto3(monkeypatch):
    monkeypatch.setenv(
        "VERIFICATION_JWT_HMAC_SECRET_ARN",
        "arn:aws:secretsmanager:ap-southeast-1:123:secret:verification",
    )
    monkeypatch.setattr(lambda_function, "boto3", None)
    assert lambda_function._load_service_jwt_secret() is None


def test_extract_feedback_parses_bounce():
    message = {
        "eventType": "Bounce",
        "mail": {"messageId": "ses-1"},
        "bounce": {"bounceType": "Permanent", "bounceSubType": "General"},
    }
    provider_message_id, event_type, error_message = lambda_function._extract_feedback(
        message
    )

    assert provider_message_id == "ses-1"
    assert event_type == "BOUNCE"
    assert "Permanent/General" in error_message


@pytest.mark.parametrize(
    ("event_type", "expected"),
    [
        ("BOUNCE", "failed"),
        ("COMPLAINT", "failed"),
        ("REJECT", "failed"),
        ("DELIVERY", "sent"),
        ("SEND", "sent"),
        ("RENDERING_FAILURE", "sent"),
        ("UNKNOWN", "queued"),
    ],
)
def test_status_for_event(event_type, expected):
    assert lambda_function._status_for_event(event_type) == expected


@pytest.mark.parametrize(
    ("message", "expected_error"),
    [
        (
            {
                "eventType": "Complaint",
                "mail": {"messageId": "ses-2"},
                "complaint": {"complaintFeedbackType": "abuse"},
            },
            "SES complaint: abuse",
        ),
        (
            {
                "eventType": "Reject",
                "mail": {"messageId": "ses-3"},
                "reject": {"reason": "Policy"},
            },
            "SES reject: Policy",
        ),
    ],
)
def test_extract_feedback_parses_other_failure_types(message, expected_error):
    provider_message_id, event_type, error_message = lambda_function._extract_feedback(
        message
    )
    assert provider_message_id is not None
    assert event_type in {"COMPLAINT", "REJECT"}
    assert error_message == expected_error


def test_update_communication_feedback_builds_expected_http_request(monkeypatch):
    monkeypatch.setattr(
        lambda_function,
        "_resolve_authorization_header",
        lambda: "Bearer service-token",
    )
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def getcode(self):
            return 202

        def read(self):
            return b'{"ok":true}'

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["method"] = request.get_method()
        captured["headers"] = {k.lower(): v for k, v in request.header_items()}
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(lambda_function.urllib.request, "urlopen", fake_urlopen)

    status_code, body = lambda_function._update_communication_feedback(
        log_api_base_url="https://log-api.local/",
        provider_message_id="ses/id+1",
        event_type="COMPLAINT",
        error_message="SES complaint: abuse",
    )

    assert status_code == 202
    assert body == '{"ok":true}'
    assert captured["url"].endswith("/api/communications/provider/ses%2Fid%2B1/status")
    assert captured["method"] == "PATCH"
    assert captured["timeout"] == 15
    assert captured["headers"]["content-type"] == "application/json"
    assert captured["headers"]["authorization"] == "Bearer service-token"
    assert captured["payload"] == {
        "status": "failed",
        "deliveryEvent": "COMPLAINT",
        "errorMessage": "SES complaint: abuse",
    }


def test_lambda_handler_updates_for_valid_sns_records(monkeypatch):
    monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
    calls = []

    def fake_update(base_url, provider_message_id, event_type, error_message):
        calls.append((base_url, provider_message_id, event_type, error_message))
        return 200, '{"ok":true}'

    monkeypatch.setattr(
        lambda_function,
        "_update_communication_feedback",
        fake_update,
    )
    event = {
        "Records": [
            {
                "Sns": {
                    "Message": json.dumps(
                        {
                            "eventType": "Delivery",
                            "mail": {"messageId": "ses-42"},
                        }
                    )
                }
            }
        ]
    }

    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["updated"] == 1
    assert body["skipped"] == 0
    assert calls[0][1] == "ses-42"
    assert calls[0][2] == "DELIVERY"


def test_lambda_handler_verification_feedback_delivery_and_bounce(monkeypatch):
    monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
    calls = []

    def fake_update(base_url, provider_message_id, event_type, error_message):
        calls.append((base_url, provider_message_id, event_type, error_message))
        return 200, '{"ok":true}'

    monkeypatch.setattr(
        lambda_function,
        "_update_communication_feedback",
        fake_update,
    )
    event = {
        "Records": [
            {
                "Sns": {
                    "Message": json.dumps(
                        {
                            "eventType": "Delivery",
                            "mail": {"messageId": "ses-delivery-1"},
                        }
                    )
                }
            },
            {
                "Sns": {
                    "Message": json.dumps(
                        {
                            "eventType": "Bounce",
                            "mail": {"messageId": "ses-bounce-1"},
                            "bounce": {
                                "bounceType": "Permanent",
                                "bounceSubType": "General",
                            },
                        }
                    )
                }
            },
        ]
    }

    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["updated"] == 2
    assert body["skipped"] == 0
    assert body["failedUpdates"] == []
    assert calls == [
        ("https://example.com", "ses-delivery-1", "DELIVERY", None),
        (
            "https://example.com",
            "ses-bounce-1",
            "BOUNCE",
            "SES bounce: Permanent/General",
        ),
    ]


def test_lambda_handler_skips_invalid_and_reports_partial_failures(monkeypatch):
    monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")

    def fake_update(base_url, provider_message_id, event_type, error_message):
        raise RuntimeError("network down")

    monkeypatch.setattr(
        lambda_function,
        "_update_communication_feedback",
        fake_update,
    )
    event = {
        "Records": [
            {"Sns": {"Message": "not-json"}},
            {
                "Sns": {
                    "Message": json.dumps(
                        {
                            "eventType": "Bounce",
                            "mail": {"messageId": "ses-77"},
                            "bounce": {
                                "bounceType": "Permanent",
                                "bounceSubType": "General",
                            },
                        }
                    )
                }
            },
        ]
    }

    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 207
    assert body["updated"] == 0
    assert body["skipped"] == 1
    assert body["failedUpdates"][0]["providerMessageId"] == "ses-77"


def test_lambda_handler_reports_http_error_details(monkeypatch):
    monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")

    def fake_update(base_url, provider_message_id, event_type, error_message):
        raise urllib.error.HTTPError(
            url="https://example.com/api/communications/provider/ses-99/status",
            code=409,
            msg="Conflict",
            hdrs=None,
            fp=io.BytesIO(b'{"error":"conflict"}'),
        )

    monkeypatch.setattr(
        lambda_function,
        "_update_communication_feedback",
        fake_update,
    )
    event = {
        "Records": [
            {
                "Sns": {
                    "Message": json.dumps(
                        {
                            "eventType": "Delivery",
                            "mail": {"messageId": "ses-99"},
                        }
                    )
                }
            }
        ]
    }

    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 207
    assert body["updated"] == 0
    assert body["skipped"] == 0
    assert body["failedUpdates"] == [
        {"providerMessageId": "ses-99", "statusCode": "409"}
    ]


def test_lambda_handler_skips_records_without_provider_message_id(monkeypatch):
    monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
    called = {"count": 0}

    def fake_update(base_url, provider_message_id, event_type, error_message):
        called["count"] += 1
        return 200, '{"ok":true}'

    monkeypatch.setattr(
        lambda_function,
        "_update_communication_feedback",
        fake_update,
    )
    event = {
        "Records": [
            {"Sns": {"Message": json.dumps({"eventType": "Delivery", "mail": {}})}},
        ]
    }

    response = lambda_function.lambda_handler(event, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["updated"] == 0
    assert body["skipped"] == 1
    assert body["failedUpdates"] == []
    assert called["count"] == 0
