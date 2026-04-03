"""Client-scope authorization helpers backed by client-service ownership checks."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode

from .auth import UnauthorizedError


class ClientScopeAuthorizer:
    """Resolves whether a bearer token can access one or more client objects."""

    def __init__(self, client_service_url: str, *, timeout_seconds: float = 3.0):
        self._client_service_url = client_service_url.rstrip("/")
        self._timeout_seconds = timeout_seconds

    def can_access_client(self, authorization: str | None, client_id: str) -> bool:
        """Return True when the token can access the given client id."""
        encoded_client_id = quote(client_id, safe="")
        status_code, _ = self._request_json(
            "GET", f"/api/clients/{encoded_client_id}", authorization
        )
        if status_code == 401:
            raise UnauthorizedError("unauthorized")
        if status_code in {403, 404}:
            return False
        if 200 <= status_code < 300:
            return True
        raise RuntimeError("client_scope_check_failed")

    def list_accessible_client_ids(
        self,
        authorization: str | None,
        *,
        page_size: int = 200,
        max_pages: int = 20,
    ) -> set[str]:
        """Return client ids visible to the token via paginated client-service calls."""
        if not authorization:
            raise UnauthorizedError("missing_bearer")

        ids: set[str] = set()
        safe_page_size = max(1, min(page_size, 200))
        offset = 0

        for _ in range(max_pages):
            query = urlencode({"limit": safe_page_size, "offset": offset})
            status_code, payload = self._request_json(
                "GET", f"/api/clients?{query}", authorization
            )
            if status_code == 401:
                raise UnauthorizedError("unauthorized")
            if not (200 <= status_code < 300):
                raise RuntimeError("client_scope_listing_failed")
            if not isinstance(payload, dict):
                raise RuntimeError("client_scope_listing_failed")

            data = payload.get("data")
            if not isinstance(data, list):
                raise RuntimeError("client_scope_listing_failed")

            for item in data:
                if isinstance(item, dict):
                    client_id = item.get("clientId")
                    if isinstance(client_id, str) and client_id:
                        ids.add(client_id)

            pagination = payload.get("pagination")
            total = None
            if isinstance(pagination, dict):
                raw_total = pagination.get("total")
                if isinstance(raw_total, int):
                    total = raw_total

            offset += safe_page_size
            if len(data) < safe_page_size:
                break
            if total is not None and offset >= total:
                break

        return ids

    def _request_json(
        self,
        method: str,
        path: str,
        authorization: str | None,
    ) -> tuple[int, dict | list | None]:
        if not authorization:
            raise UnauthorizedError("missing_bearer")

        request = urllib.request.Request(
            url=f"{self._client_service_url}{path}",
            method=method,
            headers={
                "Authorization": authorization,
                "Accept": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(  # noqa: S310
                request,
                timeout=self._timeout_seconds,
            ) as response:
                status_code = getattr(response, "status", response.getcode())
                body = response.read()
        except urllib.error.HTTPError as exc:
            status_code = exc.code
            body = exc.read()
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise RuntimeError("client_service_unavailable") from exc

        if not body:
            return status_code, None

        try:
            return status_code, json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError("client_scope_response_invalid") from exc
