import base64
import io
import json
import urllib.error

import pytest

import lambda_function


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _decode_jwt_payload(token: str) -> dict:
    payload_segment = token.split(".")[1]
    padding = "=" * (-len(payload_segment) % 4)
    payload_bytes = base64.urlsafe_b64decode(payload_segment + padding)
    return json.loads(payload_bytes.decode("utf-8"))


def _make_sns_event(*messages: dict) -> dict:
    """Wrap one or more message dicts into a Lambda SNS event."""
    return {"Records": [{"Sns": {"Message": json.dumps(msg)}} for msg in messages]}


def _delivery_message(message_id: str = "ses-42") -> dict:
    return {"eventType": "Delivery", "mail": {"messageId": message_id}}


def _bounce_message(message_id: str = "ses-bounce-1") -> dict:
    return {
        "eventType": "Bounce",
        "mail": {"messageId": message_id},
        "bounce": {"bounceType": "Permanent", "bounceSubType": "General"},
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


@pytest.fixture
def fake_update(monkeypatch):
    """Spy that patches _update_communication_feedback; set .side_effect to raise."""

    class FakeUpdate:
        calls = []
        side_effect = None

    def _fake(base_url, provider_message_id, event_type, error_message):
        FakeUpdate.calls.append(
            (base_url, provider_message_id, event_type, error_message)
        )
        if FakeUpdate.side_effect:
            raise FakeUpdate.side_effect
        return 200, '{"ok":true}'

    monkeypatch.setattr(lambda_function, "_update_communication_feedback", _fake)
    return FakeUpdate


# ---------------------------------------------------------------------------
# _resolve_authorization_header
# ---------------------------------------------------------------------------


class TestResolveAuthorizationHeader:
    def test_explicit_header_takes_precedence(self, monkeypatch):
        monkeypatch.setenv("VERIFICATION_LOG_AUTH_HEADER", "Custom abc")
        monkeypatch.setenv("VERIFICATION_LOG_BEARER_TOKEN", "token-1")
        monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "secret")

        assert lambda_function._resolve_authorization_header() == "Custom abc"

    def test_bearer_token_used_when_no_explicit_header(self, monkeypatch):
        monkeypatch.setenv("VERIFICATION_LOG_BEARER_TOKEN", "token-1")

        assert lambda_function._resolve_authorization_header() == "Bearer token-1"

    def test_mints_jwt_when_no_static_credentials(self, monkeypatch):
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

    def test_returns_none_when_no_credentials_configured(self):
        assert lambda_function._resolve_authorization_header() is None


# ---------------------------------------------------------------------------
# _mint_service_jwt
# ---------------------------------------------------------------------------


class TestMintServiceJwt:
    def test_respects_configured_ttl(self, monkeypatch):
        monkeypatch.setenv("VERIFICATION_JWT_HMAC_SECRET", "jwt-secret")
        monkeypatch.setenv("VERIFICATION_JWT_TTL_SECONDS", "42")

        token = lambda_function._mint_service_jwt()

        assert token is not None
        payload = _decode_jwt_payload(token)
        assert payload["exp"] - payload["iat"] == 42

    def test_returns_none_without_secret(self):
        assert lambda_function._mint_service_jwt() is None


# ---------------------------------------------------------------------------
# _load_service_jwt_secret
# ---------------------------------------------------------------------------


class TestLoadServiceJwtSecret:
    def test_loads_from_secrets_manager_and_caches(self, monkeypatch):
        monkeypatch.setenv(
            "VERIFICATION_JWT_HMAC_SECRET_ARN",
            "arn:aws:secretsmanager:ap-southeast-1:123:secret:verification",
        )
        calls = []

        class FakeSecretsManagerClient:
            def get_secret_value(self, SecretId):  # noqa: N803
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
        assert len(calls) == 1, "Secrets Manager should only be called once (cached)"

    def test_returns_none_without_boto3(self, monkeypatch):
        monkeypatch.setenv(
            "VERIFICATION_JWT_HMAC_SECRET_ARN",
            "arn:aws:secretsmanager:ap-southeast-1:123:secret:verification",
        )
        monkeypatch.setattr(lambda_function, "boto3", None)

        assert lambda_function._load_service_jwt_secret() is None

    def test_returns_none_when_secrets_manager_raises(self, monkeypatch):
        monkeypatch.setenv(
            "VERIFICATION_JWT_HMAC_SECRET_ARN",
            "arn:aws:secretsmanager:ap-southeast-1:123:secret:verification",
        )

        class FakeSecretsManagerClient:
            def get_secret_value(self, SecretId):  # noqa: N803
                raise RuntimeError("connection timeout")

        class FakeBoto3:
            @staticmethod
            def client(name):
                return FakeSecretsManagerClient()

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        result = lambda_function._load_service_jwt_secret()

        assert result is None
        assert lambda_function._JWT_SECRET_CACHE is None


# ---------------------------------------------------------------------------
# _extract_feedback
# ---------------------------------------------------------------------------


class TestExtractFeedback:
    def test_parses_bounce(self):
        message = {
            "eventType": "Bounce",
            "mail": {"messageId": "ses-1"},
            "bounce": {"bounceType": "Permanent", "bounceSubType": "General"},
        }

        provider_message_id, event_type, error_message = (
            lambda_function._extract_feedback(message)
        )

        assert provider_message_id == "ses-1"
        assert event_type == "BOUNCE"
        assert error_message == "SES bounce: Permanent/General"

    def test_parses_complaint(self):
        message = {
            "eventType": "Complaint",
            "mail": {"messageId": "ses-2"},
            "complaint": {"complaintFeedbackType": "abuse"},
        }

        provider_message_id, event_type, error_message = (
            lambda_function._extract_feedback(message)
        )

        assert provider_message_id == "ses-2"
        assert event_type == "COMPLAINT"
        assert error_message == "SES complaint: abuse"

    def test_parses_reject(self):
        message = {
            "eventType": "Reject",
            "mail": {"messageId": "ses-3"},
            "reject": {"reason": "Policy"},
        }

        provider_message_id, event_type, error_message = (
            lambda_function._extract_feedback(message)
        )

        assert provider_message_id == "ses-3"
        assert event_type == "REJECT"
        assert error_message == "SES reject: Policy"

    def test_delivery_has_no_error_message(self):
        message = {"eventType": "Delivery", "mail": {"messageId": "ses-4"}}

        _, _, error_message = lambda_function._extract_feedback(message)

        assert error_message is None

    def test_missing_mail_block_returns_none_id(self):
        _, _, _ = lambda_function._extract_feedback({"eventType": "Delivery"})
        provider_message_id, _, _ = lambda_function._extract_feedback(
            {"eventType": "Delivery"}
        )
        assert provider_message_id is None


# ---------------------------------------------------------------------------
# _status_for_event
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("event_type", "expected_status"),
    [
        ("BOUNCE", "failed"),
        ("COMPLAINT", "failed"),
        ("REJECT", "failed"),
        ("RENDERING_FAILURE", "failed"),  # failure, not "sent"
        ("DELIVERY", "sent"),
        ("SEND", "sent"),
        ("UNKNOWN", "queued"),
        ("OPEN", "queued"),
    ],
)
def test_status_for_event(event_type, expected_status):
    assert lambda_function._status_for_event(event_type) == expected_status


# ---------------------------------------------------------------------------
# _update_communication_feedback
# ---------------------------------------------------------------------------


class TestUpdateCommunicationFeedback:
    def test_builds_correct_http_request(self, monkeypatch):
        monkeypatch.setattr(
            lambda_function,
            "_resolve_authorization_header",
            lambda: "Bearer service-token",
        )
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_):
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

    def test_url_encodes_provider_message_id(self, monkeypatch):
        monkeypatch.setattr(
            lambda_function, "_resolve_authorization_header", lambda: None
        )

        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def getcode(self):
                return 200

            def read(self):
                return b"{}"

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            return FakeResponse()

        monkeypatch.setattr(lambda_function.urllib.request, "urlopen", fake_urlopen)

        lambda_function._update_communication_feedback(
            "https://log-api.local/", "ses/id+1", "DELIVERY", None
        )

        assert captured["url"].endswith(
            "/api/communications/provider/ses%2Fid%2B1/status"
        )

    def test_sends_correct_payload_and_headers(self, monkeypatch):
        monkeypatch.setattr(
            lambda_function,
            "_resolve_authorization_header",
            lambda: "Bearer service-token",
        )
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def getcode(self):
                return 200

            def read(self):
                return b"{}"

        def fake_urlopen(request, timeout):
            captured["headers"] = {k.lower(): v for k, v in request.header_items()}
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            captured["method"] = request.get_method()
            captured["timeout"] = timeout
            return FakeResponse()

        monkeypatch.setattr(lambda_function.urllib.request, "urlopen", fake_urlopen)

        lambda_function._update_communication_feedback(
            "https://log-api.local/", "ses-1", "COMPLAINT", "SES complaint: abuse"
        )

        assert captured["method"] == "PATCH"
        assert captured["timeout"] == 15
        assert captured["headers"]["content-type"] == "application/json"
        assert captured["headers"]["authorization"] == "Bearer service-token"
        assert captured["payload"] == {
            "status": "failed",
            "deliveryEvent": "COMPLAINT",
            "errorMessage": "SES complaint: abuse",
        }


# ---------------------------------------------------------------------------
# lambda_handler — routing and record processing
# ---------------------------------------------------------------------------


class TestLambdaHandler:
    def test_empty_records_returns_200(self, monkeypatch):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")

        response = lambda_function.lambda_handler({"Records": []}, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body == {"updated": 0, "skipped": 0, "failedUpdates": []}

    def test_missing_log_api_base_url_skips_feedback_records(self, fake_update):
        """Without LOG_API_BASE_URL feedback records are skipped, not crashed."""
        event = _make_sns_event(_delivery_message())

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["skipped"] == 1
        assert fake_update.calls == []

    def test_non_json_sns_message_is_skipped(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = {"Records": [{"Sns": {"Message": "not-json"}}]}

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert body["skipped"] == 1
        assert fake_update.calls == []

    def test_record_without_sns_message_is_skipped(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = {"Records": [{"Sns": {}}]}

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert body["skipped"] == 1

    def test_delivery_event_is_updated(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = _make_sns_event(_delivery_message("ses-42"))

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1
        assert fake_update.calls[0][1:3] == ("ses-42", "DELIVERY")

    def test_bounce_event_is_updated_with_error(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = _make_sns_event(_bounce_message("ses-b1"))

        lambda_function.lambda_handler(event, None)

        base_url, msg_id, event_type, error_msg = fake_update.calls[0]
        assert msg_id == "ses-b1"
        assert event_type == "BOUNCE"
        assert error_msg == "SES bounce: Permanent/General"

    def test_multiple_records_all_updated(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = _make_sns_event(
            _delivery_message("ses-d1"),
            _bounce_message("ses-b1"),
        )

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 2
        assert body["failedUpdates"] == []

    def test_missing_provider_message_id_is_skipped(
        self, monkeypatch, fake_update
    ):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        event = _make_sns_event({"eventType": "Delivery", "mail": {}})

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert fake_update.calls == []

    def test_http_error_reported_as_partial_failure(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        fake_update.side_effect = urllib.error.HTTPError(
            url="https://example.com/...",
            code=409,
            msg="Conflict",
            hdrs=None,
            fp=io.BytesIO(b'{"error":"conflict"}'),
        )
        event = _make_sns_event(_delivery_message("ses-99"))

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 207
        assert body["updated"] == 0
        assert body["failedUpdates"] == [
            {"providerMessageId": "ses-99", "statusCode": "409"}
        ]

    def test_generic_exception_reported_as_partial_failure(
        self, monkeypatch, fake_update
    ):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        fake_update.side_effect = RuntimeError("network down")
        event = _make_sns_event(_bounce_message("ses-77"))

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 207
        assert body["failedUpdates"][0] == {
            "providerMessageId": "ses-77",
            "statusCode": "unknown",
        }

    def test_mixed_valid_invalid_skipped_and_failed(self, monkeypatch, fake_update):
        monkeypatch.setenv("LOG_API_BASE_URL", "https://example.com")
        fake_update.side_effect = RuntimeError("network down")
        event = {
            "Records": [
                {"Sns": {"Message": "not-json"}},
                {"Sns": {"Message": json.dumps(_bounce_message("ses-77"))}},
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 207
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert body["failedUpdates"][0]["providerMessageId"] == "ses-77"
