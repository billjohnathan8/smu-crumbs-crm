"""Service layer for audit logs and communications."""

from __future__ import annotations

from datetime import datetime, timezone

from .repository import LogRepository
from .schemas import (
    CreateAmlAlertRequest,
    CreateCommunicationRequest,
    CreateLogRequest,
    UpdateCommunicationStatusRequest,
    UpdateLogRequest,
)


class LogService:
    """Coordinates log-service business operations using a repository backend."""

    def __init__(self, repository: LogRepository):
        self._repository = repository

    def health(self) -> bool:
        """Check repository connectivity."""
        return self._repository.ping()

    def create_log(self, request: CreateLogRequest) -> int:
        """Create an audit log entry, defaulting dateTime when missing."""
        payload = request.model_dump()
        if payload.get("dateTime") is None:
            payload["dateTime"] = datetime.now(timezone.utc)
        return self._repository.insert_audit_log(payload)

    def list_logs(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        user_id: str | None,
        action: str | None,
        from_dt,
        to_dt,
    ):
        """List audit logs with pagination and optional filters."""
        return self._repository.list_audit_logs(
            limit=limit,
            offset=offset,
            client_id=client_id,
            user_id=user_id,
            action=action,
            from_dt=from_dt,
            to_dt=to_dt,
        )

    def get_log(self, log_id: int) -> dict | None:
        """Fetch a single audit log by internal id."""
        return self._repository.get_audit_log(log_id)

    def update_log(self, log_id: int, patch: UpdateLogRequest) -> dict | None:
        """Apply a partial update to an audit log."""
        payload = patch.model_dump(exclude_unset=True)
        return self._repository.update_audit_log(log_id, payload)

    def delete_log(self, log_id: int) -> bool:
        """Delete an audit log by id."""
        return self._repository.delete_audit_log(log_id)

    def create_communication(self, request: CreateCommunicationRequest) -> int:
        """Queue a communication record with default metadata."""
        payload = request.model_dump()
        if not payload.get("channel"):
            payload["channel"] = "email"
        payload["status"] = "queued"
        payload["providerMessageId"] = None
        payload["errorMessage"] = None
        payload["retryCount"] = 0
        payload["nextAttemptAt"] = None
        payload["lastAttemptAt"] = None
        payload["deliveryEvent"] = None
        return self._repository.insert_communication(payload)

    def create_aml_alert(self, request: CreateAmlAlertRequest) -> dict:
        """Create and return an AML alert record."""
        return self._repository.insert_aml_alert(request.model_dump())

    def get_aml_alert(self, alert_id: str) -> dict | None:
        """Fetch a single AML alert by external alert id."""
        return self._repository.get_aml_alert_by_alert_id(alert_id)

    def list_aml_alerts(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        client_ids: list[str] | None,
        alert_type: str | None,
        review_status: str | None,
    ):
        """List AML alerts with pagination and optional filters."""
        return self._repository.list_aml_alerts(
            limit=limit,
            offset=offset,
            client_id=client_id,
            client_ids=client_ids,
            alert_type=alert_type,
            review_status=review_status,
        )

    def update_aml_alert_review(self, alert_id: str, review_status: str) -> dict | None:
        """Update review status for an AML alert."""
        return self._repository.update_aml_alert_review(alert_id, review_status)

    def get_communication(self, communication_id: int) -> dict | None:
        """Fetch a single communication record by id."""
        return self._repository.get_communication(communication_id)

    def get_communication_by_provider_message_id(
        self, provider_message_id: str
    ) -> dict | None:
        """Fetch a single communication record by provider message id."""
        return self._repository.get_communication_by_provider_message_id(
            provider_message_id
        )

    def list_communications(
        self, limit: int, offset: int, client_id: str, user_id: str | None = None
    ):
        """List communications for a client, optionally scoped to an user."""
        return self._repository.list_communications(
            limit=limit, offset=offset, client_id=client_id, user_id=user_id
        )

    def list_queued_communications(
        self,
        limit: int,
        status: str | None = "queued",
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        recipient: str | None = None,
        subject: str | None = None,
        client_id: str | None = None,
        user_id: str | None = None,
    ) -> list[dict]:
        """List communications with optional admin filters."""
        return self._repository.list_queued_communications(
            limit=limit,
            status=status,
            created_from=created_from,
            created_to=created_to,
            recipient=recipient,
            subject=subject,
            client_id=client_id,
            user_id=user_id,
        )

    def update_communication_status(
        self, communication_id: int, patch: UpdateCommunicationStatusRequest
    ) -> dict | None:
        """Update communication delivery fields by communication id."""
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            return self._repository.get_communication(communication_id)
        return self._repository.update_communication_status(communication_id, payload)

    def update_communication_status_by_provider_message_id(
        self, provider_message_id: str, patch: UpdateCommunicationStatusRequest
    ) -> dict | None:
        """Update communication delivery fields by provider message id."""
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            return self._repository.get_communication_by_provider_message_id(
                provider_message_id
            )
        return self._repository.update_communication_status_by_provider_message_id(
            provider_message_id, payload
        )

    def bootstrap(self) -> None:
        """Run storage migrations on startup."""
        self._repository.run_migrations()
