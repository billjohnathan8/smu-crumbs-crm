"""SQS audit-consumer Lambda with idempotent DynamoDB writes."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError

DEFAULT_IDEMPOTENCY_TTL_DAYS = 90
DEFAULT_LOG_LEVEL = "INFO"
CONDITIONAL_WRITE_EXPRESSION = "attribute_not_exists(pk) AND attribute_not_exists(sk)"

logger = logging.getLogger(__name__)


class NonRetryableMessageError(Exception):
    """Raised when a message is malformed and should not be retried."""


class RetryableProcessingError(Exception):
    """Raised when processing fails and the message should be retried."""


@dataclass(frozen=True)
class AuditEvent:
    """Validated audit event payload."""

    event_id: str
    occurred_at_iso: str
    action: str
    attribute_name: str
    user_id: str
    client_id: str
    source_service: str
    before_value: Any | None = None
    after_value: Any | None = None
    correlation_id: str | None = None
    request_id: str | None = None
    metadata: dict[str, Any] | None = None


def configure_logging() -> None:
    """Configure logger level from LOG_LEVEL environment variable."""
    level_name = os.environ.get("LOG_LEVEL", DEFAULT_LOG_LEVEL).upper()
    level = getattr(logging, level_name, logging.INFO)
    logger.setLevel(level)


def _validate_required_string(payload: dict[str, Any], field_name: str) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise NonRetryableMessageError(
            f"Missing or invalid required field '{field_name}'"
        )
    return value.strip()


def _validate_optional_string(payload: dict[str, Any], field_name: str) -> str | None:
    if field_name not in payload or payload[field_name] is None:
        return None
    value = payload[field_name]
    if not isinstance(value, str) or not value.strip():
        raise NonRetryableMessageError(f"Invalid optional field '{field_name}'")
    return value.strip()


def _normalize_iso8601(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise NonRetryableMessageError("Missing or invalid required field 'occurredAt'")

    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise NonRetryableMessageError(
            "Invalid ISO-8601 value for 'occurredAt'"
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

    return parsed.isoformat().replace("+00:00", "Z")


def parse_and_validate_event(body: str) -> AuditEvent:
    """Parse JSON body and validate required/optional schema."""
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise NonRetryableMessageError("Record body is not valid JSON") from exc

    if not isinstance(payload, dict):
        raise NonRetryableMessageError("Record body must be a JSON object")

    metadata = payload.get("metadata")
    if metadata is not None and not isinstance(metadata, dict):
        raise NonRetryableMessageError("Optional field 'metadata' must be an object")

    return AuditEvent(
        event_id=_validate_required_string(payload, "eventId"),
        occurred_at_iso=_normalize_iso8601(
            _validate_required_string(payload, "occurredAt")
        ),
        action=_validate_required_string(payload, "action"),
        attribute_name=_validate_required_string(payload, "attributeName"),
        user_id=_validate_required_string(payload, "userId"),
        client_id=_validate_required_string(payload, "clientId"),
        source_service=_validate_required_string(payload, "sourceService"),
        before_value=payload.get("beforeValue"),
        after_value=payload.get("afterValue"),
        correlation_id=_validate_optional_string(payload, "correlationId"),
        request_id=_validate_optional_string(payload, "requestId"),
        metadata=metadata,
    )


def resolve_idempotency_ttl_days() -> int:
    """Read and validate IDEMPOTENCY_TTL_DAYS with a safe default."""
    raw_value = os.environ.get(
        "IDEMPOTENCY_TTL_DAYS", str(DEFAULT_IDEMPOTENCY_TTL_DAYS)
    ).strip()

    try:
        ttl_days = int(raw_value)
    except ValueError:
        logger.warning(
            "Invalid IDEMPOTENCY_TTL_DAYS='%s'; defaulting to %d",
            raw_value,
            DEFAULT_IDEMPOTENCY_TTL_DAYS,
        )
        return DEFAULT_IDEMPOTENCY_TTL_DAYS

    if ttl_days <= 0:
        logger.warning(
            "Non-positive IDEMPOTENCY_TTL_DAYS=%d; defaulting to %d",
            ttl_days,
            DEFAULT_IDEMPOTENCY_TTL_DAYS,
        )
        return DEFAULT_IDEMPOTENCY_TTL_DAYS

    return ttl_days


def map_event_to_dynamodb_item(
    event: AuditEvent,
    *,
    ttl_days: int,
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    """Map a validated event into the target DynamoDB item shape."""
    now = now_utc or datetime.now(timezone.utc)
    ttl_epoch_seconds = int((now + timedelta(days=ttl_days)).timestamp())

    item: dict[str, Any] = {
        "pk": f"AUDIT#{event.event_id}",
        "sk": event.occurred_at_iso,
        "event_id": event.event_id,
        "action": event.action,
        "attribute_name": event.attribute_name,
        "user_id": event.user_id,
        "client_id": event.client_id,
        "source_service": event.source_service,
        "ttl": ttl_epoch_seconds,
    }

    if event.before_value is not None:
        item["before_value"] = event.before_value
    if event.after_value is not None:
        item["after_value"] = event.after_value
    if event.correlation_id:
        item["correlation_id"] = event.correlation_id
    if event.request_id:
        item["request_id"] = event.request_id
    if event.metadata is not None:
        item["metadata"] = event.metadata

    return item


def persist_item(table: Any, item: dict[str, Any]) -> str:
    """Persist item with conditional idempotency write."""
    try:
        table.put_item(
            Item=item,
            ConditionExpression=CONDITIONAL_WRITE_EXPRESSION,
        )
        return "success"
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ConditionalCheckFailedException":
            return "duplicate"
        raise RetryableProcessingError(
            f"DynamoDB put_item failed with error code '{error_code}'"
        ) from exc
    except Exception as exc:
        raise RetryableProcessingError("Unexpected persistence error") from exc


def process_record(
    record: dict[str, Any], *, table: Any, ttl_days: int
) -> tuple[str, str | None]:
    """Process a single SQS record and classify its outcome."""
    message_id_raw = record.get("messageId")
    message_id = str(message_id_raw) if message_id_raw is not None else None

    try:
        body = record.get("body")
        if not isinstance(body, str):
            raise NonRetryableMessageError("Record body must be a JSON string")

        event = parse_and_validate_event(body)
        item = map_event_to_dynamodb_item(event, ttl_days=ttl_days)
        outcome = persist_item(table, item)

        logger.info(
            "Processed messageId=%s eventId=%s outcome=%s",
            message_id,
            event.event_id,
            outcome,
        )
        return outcome, None
    except NonRetryableMessageError as exc:
        logger.warning("Non-retryable messageId=%s reason=%s", message_id, exc)
        return "non_retryable_invalid", None
    except RetryableProcessingError:
        logger.exception("Retryable processing error for messageId=%s", message_id)
        return "retryable_error", message_id
    except Exception:
        logger.exception(
            "Unexpected retryable processing error for messageId=%s", message_id
        )
        return "retryable_error", message_id


def _build_retry_failures(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    failures: list[dict[str, str]] = []
    for record in records:
        message_id = record.get("messageId")
        if message_id is None:
            continue
        failures.append({"itemIdentifier": str(message_id)})
    return failures


def lambda_handler(
    event: dict[str, Any], context: Any
) -> dict[str, list[dict[str, str]]]:
    """AWS Lambda handler for SQS partial batch failure processing."""
    del context
    configure_logging()

    records = event.get("Records", [])
    if not isinstance(records, list):
        logger.warning("Event 'Records' is not a list; treating as empty batch")
        records = []

    table_name = os.environ.get("DYNAMODB_TABLE_NAME", "").strip()
    ttl_days = resolve_idempotency_ttl_days()

    if not table_name:
        logger.error("DYNAMODB_TABLE_NAME is not set; all records are retryable")
        return {"batchItemFailures": _build_retry_failures(records)}

    table = boto3.resource("dynamodb").Table(table_name)

    counts = {
        "success": 0,
        "duplicate": 0,
        "non_retryable_invalid": 0,
        "retryable_error": 0,
    }
    retryable_failures: list[dict[str, str]] = []

    for record in records:
        outcome, retry_message_id = process_record(
            record,
            table=table,
            ttl_days=ttl_days,
        )
        counts[outcome] += 1
        if outcome == "retryable_error" and retry_message_id is not None:
            retryable_failures.append({"itemIdentifier": retry_message_id})

    logger.info(
        (
            "Batch completed total=%d success=%d duplicate=%d "
            "invalid_non_retryable=%d retryable_errors=%d"
        ),
        len(records),
        counts["success"],
        counts["duplicate"],
        counts["non_retryable_invalid"],
        counts["retryable_error"],
    )

    return {"batchItemFailures": retryable_failures}
