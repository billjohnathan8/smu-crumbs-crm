from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class LogEventRequest(BaseModel):
    source: str = Field(min_length=1, max_length=120)
    action: str = Field(min_length=1, max_length=40)
    entityType: str = Field(min_length=1, max_length=60)
    entityId: int | None = None
    agentId: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=500)
    payload: dict[str, Any] | None = None
    occurredAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HealthResponse(BaseModel):
    status: str


class LogEventResponse(BaseModel):
    id: int