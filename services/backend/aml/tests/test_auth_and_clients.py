"""
Tests for authentication helpers, production clients, utility functions,
and error paths in lambda_function.py.

These tests cover the infrastructure/configuration code that is normally
bypassed by monkeypatched mocks in integration tests.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lambda_function import (  # noqa: E402
    _b64url_encode,
    _load_service_jwt_secret,
    _mint_service_jwt,
    _authorization_header,
    _auth_headers,
    _resolve_log_write_base_url,
    _parse_date_value,
    _load_accounts_for_active_clients,
    lambda_handler,
    AccountRepository,
    HistoricalTransactionRepository,
    CRMWriteClient,
    SFTPClient,
    Account,
    AccountType,
    AccountStatus,
    AMLAlert,
    AlertType,
    LogEntry,
    LogAction,
)


# ---------------------------------------------------------------------------
# _b64url_encode
# ---------------------------------------------------------------------------


class TestB64UrlEncode:
    def test_encodes_bytes_to_base64url(self):
        result = _b64url_encode(b"hello")
        assert isinstance(result, str)
        assert "=" not in result

    def test_empty_bytes(self):
        result = _b64url_encode(b"")
        assert result == ""

    def test_strips_padding(self):
        # b"a" normally encodes to "YQ==" in base64
        result = _b64url_encode(b"a")
        assert "=" not in result
        assert result == "YQ"


# ---------------------------------------------------------------------------
# _load_service_jwt_secret
# ---------------------------------------------------------------------------


class TestLoadServiceJwtSecret:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_returns_none_when_no_env_vars(self, monkeypatch):
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        result = _load_service_jwt_secret()
        assert result is None

    def test_returns_inline_secret(self, monkeypatch):
        monkeypatch.setenv("CRM_API_JWT_HMAC_SECRET", "my-test-secret")
        result = _load_service_jwt_secret()
        assert result == "my-test-secret"

    def test_caches_inline_secret(self, monkeypatch):
        monkeypatch.setenv("CRM_API_JWT_HMAC_SECRET", "cached-secret")
        _load_service_jwt_secret()
        # Second call should use cache
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET")
        result = _load_service_jwt_secret()
        assert result == "cached-secret"

    def test_loads_from_secrets_manager_via_primary_arn(self, monkeypatch):
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.setenv(
            "CRM_API_JWT_HMAC_SECRET_ARN",
            "arn:aws:secretsmanager:us-east-1:123:secret:jwt",
        )
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_secret_value.return_value = {
            "SecretString": "sm-secret-value"
        }
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            result = _load_service_jwt_secret()
        assert result == "sm-secret-value"

    def test_loads_from_fallback_arn(self, monkeypatch):
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.setenv(
            "JWT_HMAC_SECRET_ARN",
            "arn:aws:secretsmanager:us-east-1:123:secret:fallback",
        )
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_secret_value.return_value = {
            "SecretString": "fallback-secret"
        }
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            result = _load_service_jwt_secret()
        assert result == "fallback-secret"

    def test_returns_none_on_secrets_manager_error(self, monkeypatch):
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.setenv("CRM_API_JWT_HMAC_SECRET_ARN", "arn:aws:some-arn")
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_secret_value.side_effect = Exception("boom")
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            result = _load_service_jwt_secret()
        assert result is None


# ---------------------------------------------------------------------------
# _mint_service_jwt
# ---------------------------------------------------------------------------


class TestMintServiceJwt:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_returns_none_when_no_secret(self, monkeypatch):
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        result = _mint_service_jwt()
        assert result is None

    def test_returns_valid_jwt_string(self, monkeypatch):
        monkeypatch.setenv("CRM_API_JWT_HMAC_SECRET", "test-secret-key")
        token = _mint_service_jwt()
        assert token is not None
        parts = token.split(".")
        assert len(parts) == 3  # header.payload.signature


# ---------------------------------------------------------------------------
# _authorization_header
# ---------------------------------------------------------------------------


class TestAuthorizationHeader:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_returns_none_when_no_auth_configured(self, monkeypatch):
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        result = _authorization_header()
        assert result is None

    def test_returns_explicit_header(self, monkeypatch):
        monkeypatch.setenv("CRM_API_AUTHORIZATION_HEADER", "Bearer explicit-token")
        result = _authorization_header()
        assert result == "Bearer explicit-token"

    def test_returns_bearer_token(self, monkeypatch):
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.setenv("CRM_API_BEARER_TOKEN", "my-bearer-token")
        result = _authorization_header()
        assert result == "Bearer my-bearer-token"

    def test_returns_minted_jwt(self, monkeypatch):
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.setenv("CRM_API_JWT_HMAC_SECRET", "jwt-secret")
        result = _authorization_header()
        assert result is not None
        assert result.startswith("Bearer ")


# ---------------------------------------------------------------------------
# _auth_headers
# ---------------------------------------------------------------------------


class TestAuthHeaders:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_returns_empty_dict_when_no_auth(self, monkeypatch):
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        result = _auth_headers()
        assert result == {}

    def test_returns_authorization_header_dict(self, monkeypatch):
        monkeypatch.setenv("CRM_API_AUTHORIZATION_HEADER", "Bearer token123")
        result = _auth_headers()
        assert result == {"Authorization": "Bearer token123"}


# ---------------------------------------------------------------------------
# _resolve_log_write_base_url
# ---------------------------------------------------------------------------


class TestResolveLogWriteBaseUrl:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        import lambda_function

        lambda_function._LOG_WRITE_BASE_URL_CACHE = None
        yield
        lambda_function._LOG_WRITE_BASE_URL_CACHE = None

    def test_returns_explicit_env_url(self, monkeypatch):
        monkeypatch.setenv("CRM_WRITE_API_BASE_URL", "https://write.example.com/")
        result = _resolve_log_write_base_url("https://default.example.com")
        assert result == "https://write.example.com"

    def test_returns_default_when_no_env(self, monkeypatch):
        monkeypatch.delenv("CRM_WRITE_API_BASE_URL", raising=False)
        monkeypatch.delenv("CRM_LOG_API_URL_PARAM", raising=False)
        result = _resolve_log_write_base_url("https://default.example.com")
        assert result == "https://default.example.com"

    def test_loads_from_ssm_parameter(self, monkeypatch):
        monkeypatch.delenv("CRM_WRITE_API_BASE_URL", raising=False)
        monkeypatch.setenv("CRM_LOG_API_URL_PARAM", "/crm/log-api-url")
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_parameter.return_value = {
            "Parameter": {"Value": "https://ssm-resolved.example.com/"}
        }
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            result = _resolve_log_write_base_url("https://fallback.example.com")
        assert result == "https://ssm-resolved.example.com"

    def test_falls_back_on_ssm_error(self, monkeypatch):
        monkeypatch.delenv("CRM_WRITE_API_BASE_URL", raising=False)
        monkeypatch.setenv("CRM_LOG_API_URL_PARAM", "/crm/log-api-url")
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_parameter.side_effect = Exception(
            "SSM error"
        )
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            result = _resolve_log_write_base_url("https://fallback.example.com")
        assert result == "https://fallback.example.com"

    def test_caches_ssm_result(self, monkeypatch):
        monkeypatch.delenv("CRM_WRITE_API_BASE_URL", raising=False)
        monkeypatch.setenv("CRM_LOG_API_URL_PARAM", "/crm/log-api-url")
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_parameter.return_value = {
            "Parameter": {"Value": "https://cached.example.com"}
        }
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            _resolve_log_write_base_url("https://fallback.example.com")
        # Second call should use cache (no SSM call needed)
        monkeypatch.delenv("CRM_LOG_API_URL_PARAM")
        result = _resolve_log_write_base_url("https://fallback.example.com")
        assert result == "https://cached.example.com"


# ---------------------------------------------------------------------------
# _parse_date_value
# ---------------------------------------------------------------------------


class TestParseDateValue:
    def test_valid_iso_date(self):
        result = _parse_date_value("2026-01-15")
        assert result == date(2026, 1, 15)

    def test_returns_none_for_non_string(self):
        assert _parse_date_value(None) is None
        assert _parse_date_value(12345) is None

    def test_returns_none_for_invalid_date_string(self):
        assert _parse_date_value("not-a-date") is None

    def test_strips_whitespace(self):
        result = _parse_date_value("  2026-03-01  ")
        assert result == date(2026, 3, 1)


# ---------------------------------------------------------------------------
# _load_accounts_for_active_clients (None account scenario)
# ---------------------------------------------------------------------------


class TestLoadAccountsForActiveClients:
    def test_filters_out_none_accounts(self):
        from lambda_function import Transaction, TransactionType, TransactionStatus

        txns = [
            Transaction(
                "T1",
                "C1",
                TransactionType.DEPOSIT,
                100.0,
                date(2026, 1, 1),
                TransactionStatus.COMPLETED,
            ),
            Transaction(
                "T2",
                "C2",
                TransactionType.DEPOSIT,
                200.0,
                date(2026, 1, 1),
                TransactionStatus.COMPLETED,
            ),
        ]

        class PartialRepo:
            def get_account_by_client_id(self, client_id):
                if client_id == "C1":
                    return Account(
                        account_id="A1",
                        client_id="C1",
                        account_type=AccountType.SAVINGS,
                        account_status=AccountStatus.ACTIVE,
                        opening_date=date(2020, 1, 1),
                        initial_deposit=1000.0,
                    )
                return None  # C2 returns None (404 scenario)

        accounts = _load_accounts_for_active_clients(txns, PartialRepo())
        assert len(accounts) == 1
        assert accounts[0].client_id == "C1"


# ---------------------------------------------------------------------------
# lambda_handler error path
# ---------------------------------------------------------------------------


class TestLambdaHandlerErrorPath:
    def test_returns_500_on_exception(self, monkeypatch):
        monkeypatch.setattr(
            "lambda_function._create_clients",
            lambda: (_ for _ in ()).throw(RuntimeError("forced error")),
        )
        result = lambda_handler({}, None)
        assert result["statusCode"] == 500
        body = json.loads(result["body"])
        assert body["error"] == "internal_error"


# ---------------------------------------------------------------------------
# Production clients (with mocked HTTP / AWS calls)
# ---------------------------------------------------------------------------


class TestSFTPClient:
    def test_init_reads_env_vars(self, monkeypatch):
        monkeypatch.setenv("SFTP_HOST", "sftp.example.com")
        monkeypatch.setenv("SFTP_PORT", "2222")
        monkeypatch.setenv("SFTP_USER", "testuser")
        monkeypatch.setenv("SFTP_KEY_SECRET", "arn:aws:secret:key")
        client = SFTPClient()
        assert client._host == "sftp.example.com"
        assert client._port == 2222
        assert client._user == "testuser"
        assert client._key_secret_arn == "arn:aws:secret:key"

    def test_fetch_key_calls_secrets_manager(self, monkeypatch):
        monkeypatch.setenv("SFTP_HOST", "sftp.example.com")
        monkeypatch.setenv("SFTP_USER", "testuser")
        monkeypatch.setenv("SFTP_KEY_SECRET", "arn:aws:secret:key")
        client = SFTPClient()
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value.get_secret_value.return_value = {
            "SecretString": "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----"
        }
        with patch.dict("sys.modules", {"boto3": mock_boto3}):
            key = client._fetch_key()
        assert "RSA PRIVATE KEY" in key


class TestAccountRepository:
    @pytest.fixture(autouse=True)
    def _clear_auth_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_init_reads_base_url(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com/")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()
        assert repo._base_url == "https://api.example.com"

    def test_get_accounts_parses_response(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()

        mock_response_data = json.dumps(
            {
                "data": [
                    {
                        "accountId": "ACC1",
                        "clientId": "C1",
                        "accountType": "Savings",
                        "accountStatus": "Active",
                        "openingDate": "2020-01-01",
                        "initialDeposit": 1000.0,
                        "currency": "SGD",
                    }
                ]
            }
        ).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = mock_response_data
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            accounts = repo.get_accounts()
        assert len(accounts) == 1
        assert accounts[0].account_id == "ACC1"
        assert accounts[0].client_id == "C1"

    def test_get_account_by_client_id_returns_account(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()

        mock_response_data = json.dumps(
            {
                "data": [
                    {
                        "accountId": "ACC1",
                        "clientId": "C1",
                        "accountType": "Savings",
                        "accountStatus": "Active",
                        "openingDate": "2020-01-01",
                        "initialDeposit": 1000.0,
                    }
                ]
            }
        ).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = mock_response_data
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            account = repo.get_account_by_client_id("C1")
        assert account is not None
        assert account.client_id == "C1"

    def test_get_account_by_client_id_returns_none_on_404(self, monkeypatch):
        import urllib.error

        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()

        mock_error = urllib.error.HTTPError(
            url="https://api.example.com/api/clients/C1/accounts",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=None,
        )

        with patch("urllib.request.urlopen", side_effect=mock_error):
            account = repo.get_account_by_client_id("C1")
        assert account is None

    def test_deserialise_with_snake_case_keys(self):
        row = {
            "account_id": "ACC1",
            "client_id": "C1",
            "account_type": "Savings",
            "account_status": "Active",
            "opening_date": "2020-01-01",
            "initial_deposit": 1000.0,
            "currency": "SGD",
            "branch_id": "BR1",
        }
        account = AccountRepository._deserialise(row)
        assert account.account_id == "ACC1"
        assert account.branch_id == "BR1"

    def test_get_accounts_returns_empty_for_non_list(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"data": "not-a-list"}).encode()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            accounts = repo.get_accounts()
        assert accounts == []

    def test_get_account_by_client_id_returns_none_for_empty_list(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = AccountRepository()

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"data": []}).encode()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            account = repo.get_account_by_client_id("C1")
        assert account is None


class TestHistoricalTransactionRepository:
    @pytest.fixture(autouse=True)
    def _clear_auth_cache(self):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None

    def test_init_reads_base_url(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com/")
        repo = HistoricalTransactionRepository()
        assert repo._base_url == "https://api.example.com"

    def test_get_historical_amounts_parses_response(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = HistoricalTransactionRepository()

        # Use dates before current month start
        mock_response_data = json.dumps(
            {
                "data": [
                    {"amount": 100.0, "date": "2025-12-01"},
                    {"amount": 200.0, "date": "2025-11-15"},
                    {"amount": 300.0, "date": "2025-10-20"},
                ]
            }
        ).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = mock_response_data
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            amounts = repo.get_historical_amounts("C1")
        assert amounts == [100.0, 200.0, 300.0]

    def test_get_historical_amounts_returns_empty_for_non_list(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = HistoricalTransactionRepository()

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"data": "not-a-list"}).encode()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            amounts = repo.get_historical_amounts("C1")
        assert amounts == []

    def test_falls_back_to_all_amounts_when_no_historical(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        repo = HistoricalTransactionRepository()

        # All dates are in current month (no historical data before month start)
        today = date.today()
        mock_response_data = json.dumps(
            {
                "data": [
                    {"amount": 500.0, "date": today.isoformat()},
                    {"amount": 600.0, "date": today.isoformat()},
                ]
            }
        ).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = mock_response_data
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            amounts = repo.get_historical_amounts("C1")
        assert amounts == [500.0, 600.0]


class TestCRMWriteClient:
    @pytest.fixture(autouse=True)
    def _clear_caches(self, monkeypatch):
        import lambda_function

        lambda_function._JWT_HMAC_SECRET_CACHE = None
        lambda_function._LOG_WRITE_BASE_URL_CACHE = None
        monkeypatch.delenv("CRM_WRITE_API_BASE_URL", raising=False)
        monkeypatch.delenv("CRM_LOG_API_URL_PARAM", raising=False)
        monkeypatch.delenv("CRM_API_AUTHORIZATION_HEADER", raising=False)
        monkeypatch.delenv("CRM_API_BEARER_TOKEN", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET", raising=False)
        monkeypatch.delenv("CRM_API_JWT_HMAC_SECRET_ARN", raising=False)
        monkeypatch.delenv("JWT_HMAC_SECRET_ARN", raising=False)
        yield
        lambda_function._JWT_HMAC_SECRET_CACHE = None
        lambda_function._LOG_WRITE_BASE_URL_CACHE = None

    def test_init_resolves_base_url(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        client = CRMWriteClient()
        assert client._base_url == "https://api.example.com"

    def test_write_alert_posts_to_api(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        client = CRMWriteClient()

        alert = AMLAlert(
            alert_id="alert-1",
            client_id="C1",
            transaction_id="T1",
            alert_type=AlertType.STATISTICAL_OUTLIER,
            description="Test alert",
            detected_at=datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc),
        )

        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
            client.write_alert(alert)
            mock_urlopen.assert_called_once()

    def test_write_log_posts_to_api(self, monkeypatch):
        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        client = CRMWriteClient()

        log = LogEntry(
            log_id="log-1",
            action=LogAction.CREATE,
            attribute_name="AML_ALERT",
            before_value=None,
            after_value='{"alertId": "alert-1"}',
            user_id="SYSTEM_AML",
            client_id="C1",
            date_time=datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc),
        )

        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
            client.write_log(log)
            mock_urlopen.assert_called_once()

    def test_post_raises_on_http_error(self, monkeypatch):
        import urllib.error

        monkeypatch.setenv("CRM_API_BASE_URL", "https://api.example.com")
        client = CRMWriteClient()

        mock_error = urllib.error.HTTPError(
            url="https://api.example.com/api/aml/alerts",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=MagicMock(read=MagicMock(return_value=b"server error")),
        )

        with patch("urllib.request.urlopen", side_effect=mock_error):
            with pytest.raises(RuntimeError, match="CRM API POST failed"):
                client._post("/api/aml/alerts", {"test": "data"})
