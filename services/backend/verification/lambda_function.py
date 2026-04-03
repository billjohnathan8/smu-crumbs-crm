"""
Verification Lambda — dual-purpose handler.

Responsibilities
----------------
1. UPLOAD_VERIFICATION_REQUESTED (from your Java createClient SNS publish)
   - Receives client info + clientId from SNS
   - Uses verification token supplied in SNS message
   - Builds a frontend verification link
   - Sends the verification email via SES

2. SES feedback events (delivery/bounce/complaint/reject)
   - Parses SES delivery feedback forwarded via SNS
   - Calls log-service API to update communication status

Environment variables:
    # Email sending (flow 1)
    SES_SOURCE_EMAIL                        Required for sending. Verified SES sender address.
    FRONTEND_BASE_URL                       Required for sending. e.g. https://app.example.com
    VERIFICATION_JWT_HMAC_SECRET            Optional. Secret for service JWT used in feedback API auth.
    VERIFICATION_JWT_HMAC_SECRET_ARN        Optional. Secrets Manager ARN fallback for service JWT secret.

    # Log service (flow 2)
    LOG_API_BASE_URL                        Required for feedback. Base URL for log API.
    VERIFICATION_LOG_AUTH_HEADER            Optional. Full Authorization header.
    VERIFICATION_LOG_BEARER_TOKEN           Optional. Bearer token fallback.
    JWT_HMAC_SECRET_ARN                     Optional fallback secret ARN.
    VERIFICATION_JWT_SUB                    Optional JWT subject (default: SYSTEM_VERIFICATION_FEEDBACK).
    VERIFICATION_JWT_ROLE                   Optional JWT role (default: service).
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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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

    secret_arn = (
        os.environ.get("VERIFICATION_JWT_HMAC_SECRET_ARN", "").strip()
        or os.environ.get("JWT_HMAC_SECRET_ARN", "").strip()
    )
    if not secret_arn:
        return None

    if boto3 is None:
        logger.error("boto3 is required to load JWT secret from Secrets Manager.")
        return None

    try:
        secret_value = boto3.client("secretsmanager").get_secret_value(
            SecretId=secret_arn
        )["SecretString"]
        if isinstance(secret_value, str) and secret_value.strip():
            _JWT_SECRET_CACHE = secret_value.strip()
    except Exception:
        logger.exception("Failed to load JWT secret from Secrets Manager")

    return _JWT_SECRET_CACHE


def _mint_service_jwt() -> str | None:
    """Mint a service-to-service JWT for calling the log API."""
    secret = _load_service_jwt_secret()
    if not secret:
        return None

    now_epoch = int(time.time())
    ttl_seconds = int(os.environ.get("VERIFICATION_JWT_TTL_SECONDS", "300"))
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": os.environ.get("VERIFICATION_JWT_SUB", "SYSTEM_VERIFICATION_FEEDBACK"),
        "role": os.environ.get("VERIFICATION_JWT_ROLE", "service"),
        "iat": now_epoch,
        "exp": now_epoch + ttl_seconds,
    }
    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}"
    signature = hmac.new(
        secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
    ).digest()
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


def _mask_email(value: str | None) -> str:
    if not value:
        return "[REDACTED]"
    if "@" not in value:
        return "[REDACTED]"
    first, domain = value.split("@", 1)
    if not first:
        return f"***@{domain}"
    return f"{first[0]}***@{domain}"


def _mask_identifier(value: str | None) -> str:
    if not value:
        return "[REDACTED]"
    if len(value) <= 4:
        return "****"
    return f"{value[:2]}***{value[-2:]}"


# ---------------------------------------------------------------------------
# Flow 1 — send verification email
# ---------------------------------------------------------------------------


def _build_verification_link(client_id: str, token: str) -> str:
    frontend_base = os.environ.get("FRONTEND_BASE_URL", "").rstrip("/")
    fragment = urllib.parse.urlencode({"token": token, "clientId": client_id})
    path = f"/verify-client#{fragment}"
    return f"{frontend_base}{path}" if frontend_base else path


def _send_verification_email(
    client_id: str,
    email: str,
    token: str,
    first_name: str,
    request_id: str,
    token_ttl_seconds: int,
) -> None:
    source_email = os.environ.get("SES_SOURCE_EMAIL", "").strip()
    if not source_email:
        raise ValueError("SES_SOURCE_EMAIL is required to send verification emails")

    if boto3 is None:
        raise RuntimeError("boto3 is required to send SES emails")

    link = _build_verification_link(client_id, token)
    display_name = first_name or "there"
    expiry_text = _format_ttl_for_humans(token_ttl_seconds)

    subject = "[ScroogeBank CRM] Please verify your identity"
    body_html = f"""
    <html><body>
      <p>Hi {display_name},</p>
      <p>Please upload your identity verification documents by clicking the link below:</p>
      <p><a href="{link}">Upload Documents</a></p>
      <p>This link expires in {expiry_text}.</p>
    </body></html>
    """
    body_text = (
        f"Hi {display_name},\n\n"
        f"Please upload your identity verification documents by visiting:\n{link}\n\n"
        f"This link expires in {expiry_text}."
    )

    boto3.client("ses").send_email(
        Source=source_email,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Text": {"Data": body_text, "Charset": "UTF-8"},
                "Html": {"Data": body_html, "Charset": "UTF-8"},
            },
        },
    )
    logger.info(
        "Sent verification email clientId=%s requestId=%s to=%s",
        _mask_identifier(client_id),
        request_id,
        _mask_email(email),
    )


def _alarm_forward_recipients() -> list[str]:
    raw = os.environ.get("ALARM_FORWARD_TO_EMAILS", "")
    recipients: list[str] = []
    for value in raw.split(","):
        email = value.strip()
        if email and email not in recipients:
            recipients.append(email)
    return recipients


def _is_cloudwatch_alarm_message(message: dict[str, Any]) -> bool:
    return (
        "AlarmName" in message
        and "NewStateValue" in message
        and "NewStateReason" in message
    )


def _handle_cloudwatch_alarm(message: dict[str, Any]) -> bool:
    recipients = _alarm_forward_recipients()
    if not recipients:
        logger.warning(
            "Skipping CloudWatch alarm forward because ALARM_FORWARD_TO_EMAILS is empty"
        )
        return False

    source_email = os.environ.get("SES_SOURCE_EMAIL", "").strip()
    if not source_email:
        logger.error("SES_SOURCE_EMAIL is required to forward CloudWatch alarms")
        return False
    if boto3 is None:
        logger.error("boto3 is required to forward CloudWatch alarms")
        return False

    alarm_name = str(message.get("AlarmName", "UnknownAlarm"))
    state = str(message.get("NewStateValue", "UNKNOWN"))
    reason = str(message.get("NewStateReason", "No reason provided"))
    region = str(message.get("Region", "unknown-region"))
    account = str(message.get("AWSAccountId", "unknown-account"))
    timestamp = str(message.get("StateChangeTime", "unknown-time"))

    subject = f"[ScroogeBank][Alarm:{state}] {alarm_name}"
    body_text = (
        "CloudWatch alarm notification\n\n"
        f"Alarm: {alarm_name}\n"
        f"State: {state}\n"
        f"Reason: {reason}\n"
        f"Region: {region}\n"
        f"Account: {account}\n"
        f"ChangedAt: {timestamp}\n"
    )

    boto3.client("ses").send_email(
        Source=source_email,
        Destination={"ToAddresses": recipients},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
        },
    )
    logger.info(
        "Forwarded CloudWatch alarm alarmName=%s state=%s recipients=%s",
        _mask_identifier(alarm_name),
        state,
        ",".join(_mask_email(r) for r in recipients),
    )
    return True


def _handle_verification_requested(message: dict[str, Any]) -> None:
    client_id = message.get("clientId", "").strip()
    email = message.get("email", "").strip()
    token = message.get("token", "").strip()
    first_name = message.get("firstName", "").strip()
    request_id = message.get("requestId", "").strip()
    token_ttl_seconds = _parse_positive_int(message.get("tokenTtlSeconds"), 7200)

    if not client_id or not email:
        logger.warning("VERIFICATION_REQUESTED missing clientId or email — skipping")
        return

    _send_verification_email(
        client_id, email, token, first_name, request_id, token_ttl_seconds
    )


def _parse_positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def _format_ttl_for_humans(ttl_seconds: int) -> str:
    if ttl_seconds % 3600 == 0:
        hours = ttl_seconds // 3600
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    if ttl_seconds % 60 == 0:
        minutes = ttl_seconds // 60
        return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"
    return f"{ttl_seconds} second" if ttl_seconds == 1 else f"{ttl_seconds} seconds"


# ---------------------------------------------------------------------------
# Flow 2 — SES feedback
# ---------------------------------------------------------------------------


def _extract_feedback(message: dict[str, Any]) -> tuple[str | None, str, str | None]:
    event_type = str(
        message.get("eventType") or message.get("notificationType") or "UNKNOWN"
    ).upper()
    mail = message.get("mail") or {}
    provider_message_id = mail.get("messageId")

    error_message = None
    if event_type == "BOUNCE":
        bounce = message.get("bounce") or {}
        error_message = (
            f"SES bounce: {bounce.get('bounceType')}/{bounce.get('bounceSubType')}"
        )
    elif event_type == "COMPLAINT":
        complaint = message.get("complaint") or {}
        error_message = (
            f"SES complaint: {complaint.get('complaintFeedbackType') or 'unknown'}"
        )
    elif event_type == "REJECT":
        reject = message.get("reject") or {}
        error_message = f"SES reject: {reject.get('reason') or 'unknown'}"

    return provider_message_id, event_type, error_message


def _status_for_event(event_type: str) -> str | None:
    if event_type in {"BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE"}:
        return "failed"
    if event_type in {"DELIVERY", "SEND"}:
        return "sent"
    return None


def _update_communication_feedback(
    log_api_base_url: str,
    provider_message_id: str,
    status: str,
    event_type: str,
    error_message: str | None,
) -> tuple[int, str]:
    encoded_id = urllib.parse.quote(provider_message_id, safe="")
    url = f"{log_api_base_url.rstrip('/')}/api/communications/provider/{encoded_id}/status"
    body = {
        "status": status,
        "deliveryEvent": event_type,
        "errorMessage": error_message,
    }
    payload = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    authorization = _resolve_authorization_header()
    if authorization:
        headers["Authorization"] = authorization
    req = urllib.request.Request(url=url, data=payload, headers=headers, method="PATCH")
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.getcode(), response.read().decode("utf-8", errors="replace")


def _handle_ses_feedback(
    message: dict[str, Any], log_api_base_url: str
) -> dict[str, Any] | bool | None:
    """Returns True on success, None when skipped (no messageId), or a failure dict."""
    provider_message_id, event_type, error_message = _extract_feedback(message)
    if not provider_message_id:
        return None  # nothing to update
    status = _status_for_event(event_type)
    if not status:
        logger.info(
            "Ignoring unsupported SES feedback eventType=%s providerMessageId=%s",
            event_type,
            _mask_identifier(provider_message_id),
        )
        return None

    try:
        status_code, _body = _update_communication_feedback(
            log_api_base_url, provider_message_id, status, event_type, error_message
        )
        logger.info(
            "Updated communication providerMessageId=%s eventType=%s status=%s",
            _mask_identifier(provider_message_id),
            event_type,
            status_code,
        )
        return True
    except urllib.error.HTTPError as exc:
        _ = exc.read()
        logger.warning(
            "Failed to update communication providerMessageId=%s status=%s",
            _mask_identifier(provider_message_id),
            exc.code,
        )
        return {"providerMessageId": provider_message_id, "statusCode": str(exc.code)}
    except Exception:
        logger.exception(
            "Failed to update communication providerMessageId=%s",
            _mask_identifier(provider_message_id),
        )
        return {"providerMessageId": provider_message_id, "statusCode": "unknown"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    log_api_base_url = os.environ.get("LOG_API_BASE_URL", "").strip()

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
            message = json.loads(raw_message)
        except Exception:
            logger.warning("Skipping non-JSON SNS message")
            skipped += 1
            continue

        event_type = str(message.get("eventType", "")).upper()

        # Flow 0: CloudWatch alarm notifications from SNS -> SES email forward.
        if _is_cloudwatch_alarm_message(message):
            try:
                if _handle_cloudwatch_alarm(message):
                    updated += 1
                else:
                    skipped += 1
            except Exception:
                logger.exception("Failed to forward CloudWatch alarm notification")
                failures.append({"alarm": str(message.get("AlarmName", "unknown"))})
            continue

        # ── Flow 1: verification email request ──────────────────────────────
        if event_type == "UPLOAD_VERIFICATION_REQUESTED":
            try:
                _handle_verification_requested(message)
                updated += 1
            except Exception:
                logger.exception(
                    "Failed to send verification email clientId=%s",
                    _mask_identifier(str(message.get("clientId", ""))),
                )
                failures.append(
                    {
                        "clientId": message.get("clientId", "unknown"),
                        "statusCode": "email_send_failed",
                    }
                )
            continue

        # ── Flow 2: SES delivery feedback ───────────────────────────────────
        if not log_api_base_url:
            logger.error("LOG_API_BASE_URL is required for SES feedback events")
            skipped += 1
            continue

        result = _handle_ses_feedback(message, log_api_base_url)
        if result is True:
            updated += 1
        elif result is None:
            skipped += 1
        else:
            failures.append(result)

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
