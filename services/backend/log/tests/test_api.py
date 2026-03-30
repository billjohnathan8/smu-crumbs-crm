"""Direct Lambda event contract tests for log-service APIs."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from app.auth import UnauthorizedError
from app.lambda_router import LambdaRouter
from app.schemas import (
    CreateAmlAlertRequest,
    CreateCommunicationRequest,
    CreateLogRequest,
    UpdateLogRequest,
)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def mint_token(sub: str, role: str, secret: str) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(
        json.dumps(
            {
                "sub": sub,
                "role": role,
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
            }
        ).encode("utf-8")
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


@dataclass(frozen=True)
class FakeSettings:
    jwt_hmac_secret: str
    auth_mode: str = "local"
    cognito_jwks_url: str = ""
    cognito_issuer: str = ""
    cognito_audience: str = ""
    client_service_url: str = "http://localhost:8080"


class FakeClientScopeAuthorizer:
    def __init__(
        self,
        *,
        allow_all: bool = True,
        allowed_client_ids_by_auth: dict[str, set[str]] | None = None,
    ) -> None:
        self._allow_all = allow_all
        self._allowed_client_ids_by_auth = allowed_client_ids_by_auth or {}

    def can_access_client(self, authorization: str | None, client_id: str) -> bool:
        if not authorization:
            raise UnauthorizedError("missing_bearer")
        if self._allow_all:
            return True
        return client_id in self._allowed_client_ids_by_auth.get(authorization, set())

    def list_accessible_client_ids(self, authorization: str | None) -> set[str]:
        if not authorization:
            raise UnauthorizedError("missing_bearer")
        if self._allow_all:
            return {"clt_1", "clt_2", "clt_3", "clt_4"}
        return set(self._allowed_client_ids_by_auth.get(authorization, set()))


class FakeLogService:
    def __init__(self) -> None:
        self.logs: list[dict] = []
        self.communications: list[dict] = []
        self.aml_alerts: dict[str, dict] = {}

    def bootstrap(self) -> None:
        return

    def health(self) -> bool:
        return True

    def create_log(self, request: CreateLogRequest) -> int:
        next_id = len(self.logs) + 1
        now = datetime.now(timezone.utc)
        self.logs.append(
            {
                "id": next_id,
                "action": request.action.value,
                "attribute_name": request.attributeName,
                "before_value": request.beforeValue,
                "after_value": request.afterValue,
                "user_id": request.userId,
                "client_id": request.clientId,
                "date_time": request.dateTime or now,
                "correlation_id": request.correlationId,
            }
        )
        return next_id

    def get_log(self, log_id: int) -> dict | None:
        for row in self.logs:
            if row["id"] == log_id:
                return row
        return None

    def list_logs(
        self,
        limit: int,
        offset: int,
        client_id,
        user_id,
        action,
        from_dt,
        to_dt,
    ):
        rows = list(self.logs)
        if client_id:
            rows = [r for r in rows if r["client_id"] == client_id]
        if user_id:
            rows = [r for r in rows if r["user_id"] == user_id]
        if action:
            rows = [r for r in rows if r["action"] == action]
        total = len(rows)
        return rows[offset : offset + limit], total

    def update_log(self, log_id: int, patch: UpdateLogRequest) -> dict | None:
        row = self.get_log(log_id)
        if row is None:
            return None
        if patch.attributeName is not None:
            row["attribute_name"] = patch.attributeName
        if patch.beforeValue is not None:
            row["before_value"] = patch.beforeValue
        if patch.afterValue is not None:
            row["after_value"] = patch.afterValue
        if patch.dateTime is not None:
            row["date_time"] = patch.dateTime
        return row

    def delete_log(self, log_id: int) -> bool:
        before = len(self.logs)
        self.logs = [r for r in self.logs if r["id"] != log_id]
        return len(self.logs) != before

    def create_communication(self, request: CreateCommunicationRequest) -> int:
        if request.idempotencyKey:
            for row in self.communications:
                if row.get("idempotency_key") == request.idempotencyKey:
                    return row["id"]
        next_id = len(self.communications) + 1
        now = datetime.now(timezone.utc)
        self.communications.append(
            {
                "id": next_id,
                "client_id": request.clientId,
                "user_id": request.userId,
                "channel": request.channel or "email",
                "to_email": request.toEmail,
                "subject": request.subject,
                "body": request.body,
                "status": "queued",
                "provider_message_id": None,
                "error_message": None,
                "idempotency_key": request.idempotencyKey,
                "retry_count": 0,
                "next_attempt_at": None,
                "last_attempt_at": None,
                "delivery_event": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        return next_id

    def get_communication(self, communication_id: int) -> dict | None:
        for row in self.communications:
            if row["id"] == communication_id:
                return row
        return None

    def list_communications(
        self,
        limit: int,
        offset: int,
        client_id: str,
        user_id: str | None = None,
    ):
        rows = [r for r in self.communications if r["client_id"] == client_id]
        if user_id:
            rows = [r for r in rows if r["user_id"] == user_id]
        total = len(rows)
        return rows[offset : offset + limit], total

    def list_queued_communications(self, limit: int):
        rows = [r for r in self.communications if r["status"] == "queued"]
        return rows[:limit]

    def update_communication_status(self, communication_id: int, patch) -> dict | None:
        row = self.get_communication(communication_id)
        if row is None:
            return None
        update = patch.model_dump(exclude_unset=True)
        if "status" in update and update["status"] is not None:
            row["status"] = update["status"].value
        if "providerMessageId" in update:
            row["provider_message_id"] = update["providerMessageId"]
        if "errorMessage" in update:
            row["error_message"] = update["errorMessage"]
        if "retryCount" in update:
            row["retry_count"] = update["retryCount"]
        if "nextAttemptAt" in update:
            row["next_attempt_at"] = update["nextAttemptAt"]
        if "lastAttemptAt" in update:
            row["last_attempt_at"] = update["lastAttemptAt"]
        if "deliveryEvent" in update:
            row["delivery_event"] = update["deliveryEvent"]
        row["updated_at"] = datetime.now(timezone.utc)
        return row

    def update_communication_status_by_provider_message_id(
        self,
        provider_message_id: str,
        patch,
    ) -> dict | None:
        for row in self.communications:
            if row.get("provider_message_id") == provider_message_id:
                return self.update_communication_status(row["id"], patch)
        return None

    def create_aml_alert(self, request: CreateAmlAlertRequest) -> dict:
        now = datetime.now(timezone.utc)
        row = {
            "id": len(self.aml_alerts) + 1,
            "alert_id": request.alertId,
            "client_id": request.clientId,
            "transaction_id": request.transactionId,
            "alert_type": request.alertType.value,
            "description": request.description,
            "detected_at": request.detectedAt,
            "review_status": request.reviewStatus.value,
            "created_at": now,
            "updated_at": now,
        }
        self.aml_alerts[request.alertId] = row
        return row

    def get_aml_alert(self, alert_id: str) -> dict | None:
        return self.aml_alerts.get(alert_id)

    def list_aml_alerts(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        client_ids: list[str] | None,
        alert_type: str | None,
        review_status: str | None,
    ):
        rows = list(self.aml_alerts.values())
        if client_id:
            rows = [r for r in rows if r["client_id"] == client_id]
        elif client_ids:
            rows = [r for r in rows if r["client_id"] in set(client_ids)]
        if alert_type:
            rows = [r for r in rows if r["alert_type"] == alert_type]
        if review_status:
            rows = [r for r in rows if r["review_status"] == review_status]
        total = len(rows)
        return rows[offset : offset + limit], total

    def update_aml_alert_review(self, alert_id: str, review_status: str) -> dict | None:
        row = self.aml_alerts.get(alert_id)
        if row is None:
            return None
        row["review_status"] = review_status
        row["updated_at"] = datetime.now(timezone.utc)
        return row


class FakeUnhealthyLogService(FakeLogService):
    def health(self) -> bool:
        return False


class FakeLogServiceValidationError(FakeLogService):
    def create_log(self, request: CreateLogRequest) -> int:
        raise ValueError("bad request")


class FakeLogServiceMissingCommunication(FakeLogService):
    def get_communication(self, communication_id: int) -> dict | None:
        return None


def _make_router(
    service: FakeLogService,
    secret: str = "test-secret",
    client_scope_authorizer: FakeClientScopeAuthorizer | None = None,
) -> LambdaRouter:
    settings = FakeSettings(jwt_hmac_secret=secret)
    return LambdaRouter(
        service,
        settings,
        client_scope_authorizer=(
            client_scope_authorizer
            if client_scope_authorizer is not None
            else FakeClientScopeAuthorizer()
        ),
    )


def _http_api_v2_event(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    query: dict[str, str] | None = None,
    body: dict | None = None,
) -> dict:
    raw_query = urlencode(query or {})
    event = {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": raw_query,
        "headers": headers or {},
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
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def _rest_proxy_event(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    query: dict[str, str] | None = None,
    body: dict | None = None,
    stage: str = "dev",
    include_stage_prefix: bool = False,
    include_user_request_prefix: bool = False,
) -> dict:
    normalized_path = path
    if include_user_request_prefix:
        normalized_path = f"/_user_request_{normalized_path}"
    if include_stage_prefix:
        normalized_path = f"/{stage}{normalized_path}"

    event = {
        "httpMethod": method,
        "path": normalized_path,
        "headers": headers or {},
        "queryStringParameters": query or None,
        "requestContext": {
            "stage": stage,
            "path": normalized_path,
        },
        "isBase64Encoded": False,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def _invoke(router: LambdaRouter, event: dict) -> tuple[dict, dict | None]:
    response = router.handle(event)
    body = response.get("body")
    if body:
        return response, json.loads(body)
    return response, None


def test_health_endpoints_ok() -> None:
    router = _make_router(FakeLogService())

    health, health_body = _invoke(router, _http_api_v2_event("GET", "/health"))
    v1, v1_body = _invoke(router, _http_api_v2_event("GET", "/api/v1/health"))
    logs_health, logs_health_body = _invoke(
        router, _http_api_v2_event("GET", "/api/v1/logs/health")
    )

    assert health["statusCode"] == 200
    assert health_body == {"status": "ok", "service": "log"}
    assert v1["statusCode"] == 200
    assert v1_body == {"status": "ok"}
    assert logs_health["statusCode"] == 200
    assert logs_health_body == {"status": "ok", "service": "log"}


def test_logs_health_unavailable() -> None:
    router = _make_router(FakeUnhealthyLogService())

    response, body = _invoke(router, _http_api_v2_event("GET", "/api/v1/logs/health"))

    assert response["statusCode"] == 503
    assert body is not None
    assert body["error"] == "service_unavailable"


def test_logs_requires_auth() -> None:
    router = _make_router(FakeLogService())

    response, body = _invoke(router, _http_api_v2_event("GET", "/api/logs"))

    assert response["statusCode"] == 401
    assert body is not None
    assert body["error"] == "unauthorized"


def test_request_id_header_propagates_to_errors() -> None:
    router = _make_router(FakeLogService())

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/logs",
            headers={"X-Request-Id": "req_123"},
        ),
    )

    assert response["statusCode"] == 401
    assert response["headers"]["X-Request-Id"] == "req_123"
    assert body is not None
    assert body["requestId"] == "req_123"


def test_create_log_as_user_success() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_1", "user", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/logs",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "action": "CREATE",
                "attributeName": "Client ID",
                "userId": "usr_1",
                "clientId": "clt_1",
            },
        ),
    )

    assert response["statusCode"] == 201
    assert body is not None
    assert body["logId"].startswith("log_")
    assert body["userId"] == "usr_1"


def test_create_log_user_mismatch_is_forbidden() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_1", "user", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/logs",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "action": "CREATE",
                "attributeName": "Client ID",
                "userId": "usr_other",
                "clientId": "clt_1",
            },
        ),
    )

    assert response["statusCode"] == 403
    assert body is not None
    assert body["error"] == "forbidden"


def test_create_log_body_validation_returns_400() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/logs",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "action": "CREATE",
                "userId": "usr_1",
                "clientId": "clt_1",
            },
        ),
    )

    assert response["statusCode"] == 400
    assert body is not None
    assert body["error"] == "validation_error"
    assert body["message"] == "Invalid request"


def test_create_log_service_validation_error_returns_400() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogServiceValidationError(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/logs",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "action": "CREATE",
                "attributeName": "Client ID",
                "userId": "usr_1",
                "clientId": "clt_1",
            },
        ),
    )

    assert response["statusCode"] == 400
    assert body is not None
    assert body["error"] == "validation_error"


def test_update_log_admin_only() -> None:
    secret = "test-secret"
    service = FakeLogService()
    router = _make_router(service, secret=secret)

    created_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            userId="usr_1",
            clientId="clt_1",
        )
    )

    user_token = mint_token("usr_1", "user", secret)
    forbidden, forbidden_body = _invoke(
        router,
        _http_api_v2_event(
            "PUT",
            f"/api/logs/log_{created_id}",
            headers={"Authorization": f"Bearer {user_token}"},
            body={"attributeName": "identityVerificationStatus"},
        ),
    )

    admin_token = mint_token("usr_admin", "admin", secret)
    updated, updated_body = _invoke(
        router,
        _http_api_v2_event(
            "PUT",
            f"/api/logs/log_{created_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            body={"attributeName": "identityVerificationStatus"},
        ),
    )

    assert forbidden["statusCode"] == 403
    assert forbidden_body is not None
    assert forbidden_body["error"] == "forbidden"
    assert updated["statusCode"] == 200
    assert updated_body is not None
    assert updated_body["attributeName"] == "identityVerificationStatus"


def test_list_logs_user_scope_is_forced() -> None:
    secret = "test-secret"
    service = FakeLogService()
    router = _make_router(service, secret=secret)
    service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            userId="usr_1",
            clientId="clt_1",
        )
    )
    service.create_log(
        CreateLogRequest(
            action="UPDATE",
            attributeName="Client ID",
            userId="usr_other",
            clientId="clt_1",
        )
    )

    token = mint_token("usr_1", "user", secret)
    response, body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/logs",
            query={"userId": "usr_other", "clientId": "clt_1"},
            headers={"Authorization": f"Bearer {token}"},
        ),
    )

    assert response["statusCode"] == 200
    assert body is not None
    assert len(body["data"]) == 1
    assert body["data"][0]["userId"] == "usr_1"


def test_list_logs_for_client_scope_admin_and_user() -> None:
    secret = "test-secret"
    service = FakeLogService()
    router = _make_router(service, secret=secret)
    service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            userId="usr_1",
            clientId="clt_1",
        )
    )
    service.create_log(
        CreateLogRequest(
            action="UPDATE",
            attributeName="Client ID",
            userId="usr_other",
            clientId="clt_1",
        )
    )

    admin_token = mint_token("usr_admin", "admin", secret)
    admin_response, admin_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/clients/clt_1/logs",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
    )
    user_token = mint_token("usr_1", "user", secret)
    user_response, user_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/clients/clt_1/logs",
            headers={"Authorization": f"Bearer {user_token}"},
        ),
    )

    assert admin_response["statusCode"] == 200
    assert admin_body is not None
    assert len(admin_body["data"]) == 2
    assert user_response["statusCode"] == 200
    assert user_body is not None
    assert len(user_body["data"]) == 1
    assert user_body["data"][0]["userId"] == "usr_1"


def test_communications_endpoints_enforce_role_scope_and_updates() -> None:
    secret = "test-secret"
    service = FakeLogService()
    router = _make_router(service, secret=secret)
    user_token = mint_token("usr_1", "user", secret)

    forbidden, forbidden_body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/communications",
            headers={"Authorization": f"Bearer {user_token}"},
            body={
                "clientId": "clt_1",
                "userId": "usr_other",
                "toEmail": "to@example.com",
                "subject": "Hello",
                "body": "Body",
            },
        ),
    )
    accepted, accepted_body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/communications",
            headers={"Authorization": f"Bearer {user_token}"},
            body={
                "clientId": "clt_1",
                "userId": "usr_1",
                "toEmail": "to@example.com",
                "subject": "Hello",
                "body": "Body",
            },
        ),
    )

    assert forbidden["statusCode"] == 403
    assert forbidden_body is not None
    assert forbidden_body["error"] == "forbidden"
    assert accepted["statusCode"] == 202
    assert accepted_body is not None

    communication_id = accepted_body["communicationId"]
    service.communications[0]["provider_message_id"] = "ses-message-1"

    get_owned, get_owned_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            f"/api/communications/{communication_id}",
            headers={"Authorization": f"Bearer {user_token}"},
        ),
    )
    list_owned, list_owned_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/clients/clt_1/communications",
            headers={"Authorization": f"Bearer {user_token}"},
        ),
    )

    assert get_owned["statusCode"] == 200
    assert get_owned_body is not None
    assert get_owned_body["communicationId"] == communication_id
    assert list_owned["statusCode"] == 200
    assert list_owned_body is not None
    assert len(list_owned_body["data"]) == 1

    queued_forbidden, _ = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/communications/queued",
            headers={"Authorization": f"Bearer {user_token}"},
        ),
    )
    admin_token = mint_token("usr_admin", "admin", secret)
    queued_ok, queued_ok_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/communications/queued",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
    )
    by_id, by_id_body = _invoke(
        router,
        _http_api_v2_event(
            "PATCH",
            f"/api/communications/{communication_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            body={"status": "sent", "providerMessageId": "ses-message-1"},
        ),
    )
    by_provider, by_provider_body = _invoke(
        router,
        _http_api_v2_event(
            "PATCH",
            "/api/communications/provider/ses-message-1/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            body={
                "status": "failed",
                "deliveryEvent": "BOUNCE",
                "errorMessage": "mailbox full",
            },
        ),
    )

    assert queued_forbidden["statusCode"] == 403
    assert queued_ok["statusCode"] == 200
    assert queued_ok_body is not None
    assert len(queued_ok_body["data"]) == 1
    assert by_id["statusCode"] == 200
    assert by_id_body is not None
    assert by_id_body["status"] == "sent"
    assert by_provider["statusCode"] == 200
    assert by_provider_body is not None
    assert by_provider_body["status"] == "failed"


def test_create_communication_missing_row_returns_500() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogServiceMissingCommunication(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/communications",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "clientId": "clt_1",
                "userId": "usr_1",
                "toEmail": "to@example.com",
                "subject": "Hello",
                "body": "Body",
            },
        ),
    )

    assert response["statusCode"] == 500
    assert body is not None
    assert body["error"] == "internal_error"


def test_create_communication_invalid_email_returns_400() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    response, body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/communications",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "clientId": "clt_1",
                "userId": "usr_1",
                "toEmail": "invalid-email",
                "subject": "Hello",
                "body": "Body",
            },
        ),
    )

    assert response["statusCode"] == 400
    assert body is not None
    assert body["error"] == "validation_error"
    assert body["message"] == "Invalid request"


def test_get_communication_invalid_id_and_not_found() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    bad_response, bad_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/communications/not-prefixed",
            headers={"Authorization": f"Bearer {token}"},
        ),
    )
    missing_response, missing_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/communications/com_999",
            headers={"Authorization": f"Bearer {token}"},
        ),
    )

    assert bad_response["statusCode"] == 400
    assert bad_body is not None
    assert bad_body["error"] == "validation_error"
    assert missing_response["statusCode"] == 404
    assert missing_body is not None
    assert missing_body["error"] == "not_found"


def test_aml_alert_create_list_review_flow() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    created, created_body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/aml/alerts",
            headers={"Authorization": f"Bearer {token}"},
            body={
                "alertId": "aml_1",
                "clientId": "clt_1",
                "transactionId": "txn_1",
                "alertType": "STRUCTURING",
                "description": "Structuring detected",
                "detectedAt": "2026-02-01T12:00:00Z",
                "reviewStatus": "Pending",
            },
        ),
    )
    listed, listed_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/aml/alerts",
            headers={"Authorization": f"Bearer {token}"},
            query={"clientId": "clt_1"},
        ),
    )
    reviewed, reviewed_body = _invoke(
        router,
        _http_api_v2_event(
            "PUT",
            "/api/aml/alerts/aml_1/review",
            headers={"Authorization": f"Bearer {token}"},
            body={"reviewStatus": "Confirmed"},
        ),
    )

    assert created["statusCode"] == 201
    assert created_body is not None
    assert created_body["alertId"] == "aml_1"
    assert listed["statusCode"] == 200
    assert listed_body is not None
    assert len(listed_body["data"]) == 1
    assert reviewed["statusCode"] == 200
    assert reviewed_body is not None
    assert reviewed_body["reviewStatus"] == "Confirmed"


def test_aml_alert_non_admin_access_is_client_scoped() -> None:
    secret = "test-secret"
    service = FakeLogService()
    user_token = mint_token("usr_1", "user", secret)
    user_auth = f"Bearer {user_token}"
    router = _make_router(
        service,
        secret=secret,
        client_scope_authorizer=FakeClientScopeAuthorizer(
            allow_all=False,
            allowed_client_ids_by_auth={user_auth: {"clt_1"}},
        ),
    )

    service.create_aml_alert(
        CreateAmlAlertRequest(
            alertId="aml_1",
            clientId="clt_1",
            transactionId="txn_1",
            alertType="STRUCTURING",
            description="Structuring detected",
            detectedAt=datetime.now(timezone.utc),
            reviewStatus="Pending",
        )
    )
    service.create_aml_alert(
        CreateAmlAlertRequest(
            alertId="aml_2",
            clientId="clt_2",
            transactionId="txn_2",
            alertType="PASSTHROUGH",
            description="Pass through anomaly",
            detectedAt=datetime.now(timezone.utc),
            reviewStatus="Pending",
        )
    )

    listed, listed_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/aml/alerts",
            headers={"Authorization": user_auth},
        ),
    )
    forbidden_client, forbidden_client_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/aml/alerts",
            headers={"Authorization": user_auth},
            query={"clientId": "clt_2"},
        ),
    )
    get_denied, get_denied_body = _invoke(
        router,
        _http_api_v2_event(
            "GET",
            "/api/aml/alerts/aml_2",
            headers={"Authorization": user_auth},
        ),
    )
    review_denied, review_denied_body = _invoke(
        router,
        _http_api_v2_event(
            "PUT",
            "/api/aml/alerts/aml_2/review",
            headers={"Authorization": user_auth},
            body={"reviewStatus": "Confirmed"},
        ),
    )
    review_allowed, review_allowed_body = _invoke(
        router,
        _http_api_v2_event(
            "PUT",
            "/api/aml/alerts/aml_1/review",
            headers={"Authorization": user_auth},
            body={"reviewStatus": "Confirmed"},
        ),
    )

    assert listed["statusCode"] == 200
    assert listed_body is not None
    assert [row["alertId"] for row in listed_body["data"]] == ["aml_1"]

    assert forbidden_client["statusCode"] == 200
    assert forbidden_client_body is not None
    assert forbidden_client_body["data"] == []

    assert get_denied["statusCode"] == 404
    assert get_denied_body is not None
    assert get_denied_body["error"] == "not_found"

    assert review_denied["statusCode"] == 404
    assert review_denied_body is not None
    assert review_denied_body["error"] == "not_found"

    assert review_allowed["statusCode"] == 200
    assert review_allowed_body is not None
    assert review_allowed_body["reviewStatus"] == "Confirmed"


def test_aml_alert_create_requires_admin_and_auth() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    user_token = mint_token("usr_1", "user", secret)

    unauthorized, unauthorized_body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/aml/alerts",
            body={
                "alertId": "aml_1",
                "clientId": "clt_1",
                "transactionId": "txn_1",
                "alertType": "STRUCTURING",
                "description": "Structuring detected",
                "detectedAt": "2026-02-01T12:00:00Z",
                "reviewStatus": "Pending",
            },
        ),
    )
    forbidden, forbidden_body = _invoke(
        router,
        _http_api_v2_event(
            "POST",
            "/api/aml/alerts",
            headers={"Authorization": f"Bearer {user_token}"},
            body={
                "alertId": "aml_1",
                "clientId": "clt_1",
                "transactionId": "txn_1",
                "alertType": "STRUCTURING",
                "description": "Structuring detected",
                "detectedAt": "2026-02-01T12:00:00Z",
                "reviewStatus": "Pending",
            },
        ),
    )

    assert unauthorized["statusCode"] == 401
    assert unauthorized_body is not None
    assert unauthorized_body["error"] == "unauthorized"
    assert forbidden["statusCode"] == 403
    assert forbidden_body is not None
    assert forbidden_body["error"] == "forbidden"


def test_rest_proxy_event_shapes_are_supported() -> None:
    secret = "test-secret"
    router = _make_router(FakeLogService(), secret=secret)
    token = mint_token("usr_admin", "admin", secret)

    rest_health, rest_health_body = _invoke(
        router,
        _rest_proxy_event(
            "GET",
            "/health",
            include_stage_prefix=True,
            include_user_request_prefix=True,
        ),
    )
    rest_logs, rest_logs_body = _invoke(
        router,
        _rest_proxy_event(
            "GET",
            "/api/logs",
            headers={"Authorization": f"Bearer {token}"},
            query={"limit": "5"},
        ),
    )

    assert rest_health["statusCode"] == 200
    assert rest_health_body == {"status": "ok", "service": "log"}
    assert rest_logs["statusCode"] == 200
    assert rest_logs_body is not None
    assert "data" in rest_logs_body
