"""Pydantic schemas for the log-service API."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    error: str
    message: str
    requestId: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str | None = None


class Pagination(BaseModel):
    limit: int = Field(ge=1, le=200, default=50)
    offset: int = Field(ge=0, default=0)
    total: int = Field(ge=0, default=0)


class LogAction(str, Enum):
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    COMMUNICATION = "COMMUNICATION"


class CreateLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: LogAction
    attributeName: str = Field(min_length=1, max_length=100)
    beforeValue: str | None = Field(default=None, max_length=2000)
    afterValue: str | None = Field(default=None, max_length=2000)
    agentId: str = Field(min_length=1, max_length=64)
    clientId: str = Field(min_length=1, max_length=64)
    dateTime: datetime | None = None
    correlationId: str | None = Field(default=None, max_length=120)


class UpdateLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attributeName: str | None = Field(default=None, min_length=1, max_length=100)
    beforeValue: str | None = Field(default=None, max_length=2000)
    afterValue: str | None = Field(default=None, max_length=2000)
    dateTime: datetime | None = None


class LogEntry(BaseModel):
    logId: str
    action: LogAction
    attributeName: str
    beforeValue: str | None = None
    afterValue: str | None = None
    agentId: str
    clientId: str
    dateTime: datetime
    correlationId: str | None = None


class CommunicationChannel(str, Enum):
    email = "email"


class CreateCommunicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clientId: str = Field(min_length=1, max_length=64)
    agentId: str = Field(min_length=1, max_length=64)
    toEmail: str = Field(
        min_length=3,
        max_length=320,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    channel: CommunicationChannel | None = None
    idempotencyKey: str | None = Field(default=None, min_length=1, max_length=160)


class CommunicationStatus(str, Enum):
    queued = "queued"
    sent = "sent"
    failed = "failed"


class Communication(BaseModel):
    communicationId: str
    clientId: str
    agentId: str
    channel: CommunicationChannel = CommunicationChannel.email
    toEmail: str
    subject: str
    body: str
    status: CommunicationStatus = CommunicationStatus.queued
    providerMessageId: str | None = None
    errorMessage: str | None = None
    idempotencyKey: str | None = None
    retryCount: int = Field(ge=0, default=0)
    nextAttemptAt: datetime | None = None
    lastAttemptAt: datetime | None = None
    deliveryEvent: str | None = None
    createdAt: datetime
    updatedAt: datetime


class UpdateCommunicationStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: CommunicationStatus | None = None
    providerMessageId: str | None = Field(default=None, max_length=200)
    errorMessage: str | None = Field(default=None, max_length=2000)
    retryCount: int | None = Field(default=None, ge=0)
    nextAttemptAt: datetime | None = None
    lastAttemptAt: datetime | None = None
    deliveryEvent: str | None = Field(default=None, max_length=80)


class AmlAlertType(str, Enum):
    STATISTICAL_OUTLIER = "STATISTICAL_OUTLIER"
    STRUCTURING = "STRUCTURING"
    PASSTHROUGH = "PASSTHROUGH"
    INCEPTION_SPIKE = "INCEPTION_SPIKE"


class AmlReviewStatus(str, Enum):
    Pending = "Pending"
    Confirmed = "Confirmed"
    Dismissed = "Dismissed"


class CreateAmlAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alertId: str = Field(min_length=1, max_length=64)
    clientId: str = Field(min_length=1, max_length=64)
    transactionId: str | None = Field(default=None, max_length=255)
    alertType: AmlAlertType
    description: str = Field(min_length=1, max_length=2000)
    detectedAt: datetime
    reviewStatus: AmlReviewStatus = AmlReviewStatus.Pending


class AmlAlert(BaseModel):
    alertId: str
    clientId: str
    transactionId: str | None = None
    alertType: AmlAlertType
    description: str
    detectedAt: datetime
    reviewStatus: AmlReviewStatus
    createdAt: datetime
    updatedAt: datetime


class UpdateAmlAlertReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewStatus: AmlReviewStatus


def now_utc() -> datetime:
    """Return the current UTC timestamp."""
    return datetime.now(timezone.utc)
