"""API endpoint tests for the log-service FastAPI app."""

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import create_app
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
                "agent_id": request.agentId,
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
        agent_id,
        action,
        from_dt,
        to_dt,
    ):
        rows = list(self.logs)
        if client_id:
            rows = [r for r in rows if r["client_id"] == client_id]
        if agent_id:
            rows = [r for r in rows if r["agent_id"] == agent_id]
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
        next_id = len(self.communications) + 1
        now = datetime.now(timezone.utc)
        self.communications.append(
            {
                "id": next_id,
                "client_id": request.clientId,
                "agent_id": request.agentId,
                "channel": request.channel or "email",
                "to_email": request.toEmail,
                "subject": request.subject,
                "body": request.body,
                "status": "queued",
                "provider_message_id": None,
                "error_message": None,
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
        self, limit: int, offset: int, client_id: str, agent_id: str | None = None
    ):
        rows = [r for r in self.communications if r["client_id"] == client_id]
        if agent_id:
            rows = [r for r in rows if r["agent_id"] == agent_id]
        total = len(rows)
        return rows[offset : offset + limit], total

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
        alert_type: str | None,
        review_status: str | None,
    ):
        rows = list(self.aml_alerts.values())
        if client_id:
            rows = [r for r in rows if r["client_id"] == client_id]
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


def test_health_ok() -> None:
    app = create_app(FakeLogService())
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_v1_ok() -> None:
    app = create_app(FakeLogService())
    client = TestClient(app)

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_logs_health_unavailable() -> None:
    app = create_app(FakeUnhealthyLogService())
    client = TestClient(app)

    response = client.get("/api/v1/logs/health")

    assert response.status_code == 503
    assert response.json()["error"] == "service_unavailable"


def test_logs_requires_auth() -> None:
    app = create_app(FakeLogService())
    client = TestClient(app)

    response = client.get("/api/logs")

    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_request_id_middleware_sets_header_and_error_request_id() -> None:
    request_id = "req_123"
    app = create_app(FakeLogService())
    client = TestClient(app)

    response = client.get("/api/logs", headers={"X-Request-Id": request_id})

    assert response.status_code == 401
    assert response.headers["X-Request-Id"] == request_id
    assert response.json()["requestId"] == request_id


def test_create_log_as_agent_ok() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)

    token = mint_token("usr_1", "agent", secret)
    payload = {
        "action": "CREATE",
        "attributeName": "Client ID",
        "agentId": "usr_1",
        "clientId": "clt_1",
    }

    response = client.post(
        "/api/logs", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["logId"].startswith("log_")
    assert body["agentId"] == "usr_1"


def test_create_log_agent_mismatched_agent_id_is_forbidden() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)

    token = mint_token("usr_1", "agent", secret)
    payload = {
        "action": "CREATE",
        "attributeName": "Client ID",
        "agentId": "usr_other",
        "clientId": "clt_1",
    }

    response = client.post(
        "/api/logs", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_create_log_validation_error_returns_400() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogServiceValidationError())
    client = TestClient(app)

    token = mint_token("usr_admin", "admin", secret)
    payload = {
        "action": "CREATE",
        "attributeName": "Client ID",
        "agentId": "usr_1",
        "clientId": "clt_1",
    }

    response = client.post(
        "/api/logs", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"


def test_create_log_body_validation_returns_400_error_shape() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)

    token = mint_token("usr_admin", "admin", secret)
    payload = {
        "action": "CREATE",
        "agentId": "usr_1",
        "clientId": "clt_1",
    }

    response = client.post(
        "/api/logs", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"
    assert "attributeName" in response.json()["message"]


def test_update_log_admin_only() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)

    log_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )
    token = mint_token("usr_admin", "admin", secret)

    response = client.put(
        f"/api/logs/log_{log_id}",
        json={"attributeName": "identityVerificationStatus"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["attributeName"] == "identityVerificationStatus"


def test_update_log_agent_forbidden() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)

    log_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )
    token = mint_token("usr_1", "agent", secret)

    response = client.put(
        f"/api/logs/log_{log_id}",
        json={"attributeName": "identityVerificationStatus"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_update_log_not_found_returns_404() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)

    response = client.put(
        "/api/logs/log_999",
        json={"attributeName": "identityVerificationStatus"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["error"] == "not_found"


def test_get_log_invalid_id_returns_bad_request() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)

    response = client.get(
        "/api/logs/not-prefixed", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"


def test_get_log_admin_ok_and_not_found() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)

    existing_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )

    found = client.get(
        f"/api/logs/log_{existing_id}", headers={"Authorization": f"Bearer {token}"}
    )
    missing = client.get(
        "/api/logs/log_999", headers={"Authorization": f"Bearer {token}"}
    )

    assert found.status_code == 200
    assert found.json()["logId"] == f"log_{existing_id}"
    assert missing.status_code == 404


def test_get_log_agent_cannot_see_other_agents_log() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    log_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_owner",
            clientId="clt_1",
        )
    )

    token = mint_token("usr_other", "agent", secret)
    response = client.get(
        f"/api/logs/log_{log_id}", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 404


def test_delete_log_admin_not_found_and_success() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)
    existing_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )

    missing = client.delete(
        "/api/logs/log_999", headers={"Authorization": f"Bearer {token}"}
    )
    deleted = client.delete(
        f"/api/logs/log_{existing_id}", headers={"Authorization": f"Bearer {token}"}
    )

    assert missing.status_code == 404
    assert deleted.status_code == 204


def test_list_logs_for_agent_forces_agent_scope() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )
    service.create_log(
        CreateLogRequest(
            action="UPDATE",
            attributeName="Client ID",
            agentId="usr_other",
            clientId="clt_1",
        )
    )
    token = mint_token("usr_1", "agent", secret)

    response = client.get(
        "/api/logs?agentId=usr_other&clientId=clt_1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["data"][0]["agentId"] == "usr_1"


def test_list_logs_for_client_admin_sees_all_agent_scoped() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="Client ID",
            agentId="usr_1",
            clientId="clt_1",
        )
    )
    service.create_log(
        CreateLogRequest(
            action="UPDATE",
            attributeName="Client ID",
            agentId="usr_other",
            clientId="clt_1",
        )
    )

    admin_token = mint_token("usr_admin", "admin", secret)
    admin_response = client.get(
        "/api/clients/clt_1/logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    agent_token = mint_token("usr_1", "agent", secret)
    agent_response = client.get(
        "/api/clients/clt_1/logs",
        headers={"Authorization": f"Bearer {agent_token}"},
    )

    assert admin_response.status_code == 200
    assert len(admin_response.json()["data"]) == 2
    assert agent_response.status_code == 200
    assert len(agent_response.json()["data"]) == 1
    assert agent_response.json()["data"][0]["agentId"] == "usr_1"


def test_communications_endpoints_enforce_role_and_scope() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    agent_token = mint_token("usr_1", "agent", secret)

    forbidden = client.post(
        "/api/communications",
        json={
            "clientId": "clt_1",
            "agentId": "usr_other",
            "toEmail": "to@example.com",
            "subject": "Hello",
            "body": "Body",
        },
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    accepted = client.post(
        "/api/communications",
        json={
            "clientId": "clt_1",
            "agentId": "usr_1",
            "toEmail": "to@example.com",
            "subject": "Hello",
            "body": "Body",
        },
        headers={"Authorization": f"Bearer {agent_token}"},
    )

    assert forbidden.status_code == 403
    assert accepted.status_code == 202
    communication_id = accepted.json()["communicationId"]

    get_owned = client.get(
        f"/api/communications/{communication_id}",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    list_owned = client.get(
        "/api/clients/clt_1/communications",
        headers={"Authorization": f"Bearer {agent_token}"},
    )

    assert get_owned.status_code == 200
    assert list_owned.status_code == 200
    assert len(list_owned.json()["data"]) == 1


def test_create_communication_returns_500_when_missing_row() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogServiceMissingCommunication())
    client = TestClient(app)
    admin_token = mint_token("usr_admin", "admin", secret)

    response = client.post(
        "/api/communications",
        json={
            "clientId": "clt_1",
            "agentId": "usr_1",
            "toEmail": "to@example.com",
            "subject": "Hello",
            "body": "Body",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 500
    assert response.json()["error"] == "internal_error"


def test_create_communication_invalid_email_returns_400() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)
    admin_token = mint_token("usr_admin", "admin", secret)

    response = client.post(
        "/api/communications",
        json={
            "clientId": "clt_1",
            "agentId": "usr_1",
            "toEmail": "invalid-email",
            "subject": "Hello",
            "body": "Body",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"
    assert "toEmail" in response.json()["message"]


def test_get_communication_invalid_id_and_not_found() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    admin_token = mint_token("usr_admin", "admin", secret)

    bad = client.get(
        "/api/communications/not-prefixed",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    missing = client.get(
        "/api/communications/com_999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert bad.status_code == 400
    assert bad.json()["error"] == "validation_error"
    assert missing.status_code == 404
    assert missing.json()["error"] == "not_found"


def test_list_communications_admin_sees_all_agent_scoped() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)

    service.create_communication(
        CreateCommunicationRequest(
            clientId="clt_1",
            agentId="usr_1",
            toEmail="to@example.com",
            subject="Hello",
            body="Body",
            channel=None,
        )
    )
    service.create_communication(
        CreateCommunicationRequest(
            clientId="clt_1",
            agentId="usr_other",
            toEmail="to@example.com",
            subject="Hello 2",
            body="Body 2",
            channel=None,
        )
    )

    admin_token = mint_token("usr_admin", "admin", secret)
    admin_response = client.get(
        "/api/clients/clt_1/communications",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    agent_token = mint_token("usr_1", "agent", secret)
    agent_response = client.get(
        "/api/clients/clt_1/communications",
        headers={"Authorization": f"Bearer {agent_token}"},
    )

    assert admin_response.status_code == 200
    assert len(admin_response.json()["data"]) == 2
    assert agent_response.status_code == 200
    assert len(agent_response.json()["data"]) == 1
    assert agent_response.json()["data"][0]["agentId"] == "usr_1"


def test_create_and_review_aml_alert_flow() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    service = FakeLogService()
    app = create_app(service)
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)

    create_response = client.post(
        "/api/aml/alerts",
        json={
            "alertId": "aml_1",
            "clientId": "clt_1",
            "transactionId": "txn_1",
            "alertType": "STRUCTURING",
            "description": "Structuring detected",
            "detectedAt": "2026-02-01T12:00:00Z",
            "reviewStatus": "Pending",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_response.status_code == 201
    assert create_response.json()["alertId"] == "aml_1"
    assert create_response.json()["reviewStatus"] == "Pending"

    list_response = client.get(
        "/api/aml/alerts?clientId=clt_1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    review_response = client.put(
        "/api/aml/alerts/aml_1/review",
        json={"reviewStatus": "Confirmed"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert review_response.status_code == 200
    assert review_response.json()["reviewStatus"] == "Confirmed"


def test_get_aml_alert_not_found() -> None:
    secret = "test-secret"
    os.environ["JWT_HMAC_SECRET"] = secret
    app = create_app(FakeLogService())
    client = TestClient(app)
    token = mint_token("usr_admin", "admin", secret)

    response = client.get(
        "/api/aml/alerts/aml_missing",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["error"] == "not_found"
