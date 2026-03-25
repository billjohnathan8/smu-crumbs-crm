import json
import pytest

import lambda_function

# ---------------------------------------------------------------------------
# _build_verification_link
# ---------------------------------------------------------------------------

class TestBuildVerificationLink:
    def test_builds_full_url_with_base(self, monkeypatch):
        monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")

        link = lambda_function._build_verification_link("client-1", "tok-abc")

        assert link == "https://app.example.com/verify-client?clientId=client-1&token=tok-abc"

    def test_strips_trailing_slash_from_base(self, monkeypatch):
        monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com/")

        link = lambda_function._build_verification_link("client-1", "tok-abc")

        assert link == "https://app.example.com/verify-client?clientId=client-1&token=tok-abc"

    def test_returns_path_only_when_no_base_url(self):
        link = lambda_function._build_verification_link("client-1", "tok-abc")

        assert link == "/verify-client?clientId=client-1&token=tok-abc"

    def test_url_encodes_special_characters(self, monkeypatch):
        monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")

        link = lambda_function._build_verification_link("client/1", "tok+abc==")

        assert "client%2F1" in link
        assert "tok%2Babc%3D%3D" in link


# ---------------------------------------------------------------------------
# _send_verification_email
# ---------------------------------------------------------------------------

class TestSendVerificationEmail:
    def test_raises_when_ses_source_email_missing(self):
        with pytest.raises(ValueError, match="SES_SOURCE_EMAIL is required"):
            lambda_function._send_verification_email(
                "client-1", "user@example.com", "token", "Alice", "req-1"
            )

    def test_raises_when_boto3_unavailable(self, monkeypatch):
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setattr(lambda_function, "boto3", None)

        with pytest.raises(RuntimeError, match="boto3 is required"):
            lambda_function._send_verification_email(
                "client-1", "user@example.com", "token", "Alice", "req-1"
            )

    def test_calls_ses_with_correct_arguments(self, monkeypatch):
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")
        captured = {}

        class FakeSesClient:
            def send_email(self, **kwargs):
                captured.update(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                assert name == "ses"
                return FakeSesClient()

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_email(
            "client-1", "user@example.com", "tok-abc", "Alice", "req-1"
        )

        assert captured["Source"] == "noreply@example.com"
        assert captured["Destination"] == {"ToAddresses": ["user@example.com"]}
        assert captured["Message"]["Subject"]["Data"] == "[ScroogeBank CRM] Please verify your identity"

    def test_email_body_contains_verification_link(self, monkeypatch):
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")
        captured = {}

        class FakeSesClient:
            def send_email(self, **kwargs):
                captured.update(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                return FakeSesClient()

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_email(
            "client-1", "user@example.com", "tok-abc", "Alice", "req-1"
        )

        html_body = captured["Message"]["Body"]["Html"]["Data"]
        text_body = captured["Message"]["Body"]["Text"]["Data"]
        expected_link = "https://app.example.com/verify-client?clientId=client-1&token=tok-abc"

        assert expected_link in html_body
        assert expected_link in text_body

    def test_email_body_uses_first_name(self, monkeypatch):
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        captured = {}

        class FakeSesClient:
            def send_email(self, **kwargs):
                captured.update(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                return FakeSesClient()

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_email(
            "client-1", "user@example.com", "tok-abc", "Alice", "req-1"
        )

        assert "Alice" in captured["Message"]["Body"]["Html"]["Data"]
        assert "Alice" in captured["Message"]["Body"]["Text"]["Data"]

    def test_email_body_falls_back_to_there_when_no_first_name(self, monkeypatch):
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        captured = {}

        class FakeSesClient:
            def send_email(self, **kwargs):
                captured.update(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                return FakeSesClient()

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_email(
            "client-1", "user@example.com", "tok-abc", "", "req-1"
        )

        assert "Hi there" in captured["Message"]["Body"]["Text"]["Data"]


# ---------------------------------------------------------------------------
# _handle_verification_requested
# ---------------------------------------------------------------------------

class TestHandleVerificationRequested:
    def test_skips_when_client_id_missing(self, monkeypatch):
        called = {"count": 0}

        def fake_send(*args, **kwargs):
            called["count"] += 1

        monkeypatch.setattr(lambda_function, "_send_verification_email", fake_send)

        lambda_function._handle_verification_requested(
            {"email": "user@example.com", "token": "tok", "firstName": "Alice", "requestId": "req-1"}
        )

        assert called["count"] == 0

    def test_skips_when_email_missing(self, monkeypatch):
        called = {"count": 0}

        def fake_send(*args, **kwargs):
            called["count"] += 1

        monkeypatch.setattr(lambda_function, "_send_verification_email", fake_send)

        lambda_function._handle_verification_requested(
            {"clientId": "client-1", "token": "tok", "firstName": "Alice", "requestId": "req-1"}
        )

        assert called["count"] == 0

    def test_calls_send_with_correct_arguments(self, monkeypatch):
        captured = {}

        def fake_send(client_id, email, token, first_name, request_id):
            captured.update(
                client_id=client_id,
                email=email,
                token=token,
                first_name=first_name,
                request_id=request_id,
            )

        monkeypatch.setattr(lambda_function, "_send_verification_email", fake_send)

        lambda_function._handle_verification_requested({
            "clientId": "client-1",
            "email": "user@example.com",
            "token": "tok-abc",
            "firstName": "Alice",
            "requestId": "req-1",
        })

        assert captured == {
            "client_id": "client-1",
            "email": "user@example.com",
            "token": "tok-abc",
            "first_name": "Alice",
            "request_id": "req-1",
        }


# ---------------------------------------------------------------------------
# lambda_handler — Flow 1 routing
# ---------------------------------------------------------------------------

class TestLambdaHandlerFlow1:
    @pytest.fixture
    def fake_send(self, monkeypatch):
        """Spy that patches _send_verification_email; set .side_effect to raise."""

        class FakeSend:
            calls = []
            side_effect = None

        def _fake(client_id, email, token, first_name, request_id):
            FakeSend.calls.append(dict(
                client_id=client_id,
                email=email,
                token=token,
                first_name=first_name,
                request_id=request_id,
            ))
            if FakeSend.side_effect:
                raise FakeSend.side_effect

        monkeypatch.setattr(lambda_function, "_send_verification_email", _fake)
        return FakeSend

    def _verification_event(self, **overrides) -> dict:
        message = {
            "eventType": "UPLOAD_VERIFICATION_REQUESTED",
            "clientId": "client-1",
            "email": "user@example.com",
            "token": "tok-abc",
            "firstName": "Alice",
            "requestId": "req-1",
            **overrides,
        }
        return {"Records": [{"Sns": {"Message": json.dumps(message)}}]}

    def test_sends_email_and_returns_200(self, fake_send):
        response = lambda_function.lambda_handler(self._verification_event(), None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1
        assert body["skipped"] == 0
        assert body["failedUpdates"] == []

    def test_passes_correct_fields_to_send(self, fake_send):
        lambda_function.lambda_handler(self._verification_event(), None)

        call = fake_send.calls[0]
        assert call["client_id"] == "client-1"
        assert call["email"] == "user@example.com"
        assert call["token"] == "tok-abc"
        assert call["first_name"] == "Alice"
        assert call["request_id"] == "req-1"

    def test_email_send_failure_recorded_as_partial_failure(self, fake_send):
        fake_send.side_effect = RuntimeError("SES unavailable")

        response = lambda_function.lambda_handler(self._verification_event(), None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 207
        assert body["updated"] == 0
        assert body["failedUpdates"] == [
            {"clientId": "client-1", "statusCode": "email_send_failed"}
        ]

    def test_flow1_does_not_require_log_api_base_url(self, fake_send):
        """UPLOAD_VERIFICATION_REQUESTED should succeed even without LOG_API_BASE_URL set."""
        response = lambda_function.lambda_handler(self._verification_event(), None)

        assert response["statusCode"] == 200