from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import LogEventRequest


class FakeLogService:
    def __init__(self):
        self.events = []

    def bootstrap(self) -> None:
        return

    def health(self) -> bool:
        return True

    def create_log_event(self, request: LogEventRequest) -> int:
        self.events.append(request)
        return len(self.events)


class FailingLogService(FakeLogService):
    def create_log_event(self, request: LogEventRequest) -> int:
        raise RuntimeError("boom")


def test_health_ok() -> None:
    app = create_app(FakeLogService())
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_log_event_returns_created_id() -> None:
    app = create_app(FakeLogService())
    client = TestClient(app)

    payload = {
        "source": "clients-service",
        "action": "CREATE",
        "entityType": "CLIENT",
        "entityId": 1,
        "agentId": "agent-42",
        "message": "client created",
        "payload": {"emailAddress": "test@example.com"},
    }

    response = client.post("/api/v1/logs", json=payload)

    assert response.status_code == 201
    assert response.json() == {"id": 1}


def test_create_log_event_returns_500_on_failure() -> None:
    app = create_app(FailingLogService())
    client = TestClient(app)

    payload = {
        "source": "clients-service",
        "action": "DELETE",
        "entityType": "CLIENT",
    }

    response = client.post("/api/v1/logs", json=payload)

    assert response.status_code == 500
    assert response.json()["detail"] == "failed to persist log event"
