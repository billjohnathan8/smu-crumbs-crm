import base64
import json

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


def test_lambda_handler_requires_log_api_base_url():
    with pytest.raises(ValueError, match="LOG_API_BASE_URL is required"):
        lambda_function.lambda_handler({}, None)


def test_resolve_authorization_header_precedence(monkeypatch):
    monkeypatch.setenv("VERIFICATION_LOG_AUTH_HEADER", "Custom abc")
    monkeypatch.setenv("VERIFICATION_LOG_BEARER_TOKEN", "token-1")
    monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "secret")

    assert lambda_function._resolve_authorization_header() == "Custom abc"


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


def test_extract_feedback_parses_bounce():
    message = {
        "eventType": "Bounce",
        "mail": {"messageId": "ses-1"},
        "bounce": {"bounceType": "Permanent", "bounceSubType": "General"},
    }
    provider_message_id, event_type, error_message = lambda_function._extract_feedback(message)

    assert provider_message_id == "ses-1"
    assert event_type == "BOUNCE"
    assert "Permanent/General" in error_message


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
                            "bounce": {"bounceType": "Permanent", "bounceSubType": "General"},
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
