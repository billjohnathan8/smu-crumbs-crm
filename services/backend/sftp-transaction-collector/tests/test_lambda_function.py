import base64
import json
from datetime import datetime, timezone

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
        "TRANSACTION_SFTP_BUCKET",
        "TRANSACTION_SFTP_PREFIX",
        "TRANSACTION_IMPORT_URL",
        "TRANSACTION_IMPORT_AUTH_HEADER",
        "TRANSACTION_IMPORT_BEARER_TOKEN",
        "TRANSACTION_IMPORT_JWT_HMAC_SECRET",
        "TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN",
        "TRANSACTION_IMPORT_JWT_SUB",
        "TRANSACTION_IMPORT_JWT_ROLE",
        "TRANSACTION_IMPORT_JWT_TTL_SECONDS",
        "JWT_HMAC_SECRET_ARN",
    ):
        monkeypatch.delenv(key, raising=False)

    lambda_function._JWT_SECRET_CACHE = None
    yield
    lambda_function._JWT_SECRET_CACHE = None


def test_lambda_handler_requires_transaction_sftp_bucket(monkeypatch):
    monkeypatch.setenv("TRANSACTION_IMPORT_URL", "https://example.com/import")

    with pytest.raises(ValueError, match="TRANSACTION_SFTP_BUCKET is required"):
        lambda_function.lambda_handler({}, None)


def test_lambda_handler_requires_transaction_import_url(monkeypatch):
    monkeypatch.setenv("TRANSACTION_SFTP_BUCKET", "mock-bucket")

    with pytest.raises(ValueError, match="TRANSACTION_IMPORT_URL is required"):
        lambda_function.lambda_handler({}, None)


def test_latest_csv_key_selects_newest_csv(monkeypatch):
    class FakePaginator:
        def paginate(self, **kwargs):
            assert kwargs == {"Bucket": "bucket-a", "Prefix": "incoming/"}
            return [
                {
                    "Contents": [
                        {
                            "Key": "incoming/old.csv",
                            "LastModified": datetime(2026, 2, 1, tzinfo=timezone.utc),
                        },
                        {
                            "Key": "incoming/ignore.txt",
                            "LastModified": datetime(2026, 3, 1, tzinfo=timezone.utc),
                        },
                    ]
                },
                {
                    "Contents": [
                        {
                            "Key": "incoming/new.csv",
                            "LastModified": datetime(2026, 3, 5, tzinfo=timezone.utc),
                        }
                    ]
                },
            ]

    class FakeS3Client:
        def get_paginator(self, operation_name):
            assert operation_name == "list_objects_v2"
            return FakePaginator()

    monkeypatch.setattr(lambda_function.boto3, "client", lambda service: FakeS3Client())

    latest = lambda_function._latest_csv_key("bucket-a", "incoming/")
    assert latest == "incoming/new.csv"


def test_resolve_authorization_header_precedence(monkeypatch):
    monkeypatch.setenv("TRANSACTION_IMPORT_AUTH_HEADER", "Custom abc")
    monkeypatch.setenv("TRANSACTION_IMPORT_BEARER_TOKEN", "token-123")
    monkeypatch.setenv("TRANSACTION_IMPORT_JWT_HMAC_SECRET", "secret")

    assert lambda_function._resolve_authorization_header() == "Custom abc"


def test_resolve_authorization_header_uses_bearer_token(monkeypatch):
    monkeypatch.setenv("TRANSACTION_IMPORT_BEARER_TOKEN", "token-123")

    assert lambda_function._resolve_authorization_header() == "Bearer token-123"


def test_resolve_authorization_header_mints_service_jwt(monkeypatch):
    monkeypatch.setenv("TRANSACTION_IMPORT_JWT_HMAC_SECRET", "jwt-secret")
    monkeypatch.setenv("TRANSACTION_IMPORT_JWT_SUB", "SYSTEM_TEST")
    monkeypatch.setenv("TRANSACTION_IMPORT_JWT_ROLE", "admin")
    monkeypatch.setenv("TRANSACTION_IMPORT_JWT_TTL_SECONDS", "300")

    authorization = lambda_function._resolve_authorization_header()
    assert authorization is not None
    assert authorization.startswith("Bearer ")

    token = authorization.removeprefix("Bearer ")
    payload = _decode_jwt_payload(token)
    assert payload["sub"] == "SYSTEM_TEST"
    assert payload["role"] == "admin"
    assert payload["exp"] > payload["iat"]


def test_load_service_jwt_secret_uses_secrets_manager(monkeypatch):
    calls: list[str] = []

    class FakeSecretsManagerClient:
        def get_secret_value(self, SecretId):
            calls.append(SecretId)
            return {"SecretString": "secret-from-aws"}

    monkeypatch.setenv(
        "TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN", "arn:aws:secretsmanager:..."
    )
    monkeypatch.setattr(
        lambda_function.boto3,
        "client",
        lambda service: FakeSecretsManagerClient(),
    )

    first = lambda_function._load_service_jwt_secret()
    second = lambda_function._load_service_jwt_secret()

    assert first == "secret-from-aws"
    assert second == "secret-from-aws"
    assert calls == ["arn:aws:secretsmanager:..."]


def test_trigger_import_posts_source_path_and_auth(monkeypatch):
    monkeypatch.setenv("TRANSACTION_IMPORT_BEARER_TOKEN", "token-abc")
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def getcode(self):
            return 202

        def read(self):
            return b"accepted"

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(lambda_function.urllib.request, "urlopen", fake_urlopen)

    status_code, body = lambda_function._trigger_import(
        "https://example.com/api/transactions/import",
        "s3://bucket/incoming/new.csv",
    )

    request = captured["request"]
    assert status_code == 202
    assert body == "accepted"
    assert captured["timeout"] == 15
    assert request.get_method() == "POST"
    assert request.headers["Authorization"] == "Bearer token-abc"
    assert json.loads(request.data.decode("utf-8")) == {
        "sourcePath": "s3://bucket/incoming/new.csv"
    }


def test_lambda_handler_returns_no_csv_found(monkeypatch):
    monkeypatch.setenv("TRANSACTION_SFTP_BUCKET", "mock-bucket")
    monkeypatch.setenv("TRANSACTION_IMPORT_URL", "https://example.com/import")
    monkeypatch.setattr(lambda_function, "_latest_csv_key", lambda bucket, prefix: None)

    response = lambda_function.lambda_handler({}, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body == {
        "message": "no_csv_files_found",
        "bucket": "mock-bucket",
        "prefix": "incoming/",
    }


def test_lambda_handler_triggers_import_for_selected_csv(monkeypatch):
    monkeypatch.setenv("TRANSACTION_SFTP_BUCKET", "mock-bucket")
    monkeypatch.setenv("TRANSACTION_IMPORT_URL", "https://example.com/import")
    monkeypatch.setattr(
        lambda_function,
        "_latest_csv_key",
        lambda bucket, prefix: "incoming/transactions-2026-03.csv",
    )
    captured: dict[str, str] = {}

    def fake_trigger(import_url, source_path):
        captured["import_url"] = import_url
        captured["source_path"] = source_path
        return 202, '{"message":"accepted"}'

    monkeypatch.setattr(lambda_function, "_trigger_import", fake_trigger)

    response = lambda_function.lambda_handler({}, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 202
    assert captured == {
        "import_url": "https://example.com/import",
        "source_path": "s3://mock-bucket/incoming/transactions-2026-03.csv",
    }
    assert body["sourcePath"] == "s3://mock-bucket/incoming/transactions-2026-03.csv"
    assert body["importApiStatus"] == 202
    assert body["importApiBody"] == '{"message":"accepted"}'
