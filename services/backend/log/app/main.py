"""FastAPI application for audit logs and communications."""

# Test CI pipeline
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .auth import ForbiddenError, UnauthorizedError, require_bearer_user, require_roles
from .config import Settings
from .repository import LogRepository
from .schemas import (
    AmlAlert,
    Communication,
    CreateAmlAlertRequest,
    CreateCommunicationRequest,
    CreateLogRequest,
    ErrorResponse,
    HealthResponse,
    LogEntry,
    Pagination,
    UpdateCommunicationStatusRequest,
    UpdateAmlAlertReviewRequest,
    UpdateLogRequest,
)
from .service import LogService

LOGGER = logging.getLogger("log")


def _error_name_for_status(status_code: int) -> str:
    if status_code == status.HTTP_400_BAD_REQUEST:
        return "validation_error"
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return "unauthorized"
    if status_code == status.HTTP_403_FORBIDDEN:
        return "forbidden"
    if status_code == status.HTTP_404_NOT_FOUND:
        return "not_found"
    if status_code == status.HTTP_409_CONFLICT:
        return "conflict"
    if status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
        return "service_unavailable"
    if status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        return "internal_error"
    return "request_error"


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Invalid request"
    first = errors[0]
    location = [
        str(segment)
        for segment in first.get("loc", ())
        if segment not in {"body", "query", "path"}
    ]
    prefix = ".".join(location)
    detail = first.get("msg", "Invalid value")
    return f"{prefix}: {detail}" if prefix else str(detail)


def _default_service() -> LogService:
    """Build the default LogService with settings-backed repository."""
    settings = Settings()
    return LogService(LogRepository(settings))


def create_app(log_service: LogService | None = None) -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = Settings()
    service = log_service or _default_service()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Handle application startup and shutdown events."""
        # Startup: Run database migrations
        service.bootstrap()
        yield
        # Shutdown: Add cleanup logic here if needed in the future

    app = FastAPI(title="log", version="1.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.log_service = service

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        """Attach a request id to every response for traceability."""
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    def _error(
        request: Request, status_code: int, error: str, message: str
    ) -> JSONResponse:
        """Build a consistent error response payload."""
        body = ErrorResponse(
            error=error,
            message=message,
            requestId=getattr(request.state, "request_id", None),
        )
        return JSONResponse(
            status_code=status_code, content=body.model_dump(exclude_none=True)
        )

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, _exc: UnauthorizedError):
        return _error(
            request, status.HTTP_401_UNAUTHORIZED, "unauthorized", "Unauthorized"
        )

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, _exc: ForbiddenError):
        return _error(request, status.HTTP_403_FORBIDDEN, "forbidden", "Forbidden")

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error(
            request,
            status.HTTP_400_BAD_REQUEST,
            "validation_error",
            _validation_message(exc),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return _error(
            request,
            exc.status_code,
            _error_name_for_status(exc.status_code),
            detail,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        LOGGER.error("Unhandled exception: %s", exc, exc_info=True)
        return _error(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            "Internal error",
        )

    def get_log_service(request: Request) -> LogService:
        """Provide the configured LogService from application state."""
        return request.app.state.log_service

    def get_settings(request: Request) -> Settings:
        """Provide settings from application state."""
        return request.app.state.settings

    def get_user(
        request: Request,
        settings: Settings = Depends(get_settings),
    ):
        """Resolve the authenticated user from the bearer token."""
        return require_bearer_user(
            request.headers.get("Authorization"),
            settings.jwt_hmac_secret,
            auth_mode=settings.auth_mode,
            cognito_jwks_url=settings.cognito_jwks_url,
            cognito_issuer=settings.cognito_issuer,
            cognito_audience=settings.cognito_audience,
        )

    def decode_prefixed_id(prefix: str, value: str) -> int:
        """Validate an id prefix and return the raw numeric id."""
        if not value.startswith(prefix):
            raise ValueError("invalid id")
        try:
            return int(value.removeprefix(prefix))
        except ValueError as exc:
            raise ValueError("invalid id") from exc

    def encode_prefixed_id(prefix: str, value: int) -> str:
        """Attach an API prefix to a numeric id."""
        return f"{prefix}{value}"

    def to_aml_alert(row: dict) -> AmlAlert:
        """Convert AML alert persistence row to API response model."""
        return AmlAlert(
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

    def to_communication(row: dict) -> Communication:
        """Convert communication persistence row to API response model."""
        return Communication(
            communicationId=encode_prefixed_id("com_", int(row["id"])),
            clientId=row["client_id"],
            agentId=row["agent_id"],
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

    @app.get("/health", response_model=HealthResponse)
    def health(service: LogService = Depends(get_log_service)) -> HealthResponse:
        if not service.health():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database unavailable",
            )
        return HealthResponse(status="ok", service="log")

    @app.get("/api/v1/health")
    def health_v1() -> dict:
        return {"status": "ok"}

    @app.get("/api/v1/logs/health", response_model=HealthResponse)
    def logs_health(service: LogService = Depends(get_log_service)) -> HealthResponse:
        if not service.health():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database unavailable",
            )
        return HealthResponse(status="ok", service="log")

    @app.get("/api/logs")
    def list_logs(
        request: Request,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
        limit: int = 50,
        offset: int = 0,
        clientId: str | None = None,
        agentId: str | None = None,
        action: str | None = None,
        from_: datetime | None = Query(default=None, alias="from"),
        to: datetime | None = None,
    ):
        require_roles(user, {"admin", "agent"})
        effective_agent = agentId
        if user.role == "agent":
            effective_agent = user.user_id
        rows, total = service.list_logs(
            limit=min(max(limit, 1), 200),
            offset=max(offset, 0),
            client_id=clientId,
            agent_id=effective_agent,
            action=action,
            from_dt=from_,
            to_dt=to,
        )
        data = [
            LogEntry(
                logId=encode_prefixed_id("log_", int(r["id"])),
                action=r["action"],
                attributeName=r["attribute_name"],
                beforeValue=r["before_value"],
                afterValue=r["after_value"],
                agentId=r["agent_id"],
                clientId=r["client_id"],
                dateTime=r["date_time"],
                correlationId=r["correlation_id"],
            ).model_dump(exclude_none=True)
            for r in rows
        ]
        return {
            "data": data,
            "pagination": Pagination(
                limit=min(max(limit, 1), 200), offset=max(offset, 0), total=total
            ).model_dump(),
        }

    @app.post("/api/logs", status_code=status.HTTP_201_CREATED)
    def create_log(
        request: Request,
        body: CreateLogRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        if user.role == "agent" and body.agentId != user.user_id:
            raise ForbiddenError()
        try:
            log_id = service.create_log(body)
            row = service.get_log(log_id)
            if row is None:
                raise RuntimeError("missing log after insert")
            entry = LogEntry(
                logId=encode_prefixed_id("log_", int(row["id"])),
                action=row["action"],
                attributeName=row["attribute_name"],
                beforeValue=row["before_value"],
                afterValue=row["after_value"],
                agentId=row["agent_id"],
                clientId=row["client_id"],
                dateTime=row["date_time"],
                correlationId=row["correlation_id"],
            )
            return entry
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        except Exception:  # pragma: no cover
            LOGGER.exception("failed to create audit log")
            return _error(
                request,
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "internal_error",
                "Internal error",
            )

    @app.get("/api/logs/{logId}")
    def get_log(
        request: Request,
        logId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        try:
            db_id = decode_prefixed_id("log_", logId)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        row = service.get_log(db_id)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        if user.role == "agent" and row["agent_id"] != user.user_id:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return LogEntry(
            logId=encode_prefixed_id("log_", int(row["id"])),
            action=row["action"],
            attributeName=row["attribute_name"],
            beforeValue=row["before_value"],
            afterValue=row["after_value"],
            agentId=row["agent_id"],
            clientId=row["client_id"],
            dateTime=row["date_time"],
            correlationId=row["correlation_id"],
        )

    @app.put("/api/logs/{logId}")
    def update_log(
        request: Request,
        logId: str,
        body: UpdateLogRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin"})
        try:
            db_id = decode_prefixed_id("log_", logId)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        row = service.update_log(db_id, body)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return LogEntry(
            logId=encode_prefixed_id("log_", int(row["id"])),
            action=row["action"],
            attributeName=row["attribute_name"],
            beforeValue=row["before_value"],
            afterValue=row["after_value"],
            agentId=row["agent_id"],
            clientId=row["client_id"],
            dateTime=row["date_time"],
            correlationId=row["correlation_id"],
        )

    @app.delete("/api/logs/{logId}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_log(
        request: Request,
        logId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin"})
        try:
            db_id = decode_prefixed_id("log_", logId)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        if not service.delete_log(db_id):
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/clients/{clientId}/logs")
    def list_logs_for_client(
        request: Request,
        clientId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
        limit: int = 50,
        offset: int = 0,
    ):
        require_roles(user, {"admin", "agent"})
        effective_agent = None if user.role == "admin" else user.user_id
        rows, total = service.list_logs(
            limit=min(max(limit, 1), 200),
            offset=max(offset, 0),
            client_id=clientId,
            agent_id=effective_agent,
            action=None,
            from_dt=None,
            to_dt=None,
        )
        data = [
            LogEntry(
                logId=encode_prefixed_id("log_", int(r["id"])),
                action=r["action"],
                attributeName=r["attribute_name"],
                beforeValue=r["before_value"],
                afterValue=r["after_value"],
                agentId=r["agent_id"],
                clientId=r["client_id"],
                dateTime=r["date_time"],
                correlationId=r["correlation_id"],
            ).model_dump(exclude_none=True)
            for r in rows
        ]
        return {
            "data": data,
            "pagination": Pagination(
                limit=min(max(limit, 1), 200), offset=max(offset, 0), total=total
            ).model_dump(),
        }

    @app.post(
        "/api/aml/alerts",
        status_code=status.HTTP_201_CREATED,
        response_model=AmlAlert,
    )
    def create_aml_alert(
        request: Request,
        body: CreateAmlAlertRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        try:
            row = service.create_aml_alert(body)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        except Exception as exc:  # pragma: no cover
            if "duplicate key value" in str(exc):
                return _error(
                    request,
                    status.HTTP_409_CONFLICT,
                    "conflict",
                    "Alert already exists",
                )
            LOGGER.exception("failed to create aml alert")
            return _error(
                request,
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "internal_error",
                "Internal error",
            )
        return to_aml_alert(row)

    @app.get("/api/aml/alerts")
    def list_aml_alerts(
        request: Request,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
        limit: int = 50,
        offset: int = 0,
        clientId: str | None = None,
        alertType: str | None = None,
        reviewStatus: str | None = None,
    ):
        require_roles(user, {"admin", "agent"})
        rows, total = service.list_aml_alerts(
            limit=min(max(limit, 1), 200),
            offset=max(offset, 0),
            client_id=clientId,
            alert_type=alertType,
            review_status=reviewStatus,
        )
        return {
            "data": [to_aml_alert(row).model_dump(exclude_none=True) for row in rows],
            "pagination": Pagination(
                limit=min(max(limit, 1), 200), offset=max(offset, 0), total=total
            ).model_dump(),
        }

    @app.get("/api/aml/alerts/{alertId}", response_model=AmlAlert)
    def get_aml_alert(
        request: Request,
        alertId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        row = service.get_aml_alert(alertId)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return to_aml_alert(row)

    @app.put("/api/aml/alerts/{alertId}/review", response_model=AmlAlert)
    def review_aml_alert(
        request: Request,
        alertId: str,
        body: UpdateAmlAlertReviewRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        row = service.update_aml_alert_review(alertId, body.reviewStatus.value)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return to_aml_alert(row)

    @app.post("/api/communications", status_code=status.HTTP_202_ACCEPTED)
    def create_communication(
        request: Request,
        body: CreateCommunicationRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        if user.role == "agent" and body.agentId != user.user_id:
            raise ForbiddenError()
        communication_id = service.create_communication(body)
        row = service.get_communication(communication_id)
        if row is None:
            return _error(
                request,
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "internal_error",
                "Internal error",
            )
        return to_communication(row)

    @app.get("/api/communications/queued")
    def list_queued_communications(
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
        limit: int = 50,
    ):
        require_roles(user, {"admin"})
        rows = service.list_queued_communications(limit=min(max(limit, 1), 200))
        return {
            "data": [to_communication(r).model_dump(exclude_none=True) for r in rows],
            "pagination": Pagination(
                limit=min(max(limit, 1), 200), offset=0, total=len(rows)
            ).model_dump(),
        }

    @app.get("/api/communications/{communicationId}")
    def get_communication(
        request: Request,
        communicationId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin", "agent"})
        try:
            db_id = decode_prefixed_id("com_", communicationId)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        row = service.get_communication(db_id)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        if user.role == "agent" and row["agent_id"] != user.user_id:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return to_communication(row)

    @app.get("/api/clients/{clientId}/communications")
    def list_communications(
        request: Request,
        clientId: str,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
        limit: int = 50,
        offset: int = 0,
    ):
        require_roles(user, {"admin", "agent"})
        effective_agent = None if user.role == "admin" else user.user_id
        rows, total = service.list_communications(
            limit=min(max(limit, 1), 200),
            offset=max(offset, 0),
            client_id=clientId,
            agent_id=effective_agent,
        )
        data = [to_communication(r).model_dump(exclude_none=True) for r in rows]
        return {
            "data": data,
            "pagination": Pagination(
                limit=min(max(limit, 1), 200), offset=max(offset, 0), total=total
            ).model_dump(),
        }

    @app.patch("/api/communications/{communicationId}/status")
    def update_communication_status(
        request: Request,
        communicationId: str,
        body: UpdateCommunicationStatusRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin"})
        try:
            db_id = decode_prefixed_id("com_", communicationId)
        except ValueError as exc:
            return _error(
                request, status.HTTP_400_BAD_REQUEST, "validation_error", str(exc)
            )
        row = service.update_communication_status(db_id, body)
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return to_communication(row)

    @app.patch("/api/communications/provider/{providerMessageId}/status")
    def update_communication_status_by_provider_message_id(
        request: Request,
        providerMessageId: str,
        body: UpdateCommunicationStatusRequest,
        user=Depends(get_user),
        service: LogService = Depends(get_log_service),
    ):
        require_roles(user, {"admin"})
        row = service.update_communication_status_by_provider_message_id(
            providerMessageId, body
        )
        if row is None:
            return _error(request, status.HTTP_404_NOT_FOUND, "not_found", "Not found")
        return to_communication(row)

    return app


app = create_app()
