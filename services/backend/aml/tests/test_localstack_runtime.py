"""Tests for local-runtime AML Lambda behavior used in LocalStack smoke runs."""

from __future__ import annotations

from urllib.error import HTTPError

import pytest

from lambda_function import (
    HistoricalTransactionRepository,
    MockSFTPClient,
    SFTPClient,
    _create_clients,
)


def test_create_clients_uses_mock_sftp_when_enabled(monkeypatch: pytest.MonkeyPatch):
    """AML_SFTP_MODE=mock should swap only the SFTP client implementation."""
    monkeypatch.setenv("AML_SFTP_MODE", "mock")
    monkeypatch.setenv("CRM_API_BASE_URL", "http://example.test")

    clients = _create_clients()
    assert isinstance(clients[0], MockSFTPClient)


def test_create_clients_uses_production_sftp_by_default(monkeypatch: pytest.MonkeyPatch):
    """Without AML_SFTP_MODE=mock, the production SFTP client remains active."""
    monkeypatch.delenv("AML_SFTP_MODE", raising=False)
    monkeypatch.setenv("SFTP_HOST", "sftp.example.test")
    monkeypatch.setenv("SFTP_USER", "svc-user")
    monkeypatch.setenv(
        "SFTP_KEY_SECRET",
        "arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:key",
    )
    monkeypatch.setenv("CRM_API_BASE_URL", "http://example.test")

    clients = _create_clients()
    assert isinstance(clients[0], SFTPClient)


def test_historical_repo_returns_empty_list_on_404(monkeypatch: pytest.MonkeyPatch):
    """Missing client history (404) should be treated as no historical data."""
    monkeypatch.setenv("CRM_API_BASE_URL", "http://example.test")
    repo = HistoricalTransactionRepository()

    def fake_urlopen(*_args, **_kwargs):
        raise HTTPError(
            url="http://example.test/api/clients/does-not-exist/transactions",
            code=404,
            msg="Not Found",
            hdrs=None,
            fp=None,
        )

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    assert repo.get_historical_amounts("does-not-exist") == []
