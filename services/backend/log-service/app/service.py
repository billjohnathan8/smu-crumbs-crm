from __future__ import annotations

from .repository import LogRepository
from .schemas import LogEventRequest


class LogService:
    def __init__(self, repository: LogRepository):
        self._repository = repository

    def health(self) -> bool:
        return self._repository.ping()

    def create_log_event(self, request: LogEventRequest) -> int:
        return self._repository.insert_log_event(request.model_dump())

    def bootstrap(self) -> None:
        self._repository.run_migrations()