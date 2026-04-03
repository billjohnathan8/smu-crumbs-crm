"""Service layer tests for audit log and communication defaults."""

from __future__ import annotations

from datetime import datetime

from app.schemas import (
    CreateCommunicationRequest,
    CreateLogRequest,
    UpdateCommunicationStatusRequest,
    UpdateLogRequest,
)
from app.service import LogService


class FakeRepository:
    def __init__(self) -> None:
        self.migrations_ran = False
        self.created_log_payload = None
        self.updated_payload = None

    def ping(self) -> bool:
        return True

    def insert_audit_log(self, payload: dict) -> int:
        self.created_log_payload = payload
        return 42

    def list_audit_logs(self, **kwargs):
        return ([{"id": 1}], 1)

    def get_audit_log(self, log_id: int):
        return {"id": log_id}

    def update_audit_log(self, log_id: int, payload: dict):
        self.updated_payload = payload
        return {"id": log_id}

    def delete_audit_log(self, _log_id: int) -> bool:
        return True

    def insert_communication(self, payload: dict) -> int:
        self.created_communication_payload = payload
        return 8

    def get_communication(self, communication_id: int):
        return {"id": communication_id}

    def list_communications(self, **kwargs):
        return ([{"id": 3}], 1)

    def list_all_communications(self, **kwargs):
        self.list_all_communications_kwargs = kwargs
        return ([{"id": 4}], 2)

    def list_queued_communications(self, **kwargs):
        self.list_queued_kwargs = kwargs
        return [{"id": 8, "status": "queued"}]

    def update_communication_status(self, communication_id: int, payload: dict):
        self.updated_communication_payload = payload
        return {"id": communication_id, "status": payload.get("status", "queued")}

    def update_communication_status_by_provider_message_id(
        self, provider_message_id: str, payload: dict
    ):
        self.updated_communication_payload = payload
        return {
            "id": 9,
            "provider_message_id": provider_message_id,
            "status": payload.get("status", "queued"),
        }

    def get_communication_by_provider_message_id(self, provider_message_id: str):
        return {"id": 9, "provider_message_id": provider_message_id}

    def run_migrations(self) -> None:
        self.migrations_ran = True


def test_create_log_sets_default_datetime() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    created_id = service.create_log(
        CreateLogRequest(
            action="CREATE",
            attributeName="field",
            userId="usr_1",
            clientId="clt_1",
        )
    )

    assert created_id == 42
    assert repo.created_log_payload is not None
    assert isinstance(repo.created_log_payload["dateTime"], datetime)


def test_create_communication_sets_defaults() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    created_id = service.create_communication(
        CreateCommunicationRequest(
            clientId="clt_1",
            userId="usr_1",
            toEmail="to@example.com",
            subject="Hello",
            body="Body",
            channel=None,
        )
    )

    assert created_id == 8
    assert repo.created_communication_payload["channel"] == "email"
    assert repo.created_communication_payload["status"] == "queued"
    assert repo.created_communication_payload["providerMessageId"] is None
    assert repo.created_communication_payload["idempotencyKey"] is None
    assert repo.created_communication_payload["retryCount"] == 0


def test_update_and_list_delegates_to_repository() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    listed, total = service.list_logs(10, 0, "clt_1", "usr_1", "CREATE", None, None)
    updated = service.update_log(
        10,
        UpdateLogRequest(
            attributeName="status", beforeValue=None, afterValue="approved"
        ),
    )
    communications, comm_total = service.list_communications(5, 0, "clt_1", "usr_1")
    queued = service.list_queued_communications(20)
    all_communications, all_total = service.list_all_communications(10, 5, status="sent")

    assert total == 1
    assert listed[0]["id"] == 1
    assert updated["id"] == 10
    assert repo.updated_payload == {
        "attributeName": "status",
        "beforeValue": None,
        "afterValue": "approved",
    }
    assert comm_total == 1
    assert communications[0]["id"] == 3
    assert queued[0]["status"] == "queued"
    assert repo.list_queued_kwargs["status"] == "queued"
    assert all_total == 2
    assert all_communications[0]["id"] == 4
    assert repo.list_all_communications_kwargs["offset"] == 5
    assert repo.list_all_communications_kwargs["status"] == "sent"


def test_update_communication_status_delegates() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    updated = service.update_communication_status(
        8,
        UpdateCommunicationStatusRequest(
            status="sent",
            providerMessageId="ses-1",
            errorMessage=None,
            retryCount=1,
        ),
    )

    assert updated == {"id": 8, "status": "sent"}
    assert repo.updated_communication_payload == {
        "status": "sent",
        "providerMessageId": "ses-1",
        "errorMessage": None,
        "retryCount": 1,
    }


def test_update_communication_status_by_provider_message_id_delegates() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    updated = service.update_communication_status_by_provider_message_id(
        "ses-123",
        UpdateCommunicationStatusRequest(
            status="failed",
            errorMessage="bounce",
            deliveryEvent="BOUNCE",
        ),
    )

    assert updated["provider_message_id"] == "ses-123"
    assert repo.updated_communication_payload == {
        "status": "failed",
        "errorMessage": "bounce",
        "deliveryEvent": "BOUNCE",
    }


def test_bootstrap_runs_migrations() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    service.bootstrap()

    assert repo.migrations_ran is True


def test_health_delegates_to_repository() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    assert service.health() is True


def test_create_log_preserves_explicit_datetime() -> None:
    repo = FakeRepository()
    service = LogService(repo)
    explicit_dt = datetime(2026, 1, 15, 10, 0, 0)

    service.create_log(
        CreateLogRequest(
            action="UPDATE",
            attributeName="status",
            userId="usr_1",
            clientId="clt_1",
            dateTime=explicit_dt,
        )
    )

    assert repo.created_log_payload["dateTime"] == explicit_dt


def test_get_log_returns_entry() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    result = service.get_log(42)

    assert result == {"id": 42}


def test_delete_log_returns_true() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    assert service.delete_log(42) is True


def test_create_communication_with_explicit_channel() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    service.create_communication(
        CreateCommunicationRequest(
            clientId="clt_1",
            userId="usr_1",
            toEmail="a@b.com",
            subject="Hi",
            body="Body",
            channel="email",
        )
    )

    assert repo.created_communication_payload["channel"] == "email"


def test_create_aml_alert_delegates() -> None:
    from app.schemas import CreateAmlAlertRequest

    repo = FakeRepository()
    repo.insert_aml_alert = lambda payload: {"alertId": "a1", **payload}
    service = LogService(repo)

    result = service.create_aml_alert(
        CreateAmlAlertRequest(
            alertId="a1",
            clientId="clt_1",
            alertType="STATISTICAL_OUTLIER",
            description="test",
            detectedAt="2026-01-15T00:00:00Z",
            reviewStatus="Pending",
        )
    )

    assert result["alertId"] == "a1"


def test_get_aml_alert_delegates() -> None:
    repo = FakeRepository()
    repo.get_aml_alert_by_alert_id = lambda alert_id: {"alertId": alert_id}
    service = LogService(repo)

    result = service.get_aml_alert("a1")

    assert result == {"alertId": "a1"}


def test_list_aml_alerts_delegates() -> None:
    repo = FakeRepository()
    repo.list_aml_alerts = lambda **kwargs: ([{"alertId": "a1"}], 1)
    service = LogService(repo)

    data, total = service.list_aml_alerts(10, 0, None, None, None, None)

    assert total == 1


def test_update_aml_alert_review_delegates() -> None:
    repo = FakeRepository()
    repo.update_aml_alert_review = lambda aid, rs: {"alertId": aid, "reviewStatus": rs}
    service = LogService(repo)

    result = service.update_aml_alert_review("a1", "Confirmed")

    assert result["reviewStatus"] == "Confirmed"


def test_get_communication_delegates() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    result = service.get_communication(3)

    assert result == {"id": 3}


def test_get_communication_by_provider_message_id_delegates() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    result = service.get_communication_by_provider_message_id("ses-123")

    assert result["provider_message_id"] == "ses-123"


def test_update_communication_status_empty_patch_returns_existing() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    result = service.update_communication_status(8, UpdateCommunicationStatusRequest())

    assert result == {"id": 8}


def test_update_communication_status_by_provider_empty_patch_returns_existing() -> None:
    repo = FakeRepository()
    service = LogService(repo)

    result = service.update_communication_status_by_provider_message_id(
        "ses-123", UpdateCommunicationStatusRequest()
    )

    assert result["provider_message_id"] == "ses-123"
