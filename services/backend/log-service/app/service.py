from __future__ import annotations

from datetime import datetime, timezone

from .repository import LogRepository
from .schemas import CreateCommunicationRequest, CreateLogRequest, UpdateLogRequest


class LogService:
    def __init__(self, repository: LogRepository):
        self._repository = repository

    def health(self) -> bool:
        return self._repository.ping()

    def create_log(self, request: CreateLogRequest) -> int:
        payload = request.model_dump()
        if payload.get("dateTime") is None:
            payload["dateTime"] = datetime.now(timezone.utc)
        return self._repository.insert_audit_log(payload)

    def list_logs(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        agent_id: str | None,
        action: str | None,
        from_dt,
        to_dt,
    ):
        return self._repository.list_audit_logs(
            limit=limit,
            offset=offset,
            client_id=client_id,
            agent_id=agent_id,
            action=action,
            from_dt=from_dt,
            to_dt=to_dt,
        )

    def get_log(self, log_id: int) -> dict | None:
        return self._repository.get_audit_log(log_id)

    def update_log(self, log_id: int, patch: UpdateLogRequest) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        return self._repository.update_audit_log(log_id, payload)

    def delete_log(self, log_id: int) -> bool:
        return self._repository.delete_audit_log(log_id)

    def create_communication(self, request: CreateCommunicationRequest) -> int:
        payload = request.model_dump()
        if not payload.get("channel"):
            payload["channel"] = "email"
        payload["status"] = "queued"
        payload["providerMessageId"] = None
        payload["errorMessage"] = None
        return self._repository.insert_communication(payload)

    def get_communication(self, communication_id: int) -> dict | None:
        return self._repository.get_communication(communication_id)

    def list_communications(
        self, limit: int, offset: int, client_id: str, agent_id: str | None = None
    ):
        return self._repository.list_communications(
            limit=limit, offset=offset, client_id=client_id, agent_id=agent_id
        )

    def bootstrap(self) -> None:
        self._repository.run_migrations()
