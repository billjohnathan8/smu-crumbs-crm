"""
SES feedback consumer Lambda.

Flow:
1. Triggered by SNS notifications carrying SES delivery/bounce/complaint events.
2. Parses provider message id + event type from SNS payload.
3. Calls log-service API to update communication status by provider message id.

Environment variables:
    LOG_API_BASE_URL                        Required. Base URL for log API.
    VERIFICATION_LOG_AUTH_HEADER            Optional. Full Authorization header.
    VERIFICATION_LOG_BEARER_TOKEN           Optional. Bearer token fallback.
    VERIFICATION_JWT_HMAC_SECRET            Optional. Inline JWT HMAC secret for service JWT minting.
    VERIFICATION_JWT_HMAC_SECRET_ARN        Optional. Secrets Manager ARN for service JWT minting.
    JWT_HMAC_SECRET_ARN                     Optional fallback secret ARN.
    VERIFICATION_JWT_SUB                    Optional JWT subject (default: SYSTEM_VERIFICATION_FEEDBACK).
    VERIFICATION_JWT_ROLE                   Optional JWT role (default: admin).
    VERIFICATION_JWT_TTL_SECONDS            Optional token TTL seconds (default: 300).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

try:
    import boto3
except ImportError:  # pragma: no cover - exercised only in minimal local environments
    boto3 = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_JWT_SECRET_CACHE: str | None = None


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _load_service_jwt_secret() -> str | None:
    global _JWT_SECRET_CACHE
    if _JWT_SECRET_CACHE:
        return _JWT_SECRET_CACHE

    inline_secret = os.environ.get("VERIFICATION_JWT_HMAC_SECRET", "").strip()
    if inline_secret:
        _JWT_SECRET_CACHE = inline_secret
        return _JWT_SECRET_CACHE

    secret_arn = os.environ.get("VERIFICATION_JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        secret_arn = os.environ.get("JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        return None

    if boto3 is None:
        logger.error("boto3 is required to load JWT secret from Secrets Manager.")
        return None

    try:
        secret_value = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn)["SecretString"]
    except Exception:
        logger.exception("Failed to load JWT secret for verification feedback auth")
        return None

    if isinstance(secret_value, str) and secret_value.strip():
        _JWT_SECRET_CACHE = secret_value.strip()
    return _JWT_SECRET_CACHE


def _mint_service_jwt() -> str | None:
    secret = _load_service_jwt_secret()
    if not secret:
        return None

    now_epoch = int(time.time())
    ttl_seconds = int(os.environ.get("VERIFICATION_JWT_TTL_SECONDS", "300"))
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": os.environ.get("VERIFICATION_JWT_SUB", "SYSTEM_VERIFICATION_FEEDBACK"),
        "role": os.environ.get("VERIFICATION_JWT_ROLE", "admin"),
        "iat": now_epoch,
        "exp": now_epoch + ttl_seconds,
    }
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def _resolve_authorization_header() -> str | None:
    explicit = os.environ.get("VERIFICATION_LOG_AUTH_HEADER", "").strip()
    if explicit:
        return explicit
    token = os.environ.get("VERIFICATION_LOG_BEARER_TOKEN", "").strip()
    if token:
        return f"Bearer {token}"
    service_token = _mint_service_jwt()
    if service_token:
        return f"Bearer {service_token}"
    return None


def _extract_feedback(message: dict[str, Any]) -> tuple[str | None, str, str | None]:
    event_type = str(message.get("eventType", "UNKNOWN")).upper()
    mail = message.get("mail") or {}
    provider_message_id = mail.get("messageId")

    error_message = None
    if event_type == "BOUNCE":
        bounce = message.get("bounce") or {}
        bounce_type = bounce.get("bounceType")
        bounce_subtype = bounce.get("bounceSubType")
        error_message = f"SES bounce: {bounce_type}/{bounce_subtype}"
    elif event_type == "COMPLAINT":
        complaint = message.get("complaint") or {}
        feedback = complaint.get("complaintFeedbackType")
        error_message = f"SES complaint: {feedback or 'unknown'}"
    elif event_type == "REJECT":
        reject = message.get("reject") or {}
        error_message = f"SES reject: {reject.get('reason') or 'unknown'}"

    return provider_message_id, event_type, error_message


def _status_for_event(event_type: str) -> str:
    if event_type in {"BOUNCE", "COMPLAINT", "REJECT"}:
        return "failed"
    if event_type in {"DELIVERY", "SEND", "RENDERING_FAILURE"}:
        return "sent"
    return "queued"


def _update_communication_feedback(
    log_api_base_url: str,
    provider_message_id: str,
    event_type: str,
    error_message: str | None,
) -> tuple[int, str]:
    encoded_provider_message_id = urllib.parse.quote(provider_message_id, safe="")
    url = f"{log_api_base_url.rstrip('/')}/api/communications/provider/{encoded_provider_message_id}/status"
    body = {
        "status": _status_for_event(event_type),
        "deliveryEvent": event_type,
        "errorMessage": error_message,
    }
    payload = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    authorization = _resolve_authorization_header()
    if authorization:
        headers["Authorization"] = authorization
    request = urllib.request.Request(url=url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.getcode(), response.read().decode("utf-8", errors="replace")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    log_api_base_url = os.environ.get("LOG_API_BASE_URL", "").strip()
    if not log_api_base_url:
        raise ValueError("LOG_API_BASE_URL is required")

    updated = 0
    skipped = 0
    failures: list[dict[str, str]] = []

    for record in event.get("Records", []):
        sns = record.get("Sns", {})
        raw_message = sns.get("Message")
        if not raw_message:
            skipped += 1
            continue
        try:
            payload = json.loads(raw_message)
        except Exception:
            logger.warning("Skipping non-JSON SNS message.")
            skipped += 1
            continue

        provider_message_id, event_type, error_message = _extract_feedback(payload)
        if not provider_message_id:
            skipped += 1
            continue

        try:
            status_code, body = _update_communication_feedback(
                log_api_base_url,
                provider_message_id,
                event_type,
                error_message,
            )
            logger.info(
                "Updated communication from SES feedback providerMessageId=%s eventType=%s status=%s body=%s",
                provider_message_id,
                event_type,
                status_code,
                body,
            )
            updated += 1
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            logger.warning(
                "Failed to update communication providerMessageId=%s status=%s body=%s",
                provider_message_id,
                exc.code,
                response_body,
            )
            failures.append(
                {
                    "providerMessageId": provider_message_id,
                    "statusCode": str(exc.code),
                }
            )
        except Exception:
            logger.exception(
                "Failed to update communication providerMessageId=%s",
                provider_message_id,
            )
            failures.append(
                {
                    "providerMessageId": provider_message_id,
                    "statusCode": "unknown",
                }
            )

    return {
        "statusCode": 200 if not failures else 207,
        "body": json.dumps(
            {
                "updated": updated,
                "skipped": skipped,
                "failedUpdates": failures,
            }
        ),
    }
