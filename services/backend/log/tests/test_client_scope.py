"""Tests for ClientScopeAuthorizer (app/client_scope.py)."""

from __future__ import annotations

import json
import urllib.error
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from app.auth import UnauthorizedError
from app.client_scope import ClientScopeAuthorizer


@pytest.fixture()
def authorizer():
    return ClientScopeAuthorizer("http://client-service:8080", timeout_seconds=1.0)


class TestCanAccessClient:
    def test_returns_true_on_200(self, authorizer):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.getcode.return_value = 200
        mock_resp.read.return_value = b'{"clientId": "c1"}'
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            assert authorizer.can_access_client("Bearer token", "c1") is True

    def test_returns_false_on_404(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients/c1",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            assert authorizer.can_access_client("Bearer token", "c1") is False

    def test_returns_false_on_403(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients/c1",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            assert authorizer.can_access_client("Bearer token", "c1") is False

    def test_raises_unauthorized_on_401(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients/c1",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            with pytest.raises(UnauthorizedError):
                authorizer.can_access_client("Bearer token", "c1")

    def test_raises_runtime_error_on_500(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients/c1",
            code=500,
            msg="Server Error",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            with pytest.raises(RuntimeError, match="client_scope_check_failed"):
                authorizer.can_access_client("Bearer token", "c1")

    def test_raises_unauthorized_when_no_auth(self, authorizer):
        with pytest.raises(UnauthorizedError):
            authorizer.can_access_client(None, "c1")


class TestListAccessibleClientIds:
    def test_returns_client_ids_from_paginated_response(self, authorizer):
        response_data = json.dumps(
            {
                "data": [
                    {"clientId": "c1"},
                    {"clientId": "c2"},
                ],
                "pagination": {"total": 2, "limit": 200, "offset": 0},
            }
        ).encode()

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.getcode.return_value = 200
        mock_resp.read.return_value = response_data
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            ids = authorizer.list_accessible_client_ids("Bearer token")
        assert ids == {"c1", "c2"}

    def test_raises_unauthorized_without_auth(self, authorizer):
        with pytest.raises(UnauthorizedError):
            authorizer.list_accessible_client_ids(None)

    def test_raises_unauthorized_on_401_response(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            with pytest.raises(UnauthorizedError):
                authorizer.list_accessible_client_ids("Bearer token")

    def test_raises_runtime_on_non_dict_payload(self, authorizer):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.getcode.return_value = 200
        mock_resp.read.return_value = b'"just a string"'
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="client_scope_listing_failed"):
                authorizer.list_accessible_client_ids("Bearer token")

    def test_raises_runtime_on_500(self, authorizer):
        exc = urllib.error.HTTPError(
            url="http://client-service:8080/api/clients",
            code=500,
            msg="Error",
            hdrs={},
            fp=BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=exc):
            with pytest.raises(RuntimeError, match="client_scope_listing_failed"):
                authorizer.list_accessible_client_ids("Bearer token")

    def test_raises_runtime_on_non_list_data(self, authorizer):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.getcode.return_value = 200
        mock_resp.read.return_value = json.dumps({"data": "not-a-list"}).encode()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="client_scope_listing_failed"):
                authorizer.list_accessible_client_ids("Bearer token")


class TestRequestJson:
    def test_raises_unauthorized_without_auth(self, authorizer):
        with pytest.raises(UnauthorizedError):
            authorizer._request_json("GET", "/api/test", None)

    def test_raises_runtime_on_url_error(self, authorizer):
        with patch(
            "urllib.request.urlopen",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            with pytest.raises(RuntimeError, match="client_service_unavailable"):
                authorizer._request_json("GET", "/api/test", "Bearer token")

    def test_raises_runtime_on_timeout(self, authorizer):
        with patch("urllib.request.urlopen", side_effect=TimeoutError("timeout")):
            with pytest.raises(RuntimeError, match="client_service_unavailable"):
                authorizer._request_json("GET", "/api/test", "Bearer token")

    def test_returns_none_body_for_empty_response(self, authorizer):
        mock_resp = MagicMock()
        mock_resp.status = 204
        mock_resp.getcode.return_value = 204
        mock_resp.read.return_value = b""
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            status, body = authorizer._request_json("GET", "/test", "Bearer token")
        assert status == 204
        assert body is None

    def test_raises_runtime_on_invalid_json(self, authorizer):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.getcode.return_value = 200
        mock_resp.read.return_value = b"not valid json"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="client_scope_response_invalid"):
                authorizer._request_json("GET", "/test", "Bearer token")
