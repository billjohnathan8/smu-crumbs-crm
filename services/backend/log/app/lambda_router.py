"""Direct AWS Lambda event router for log-service APIs."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlsplit

import psycopg

try:
    import boto3
except ImportError:
    boto3 = None  # type: ignore

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .auth import ForbiddenError, UnauthorizedError, require_bearer_user, require_roles
from .client_scope import ClientScopeAuthorizer
from .config import Settings
from .schemas import (
    AmlAlert,
    Communication,
    CommunicationStatus,
    CreateAmlAlertRequest,
    CreateCommunicationRequest,
    CreateLogRequest,
    ErrorResponse,
    HealthResponse,
    LogEntry,
    Pagination,
    UpdateAmlAlertReviewRequest,
    UpdateCommunicationStatusRequest,
    UpdateLogRequest,
)
from .service import LogService

LOGGER = logging.getLogger("log")

_LOG_ID_PATTERN = re.compile(r"^/api/logs/(?P<logId>[^/]+)$")
_CLIENT_LOGS_PATTERN = re.compile(r"^/api/clients/(?P<clientId>[^/]+)/logs$")
_AML_ALERT_PATTERN = re.compile(r"^/api/aml/alerts/(?P<alertId>[^/]+)$")
_AML_REVIEW_PATTERN = re.compile(r"^/api/aml/alerts/(?P<alertId>[^/]+)/review$")
_COMMUNICATION_PATTERN = re.compile(r"^/api/communications/(?P<communicationId>[^/]+)$")
_COMMUNICATION_STATUS_PATTERN = re.compile(
    r"^/api/communications/(?P<communicationId>[^/]+)/status$"
)
_PROVIDER_STATUS_PATTERN = re.compile(
    r"^/api/communications/provider/(?P<providerMessageId>[^/]+)/status$"
)
_PROVIDER_COMMUNICATION_PATTERN = re.compile(
    r"^/api/communications/provider/(?P<providerMessageId>[^/]+)$"
)
_CLIENT_COMMUNICATIONS_PATTERN = re.compile(
    r"^/api/clients/(?P<clientId>[^/]+)/communications$"
)
_PUBLIC_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

_JSON_CONTENT_TYPE = "application/json"
_REQUEST_ID_HEADER = "X-Request-Id"
_LOWER_REQUEST_ID_HEADER = "x-request-id"
_AUTH_HEADER = "authorization"
_DEFAULT_ROOT_ADMIN_USER_IDS = frozenset({"usr_1", "1"})


def _load_root_admin_user_ids() -> frozenset[str]:
    raw = os.getenv("ROOT_ADMIN_USER_IDS", "")
    if not raw.strip():
        return _DEFAULT_ROOT_ADMIN_USER_IDS

    parsed = {
        candidate.strip()
        for candidate in raw.split(",")
        if isinstance(candidate, str) and candidate.strip()
    }
    return frozenset(parsed or _DEFAULT_ROOT_ADMIN_USER_IDS)


_ROOT_ADMIN_USER_IDS = _load_root_admin_user_ids()


class _ListLogsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    offset: int = 0
    clientId: str | None = None
    userId: str | None = None
    action: str | None = None
    from_: datetime | None = Field(default=None, alias="from")
    to: datetime | None = None


class _ListClientLogsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    offset: int = 0


class _ListAmlAlertsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    offset: int = 0
    clientId: str | None = None
    alertType: str | None = None
    reviewStatus: str | None = None
    detectedDate: str | None = None  # ISO 8601 date (YYYY-MM-DD)


class _ListQueuedCommunicationsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    status: CommunicationStatus | None = CommunicationStatus.queued
    createdFrom: datetime | None = None
    createdTo: datetime | None = None
    recipient: str | None = None
    subject: str | None = None
    client: str | None = None
    sender: str | None = None


class _ListAllCommunicationsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    offset: int = 0
    status: CommunicationStatus | None = None
    createdFrom: datetime | None = None
    createdTo: datetime | None = None
    recipient: str | None = None
    subject: str | None = None
    client: str | None = None
    sender: str | None = None


class _ListCommunicationsQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int = 50
    offset: int = 0


@dataclass(frozen=True)
class NormalizedRequest:
    method: str
    path: str
    headers: dict[str, str]
    query: dict[str, str]
    body: Any
    request_id: str


@dataclass(frozen=True)
class RoutedResponse:
    status_code: int
    body: Any | None = None


class _HttpError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _error_name_for_status(status_code: int) -> str:
    if status_code == 400:
        return "validation_error"
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 404:
        return "not_found"
    if status_code == 409:
        return "conflict"
    if status_code == 502:
        return "bad_gateway"
    if status_code == 503:
        return "service_unavailable"
    if status_code >= 500:
        return "internal_error"
    return "request_error"


def _validation_message(exc: ValidationError) -> str:
    _ = exc
    return "Invalid request"


def _normalize_headers(raw_headers: dict[str, Any] | None) -> dict[str, str]:
    normalized: dict[str, str] = {}
    if not raw_headers:
        return normalized

    for key, value in raw_headers.items():
        if key is None or value is None:
            continue
        normalized[str(key).lower()] = str(value)
    return normalized


def _merge_multi_value_headers(
    headers: dict[str, str],
    multi_headers: dict[str, list[str]] | None,
) -> dict[str, str]:
    merged = dict(headers)
    if not multi_headers:
        return merged

    for key, values in multi_headers.items():
        if not values:
            continue
        merged[str(key).lower()] = str(values[-1])
    return merged


def _normalize_query(raw_query: dict[str, Any] | None) -> dict[str, str]:
    if not raw_query:
        return {}
    return {
        str(key): str(value) for key, value in raw_query.items() if value is not None
    }


def _normalize_multi_value_query(
    raw_query: dict[str, list[str]] | None,
) -> dict[str, str]:
    query: dict[str, str] = {}
    if not raw_query:
        return query

    for key, values in raw_query.items():
        if not values:
            continue
        query[str(key)] = str(values[-1])
    return query


def _query_from_raw_query_string(raw_query_string: str | None) -> dict[str, str]:
    if not raw_query_string:
        return {}

    parsed = parse_qs(raw_query_string, keep_blank_values=True)
    return {key: values[-1] for key, values in parsed.items() if values}


def _normalize_path(raw_path: str, stage: str | None = None) -> str:
    path = urlsplit(raw_path).path or "/"
    if not path.startswith("/"):
        path = f"/{path}"

    if stage:
        stage_prefix = f"/{stage}"
        if path == stage_prefix:
            path = "/"
        elif path.startswith(f"{stage_prefix}/"):
            path = path[len(stage_prefix) :]

    if path.startswith("/_user_request_"):
        path = path[len("/_user_request_") :]
        if not path.startswith("/"):
            path = f"/{path}"

    if not path:
        return "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return path or "/"


def _parse_json_body(event: dict[str, Any]) -> Any:
    body = event.get("body")
    if body in (None, ""):
        return None
    if isinstance(body, (dict, list)):
        return body
    if not isinstance(body, str):
        raise ValueError("Invalid JSON body")

    if event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body).decode("utf-8")
        except Exception as exc:
            raise ValueError("Invalid request body encoding") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc


def normalize_event(event: dict[str, Any]) -> NormalizedRequest:
    request_context = event.get("requestContext") or {}

    if str(event.get("version")) == "2.0" and isinstance(
        request_context.get("http"), dict
    ):
        http_context = request_context["http"]
        method = str(http_context.get("method") or "GET").upper()
        raw_path = str(event.get("rawPath") or http_context.get("path") or "/")
        headers = _normalize_headers(event.get("headers"))
        query = _query_from_raw_query_string(event.get("rawQueryString"))
        if not query:
            query = _normalize_query(event.get("queryStringParameters"))
        body = _parse_json_body(event)
        request_id = headers.get(_LOWER_REQUEST_ID_HEADER) or str(uuid.uuid4())
        return NormalizedRequest(
            method=method,
            path=_normalize_path(raw_path),
            headers=headers,
            query=query,
            body=body,
            request_id=request_id,
        )

    method = str(event.get("httpMethod") or "GET").upper()
    stage = request_context.get("stage")
    raw_path = str(event.get("path") or request_context.get("path") or "/")
    headers = _normalize_headers(event.get("headers"))
    headers = _merge_multi_value_headers(headers, event.get("multiValueHeaders"))
    query = _normalize_multi_value_query(event.get("multiValueQueryStringParameters"))
    if not query:
        query = _normalize_query(event.get("queryStringParameters"))
    body = _parse_json_body(event)
    request_id = headers.get(_LOWER_REQUEST_ID_HEADER) or str(uuid.uuid4())
    return NormalizedRequest(
        method=method,
        path=_normalize_path(raw_path, stage=stage),
        headers=headers,
        query=query,
        body=body,
        request_id=request_id,
    )


def _finalize_response(request_id: str, routed: RoutedResponse) -> dict[str, Any]:
    headers = {_REQUEST_ID_HEADER: request_id}

    if routed.status_code == 204:
        return {
            "statusCode": routed.status_code,
            "headers": headers,
            "body": "",
            "isBase64Encoded": False,
        }

    headers["Content-Type"] = _JSON_CONTENT_TYPE
    return {
        "statusCode": routed.status_code,
        "headers": headers,
        "body": json.dumps(routed.body, default=str),
        "isBase64Encoded": False,
    }


def _error_response(
    request_id: str,
    status_code: int,
    error: str,
    message: str,
) -> dict[str, Any]:
    body = ErrorResponse(error=error, message=message, requestId=request_id)
    return _finalize_response(
        request_id,
        RoutedResponse(
            status_code=status_code,
            body=body.model_dump(mode="json", exclude_none=True),
        ),
    )


class LambdaRouter:
    """Direct event router for the log service Lambda runtime."""

    def __init__(
        self,
        service: LogService,
        settings: Settings,
        client_scope_authorizer: ClientScopeAuthorizer | None = None,
    ):
        self._service = service
        self._settings = settings
        self._client_scope_authorizer = (
            client_scope_authorizer
            if client_scope_authorizer is not None
            else ClientScopeAuthorizer(settings.client_service_url)
        )

    def handle(self, event: dict[str, Any]) -> dict[str, Any]:
        try:
            request = normalize_event(event)
        except ValueError as exc:
            request_headers = _normalize_headers(event.get("headers"))
            request_id = request_headers.get(_LOWER_REQUEST_ID_HEADER) or str(
                uuid.uuid4()
            )
            LOGGER.warning("Failed to normalize event: %s", exc)
            return _error_response(
                request_id,
                400,
                "validation_error",
                str(exc),
            )

        LOGGER.info(
            "Request: %s %s | request_id=%s",
            request.method,
            request.path,
            request.request_id,
        )
        try:
            routed = self._route(request)
            LOGGER.info("Response: %s | status=%s", request.path, routed.status_code)
            return _finalize_response(request.request_id, routed)
        except UnauthorizedError:
            return _error_response(
                request.request_id,
                401,
                "unauthorized",
                "Unauthorized",
            )
        except ForbiddenError:
            return _error_response(
                request.request_id,
                403,
                "forbidden",
                "Forbidden",
            )
        except ValidationError as exc:
            return _error_response(
                request.request_id,
                400,
                "validation_error",
                _validation_message(exc),
            )
        except ValueError:
            return _error_response(
                request.request_id,
                400,
                "validation_error",
                "Invalid request",
            )
        except _HttpError as exc:
            return _error_response(
                request.request_id,
                exc.status_code,
                _error_name_for_status(exc.status_code),
                exc.detail,
            )
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            LOGGER.exception(
                "Database connectivity failure: %s | request=%s %s",
                exc,
                request.method,
                request.path,
            )
            return _error_response(
                request.request_id,
                503,
                "service_unavailable",
                "database unavailable",
            )
        except Exception as exc:  # pragma: no cover - safety net
            LOGGER.exception(
                "Unhandled exception: %s | request=%s %s | headers=%s",
                exc,
                request.method,
                request.path,
                request.headers,
            )
            return _error_response(
                request.request_id,
                500,
                "internal_error",
                "Internal error",
            )

    def _route(self, request: NormalizedRequest) -> RoutedResponse:
        method = request.method
        path = request.path

        if method == "GET" and path == "/health":
            return self._health()
        if method == "GET" and path == "/api/v1/health":
            return RoutedResponse(200, {"status": "ok"})
        if method == "GET" and path == "/api/v1/logs/health":
            return self._health()

        if method == "GET" and path == "/api/logs":
            return self._list_logs(request)
        if method == "POST" and path == "/api/logs":
            return self._create_log(request)

        log_match = _LOG_ID_PATTERN.fullmatch(path)
        if log_match:
            log_id = log_match.group("logId")
            if method == "GET":
                return self._get_log(request, log_id)
            if method == "PUT":
                return self._update_log(request, log_id)
            if method == "DELETE":
                return self._delete_log(request, log_id)

        client_logs_match = _CLIENT_LOGS_PATTERN.fullmatch(path)
        if method == "GET" and client_logs_match:
            return self._list_logs_for_client(
                request, client_logs_match.group("clientId")
            )

        if method == "POST" and path == "/api/aml/alerts":
            return self._create_aml_alert(request)
        if method == "GET" and path == "/api/aml/alerts":
            return self._list_aml_alerts(request)
        if method == "POST" and path == "/api/aml/trigger":
            return self._trigger_aml_scan(request)

        aml_review_match = _AML_REVIEW_PATTERN.fullmatch(path)
        if method == "PUT" and aml_review_match:
            return self._review_aml_alert(request, aml_review_match.group("alertId"))

        aml_alert_match = _AML_ALERT_PATTERN.fullmatch(path)
        if method == "GET" and aml_alert_match:
            return self._get_aml_alert(request, aml_alert_match.group("alertId"))

        if method == "POST" and path == "/api/communications":
            return self._create_communication(request)
        if method == "GET" and path == "/api/communications":
            return self._list_communications(request)
        if method == "GET" and path == "/api/communications/queued":
            return self._list_queued_communications(request)

        provider_match = _PROVIDER_STATUS_PATTERN.fullmatch(path)
        if method == "PATCH" and provider_match:
            return self._update_communication_status_by_provider_message_id(
                request,
                provider_match.group("providerMessageId"),
            )
        provider_lookup_match = _PROVIDER_COMMUNICATION_PATTERN.fullmatch(path)
        if method == "GET" and provider_lookup_match:
            return self._get_communication_by_provider_message_id(
                request,
                provider_lookup_match.group("providerMessageId"),
            )

        communication_status_match = _COMMUNICATION_STATUS_PATTERN.fullmatch(path)
        if method == "PATCH" and communication_status_match:
            return self._update_communication_status(
                request,
                communication_status_match.group("communicationId"),
            )

        communication_match = _COMMUNICATION_PATTERN.fullmatch(path)
        if method == "GET" and communication_match:
            return self._get_communication(
                request,
                communication_match.group("communicationId"),
            )

        client_communications_match = _CLIENT_COMMUNICATIONS_PATTERN.fullmatch(path)
        if method == "GET" and client_communications_match:
            return self._list_communications_for_client(
                request,
                client_communications_match.group("clientId"),
            )

        raise _HttpError(404, "Not found")

    def _health(self) -> RoutedResponse:
        if not self._service.health():
            raise _HttpError(503, "database unavailable")

        payload = HealthResponse(status="ok", service="log")
        return RoutedResponse(200, payload.model_dump(mode="json", exclude_none=True))

    def _require_user(self, request: NormalizedRequest):
        return require_bearer_user(
            request.headers.get(_AUTH_HEADER),
            self._settings.jwt_hmac_secret,
            auth_mode=self._settings.auth_mode,
            cognito_jwks_url=self._settings.cognito_jwks_url,
            cognito_issuer=self._settings.cognito_issuer,
            cognito_audience=self._settings.cognito_audience,
        )

    def _can_user_access_client(
        self,
        request: NormalizedRequest,
        client_id: str,
    ) -> bool:
        try:
            return self._client_scope_authorizer.can_access_client(
                request.headers.get(_AUTH_HEADER),
                client_id,
            )
        except UnauthorizedError:
            raise
        except RuntimeError as exc:
            raise _HttpError(503, "Client scope validation unavailable") from exc

    def _list_user_accessible_client_ids(
        self,
        request: NormalizedRequest,
    ) -> set[str]:
        try:
            return self._client_scope_authorizer.list_accessible_client_ids(
                request.headers.get(_AUTH_HEADER)
            )
        except UnauthorizedError:
            raise
        except RuntimeError as exc:
            raise _HttpError(503, "Client scope validation unavailable") from exc

    @staticmethod
    def _decode_prefixed_id(prefix: str, value: str) -> int:
        if not value.startswith(prefix):
            raise ValueError("invalid id")
        try:
            return int(value.removeprefix(prefix))
        except ValueError as exc:
            raise ValueError("invalid id") from exc

    @staticmethod
    def _encode_prefixed_id(prefix: str, value: int) -> str:
        return f"{prefix}{value}"

    @staticmethod
    def _require_public_id(value: str, field_name: str) -> None:
        if not _PUBLIC_ID_PATTERN.fullmatch(value):
            raise ValueError(f"invalid {field_name}")

    def _to_log_entry(self, row: dict[str, Any]) -> dict[str, Any]:
        payload = LogEntry(
            logId=self._encode_prefixed_id("log_", int(row["id"])),
            action=row["action"],
            attributeName=row["attribute_name"],
            beforeValue=row["before_value"],
            afterValue=row["after_value"],
            userId=row["user_id"],
            clientId=row["client_id"],
            dateTime=row["date_time"],
            correlationId=row["correlation_id"],
        )
        return payload.model_dump(mode="json", exclude_none=True)

    def _to_aml_alert(self, row: dict[str, Any]) -> dict[str, Any]:
        payload = AmlAlert(
            alertId=row["alert_id"],
            clientId=row["client_id"],
            transactionId=row["transaction_id"],
            alertType=row["alert_type"],
            description=row["description"],
            detectedAt=row["detected_at"],
            reviewStatus=row["review_status"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )
        return payload.model_dump(mode="json", exclude_none=True)

    def _to_communication(self, row: dict[str, Any]) -> dict[str, Any]:
        payload = Communication(
            communicationId=self._encode_prefixed_id("com_", int(row["id"])),
            clientId=row["client_id"],
            userId=row["user_id"],
            channel=row["channel"],
            toEmail=row["to_email"],
            subject=row["subject"],
            body=row["body"],
            status=row["status"],
            providerMessageId=row["provider_message_id"],
            errorMessage=row["error_message"],
            idempotencyKey=row.get("idempotency_key"),
            retryCount=row.get("retry_count", 0),
            nextAttemptAt=row.get("next_attempt_at"),
            lastAttemptAt=row.get("last_attempt_at"),
            deliveryEvent=row.get("delivery_event"),
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )
        return payload.model_dump(mode="json", exclude_none=True)

    @staticmethod
    def _parse_query(model: type[BaseModel], request: NormalizedRequest) -> BaseModel:
        return model.model_validate(request.query)

    @staticmethod
    def _parse_body(model: type[BaseModel], request: NormalizedRequest) -> BaseModel:
        payload = request.body
        if payload is None:
            payload = {}
        return model.model_validate(payload)

    @staticmethod
    def _clamp_limit_offset(limit: int, offset: int) -> tuple[int, int]:
        return min(max(limit, 1), 200), max(offset, 0)

    def _list_logs(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        query = self._parse_query(_ListLogsQuery, request)
        limit, offset = self._clamp_limit_offset(query.limit, query.offset)
        effective_user = query.userId
        if user.role == "user":
            effective_user = user.user_id

        rows, total = self._service.list_logs(
            limit=limit,
            offset=offset,
            client_id=query.clientId,
            user_id=effective_user,
            action=query.action,
            from_dt=query.from_,
            to_dt=query.to,
        )
        payload = {
            "data": [self._to_log_entry(row) for row in rows],
            "pagination": Pagination(
                limit=limit, offset=offset, total=total
            ).model_dump(mode="json"),
        }
        return RoutedResponse(200, payload)

    def _create_log(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "user", "service"})

        body = self._parse_body(CreateLogRequest, request)
        if user.role == "user" and body.userId != user.user_id:
            raise ForbiddenError()

        try:
            log_id = self._service.create_log(body)
            row = self._service.get_log(log_id)
            if row is None:
                raise RuntimeError("missing log after insert")
            return RoutedResponse(201, self._to_log_entry(row))
        except ValueError as exc:
            raise _HttpError(400, str(exc)) from exc
        except Exception:
            LOGGER.exception("failed to create audit log")
            raise _HttpError(500, "Internal error")

    def _get_log(self, request: NormalizedRequest, log_id: str) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        db_id = self._decode_prefixed_id("log_", log_id)
        row = self._service.get_log(db_id)
        if row is None:
            raise _HttpError(404, "Not found")
        if user.role == "user" and row["user_id"] != user.user_id:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_log_entry(row))

    def _update_log(self, request: NormalizedRequest, log_id: str) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin"})

        db_id = self._decode_prefixed_id("log_", log_id)
        body = self._parse_body(UpdateLogRequest, request)
        row = self._service.update_log(db_id, body)
        if row is None:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_log_entry(row))

    def _delete_log(self, request: NormalizedRequest, log_id: str) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin"})

        db_id = self._decode_prefixed_id("log_", log_id)
        if not self._service.delete_log(db_id):
            raise _HttpError(404, "Not found")
        return RoutedResponse(204)

    def _list_logs_for_client(
        self,
        request: NormalizedRequest,
        client_id: str,
    ) -> RoutedResponse:
        self._require_public_id(client_id, "clientId")
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        query = self._parse_query(_ListClientLogsQuery, request)
        limit, offset = self._clamp_limit_offset(query.limit, query.offset)
        effective_user = None if user.role == "admin" else user.user_id

        rows, total = self._service.list_logs(
            limit=limit,
            offset=offset,
            client_id=client_id,
            user_id=effective_user,
            action=None,
            from_dt=None,
            to_dt=None,
        )
        payload = {
            "data": [self._to_log_entry(row) for row in rows],
            "pagination": Pagination(
                limit=limit, offset=offset, total=total
            ).model_dump(mode="json"),
        }
        return RoutedResponse(200, payload)

    def _create_aml_alert(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "service"})

        body = self._parse_body(CreateAmlAlertRequest, request)

        try:
            row = self._service.create_aml_alert(body)
        except ValueError as exc:
            raise _HttpError(400, str(exc)) from exc
        except Exception as exc:
            if "duplicate key value" in str(exc):
                raise _HttpError(409, "Alert already exists") from exc
            LOGGER.exception("failed to create aml alert")
            raise _HttpError(500, "Internal error") from exc

        return RoutedResponse(201, self._to_aml_alert(row))

    def _list_aml_alerts(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        if not self._is_root_admin(user) and user.role != "user":
            raise ForbiddenError()

        query = self._parse_query(_ListAmlAlertsQuery, request)
        limit, offset = self._clamp_limit_offset(query.limit, query.offset)
        client_id_filter = query.clientId
        client_ids_filter: list[str] | None = None

        # Parse detected date filter
        detected_from = None
        detected_to = None
        if query.detectedDate:
            try:
                from datetime import timedelta, timezone

                # Parse date string (YYYY-MM-DD)
                date_obj = datetime.fromisoformat(query.detectedDate)
                # Set to start of day (00:00:00)
                detected_from = date_obj.replace(
                    hour=0,
                    minute=0,
                    second=0,
                    microsecond=0,
                    tzinfo=timezone.utc,
                )
                # Set to end of day (23:59:59.999999)
                detected_to = detected_from + timedelta(days=1)
            except (ValueError, TypeError):
                raise _HttpError(400, "Invalid date format. Use YYYY-MM-DD")

        if user.role == "user":
            if client_id_filter:
                if not self._can_user_access_client(request, client_id_filter):
                    payload = {
                        "data": [],
                        "pagination": Pagination(
                            limit=limit,
                            offset=offset,
                            total=0,
                        ).model_dump(mode="json"),
                    }
                    return RoutedResponse(200, payload)
            else:
                accessible_client_ids = self._list_user_accessible_client_ids(request)
                if not accessible_client_ids:
                    payload = {
                        "data": [],
                        "pagination": Pagination(
                            limit=limit,
                            offset=offset,
                            total=0,
                        ).model_dump(mode="json"),
                    }
                    return RoutedResponse(200, payload)
                client_ids_filter = sorted(accessible_client_ids)

        rows, total = self._service.list_aml_alerts(
            limit=limit,
            offset=offset,
            client_id=client_id_filter,
            client_ids=client_ids_filter,
            alert_type=query.alertType,
            review_status=query.reviewStatus,
            detected_from=detected_from,
            detected_to=detected_to,
        )

        payload = {
            "data": [self._to_aml_alert(row) for row in rows],
            "pagination": Pagination(
                limit=limit, offset=offset, total=total
            ).model_dump(mode="json"),
        }
        return RoutedResponse(200, payload)

    def _get_aml_alert(
        self, request: NormalizedRequest, alert_id: str
    ) -> RoutedResponse:
        user = self._require_user(request)
        if not self._is_root_admin(user) and user.role != "user":
            raise ForbiddenError()

        row = self._service.get_aml_alert(alert_id)
        if row is None:
            raise _HttpError(404, "Not found")
        if user.role == "user" and not self._can_user_access_client(
            request, row["client_id"]
        ):
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_aml_alert(row))

    def _review_aml_alert(
        self,
        request: NormalizedRequest,
        alert_id: str,
    ) -> RoutedResponse:
        user = self._require_user(request)
        if not self._is_root_admin(user) and user.role != "user":
            raise ForbiddenError()

        existing = self._service.get_aml_alert(alert_id)
        if existing is None:
            raise _HttpError(404, "Not found")
        if user.role == "user" and not self._can_user_access_client(
            request, existing["client_id"]
        ):
            raise _HttpError(404, "Not found")

        body = self._parse_body(UpdateAmlAlertReviewRequest, request)
        row = self._service.update_aml_alert_review(alert_id, body.reviewStatus.value)
        if row is None:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_aml_alert(row))

    def _trigger_aml_scan(self, request: NormalizedRequest) -> RoutedResponse:
        """Manually trigger AML scan (agent or root admin only)."""
        user = self._require_user(request)
        if not self._is_root_admin(user) and user.role != "user":
            raise ForbiddenError()

        if boto3 is None:
            LOGGER.error("boto3 import failed")
            raise _HttpError(503, "Lambda invocation unavailable")

        aml_function_name = self._get_aml_function_name()
        if not aml_function_name:
            raise _HttpError(503, "AML function not configured")

        payload = {
            "trigger": "manual",
            "triggered_by": user.user_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        try:
            lambda_client = boto3.client("lambda")
            response = lambda_client.invoke(
                FunctionName=aml_function_name,
                InvocationType="Event",  # Async invocation
                Payload=json.dumps(payload).encode("utf-8"),
            )
            status_code = response.get("StatusCode", 0)
            if status_code not in {200, 202}:
                LOGGER.error("AML Lambda invocation failed with status %d", status_code)
                raise _HttpError(502, "AML trigger failed")

            return RoutedResponse(
                202,
                {
                    "status": "triggered",
                    "message": "AML scan has been queued",
                    "triggeredBy": user.user_id,
                },
            )
        except Exception as exc:
            if isinstance(exc, _HttpError):
                raise
            LOGGER.exception("Failed to trigger AML scan")
            raise _HttpError(500, "Failed to trigger AML scan") from exc

    def _get_aml_function_name(self) -> str:
        """Get AML Lambda function name from environment."""
        name_prefix = os.getenv("NAME_PREFIX", "")
        if name_prefix:
            return f"{name_prefix}-aml"
        function_name = os.getenv("AML_LAMBDA_FUNCTION_NAME", "")
        if function_name:
            return function_name
        LOGGER.warning("AML function name not configured")
        return ""

    @staticmethod
    def _is_root_admin(user) -> bool:
        return user.user_id in _ROOT_ADMIN_USER_IDS

    def _create_communication(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        body = self._parse_body(CreateCommunicationRequest, request)
        effective_user_id = body.userId or user.user_id
        if user.role == "user" and effective_user_id != user.user_id:
            raise ForbiddenError()

        # OWNERSHIP/D2: Enforce client ownership for non-admin users
        if user.role != "admin" and not self._can_user_access_client(
            request, body.clientId
        ):
            raise ForbiddenError()

        communication_id = self._service.create_communication(
            body.model_copy(update={"userId": effective_user_id})
        )
        row = self._service.get_communication(communication_id)
        if row is None:
            raise _HttpError(500, "Internal error")
        encoded_communication_id = self._encode_prefixed_id("com_", communication_id)
        try:
            self._service.create_log(
                CreateLogRequest(
                    action="CREATE",
                    attributeName="Communication",
                    beforeValue=None,
                    afterValue=encoded_communication_id,
                    userId=effective_user_id,
                    clientId=body.clientId,
                    correlationId=request.request_id,
                )
            )
        except Exception:
            LOGGER.warning(
                "communication created but audit log write failed | communication_id=%s",
                encoded_communication_id,
                exc_info=True,
            )
        return RoutedResponse(202, self._to_communication(row))

    def _list_queued_communications(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "service"})

        query = self._parse_query(_ListQueuedCommunicationsQuery, request)
        limit = min(max(query.limit, 1), 200)

        rows = self._service.list_queued_communications(
            limit=limit,
            status=query.status.value if query.status else None,
            created_from=query.createdFrom,
            created_to=query.createdTo,
            recipient=query.recipient,
            subject=query.subject,
            client_id=query.client,
            user_id=query.sender,
        )
        payload = {
            "data": [self._to_communication(row) for row in rows],
            "pagination": Pagination(limit=limit, offset=0, total=len(rows)).model_dump(
                mode="json"
            ),
        }
        return RoutedResponse(200, payload)

    def _list_communications(self, request: NormalizedRequest) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin"})

        query = self._parse_query(_ListAllCommunicationsQuery, request)
        limit, offset = self._clamp_limit_offset(query.limit, query.offset)

        rows, total = self._service.list_all_communications(
            limit=limit,
            offset=offset,
            status=query.status.value if query.status else None,
            created_from=query.createdFrom,
            created_to=query.createdTo,
            recipient=query.recipient,
            subject=query.subject,
            client_id=query.client,
            user_id=query.sender,
        )
        payload = {
            "data": [self._to_communication(row) for row in rows],
            "pagination": Pagination(
                limit=limit, offset=offset, total=total
            ).model_dump(mode="json"),
        }
        return RoutedResponse(200, payload)

    def _get_communication(
        self,
        request: NormalizedRequest,
        communication_id: str,
    ) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        db_id = self._decode_prefixed_id("com_", communication_id)
        row = self._service.get_communication(db_id)
        if row is None:
            raise _HttpError(404, "Not found")
        if user.role == "user" and row["user_id"] != user.user_id:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_communication(row))

    def _list_communications_for_client(
        self,
        request: NormalizedRequest,
        client_id: str,
    ) -> RoutedResponse:
        self._require_public_id(client_id, "clientId")
        user = self._require_user(request)
        require_roles(user, {"admin", "user"})

        query = self._parse_query(_ListCommunicationsQuery, request)
        limit, offset = self._clamp_limit_offset(query.limit, query.offset)
        effective_user = None if user.role == "admin" else user.user_id

        rows, total = self._service.list_communications(
            limit=limit,
            offset=offset,
            client_id=client_id,
            user_id=effective_user,
        )
        payload = {
            "data": [self._to_communication(row) for row in rows],
            "pagination": Pagination(
                limit=limit, offset=offset, total=total
            ).model_dump(mode="json"),
        }
        return RoutedResponse(200, payload)

    def _update_communication_status(
        self,
        request: NormalizedRequest,
        communication_id: str,
    ) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"service"})

        db_id = self._decode_prefixed_id("com_", communication_id)
        body = self._parse_body(UpdateCommunicationStatusRequest, request)
        row = self._service.update_communication_status(db_id, body)
        if row is None:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_communication(row))

    def _update_communication_status_by_provider_message_id(
        self,
        request: NormalizedRequest,
        provider_message_id: str,
    ) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"service"})

        body = self._parse_body(UpdateCommunicationStatusRequest, request)
        row = self._service.update_communication_status_by_provider_message_id(
            provider_message_id,
            body,
        )
        if row is None:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_communication(row))

    def _get_communication_by_provider_message_id(
        self,
        request: NormalizedRequest,
        provider_message_id: str,
    ) -> RoutedResponse:
        user = self._require_user(request)
        require_roles(user, {"admin", "service"})

        row = self._service.get_communication_by_provider_message_id(
            provider_message_id
        )
        if row is None:
            raise _HttpError(404, "Not found")
        return RoutedResponse(200, self._to_communication(row))
