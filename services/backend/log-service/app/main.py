from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, HTTPException, Request, status

from .config import Settings
from .repository import LogRepository
from .schemas import HealthResponse, LogEventRequest, LogEventResponse
from .service import LogService

LOGGER = logging.getLogger("log-service")


def _default_service() -> LogService:
    settings = Settings()
    return LogService(LogRepository(settings))


def create_app(log_service: LogService | None = None) -> FastAPI:
    app = FastAPI(title="log-service", version="1.0.0")
    app.state.log_service = log_service or _default_service()

    @app.on_event("startup")
    def startup() -> None:
        app.state.log_service.bootstrap()

    def get_log_service(request: Request) -> LogService:
        return request.app.state.log_service

    @app.get("/health", response_model=HealthResponse)
    def health(service: LogService = Depends(get_log_service)) -> HealthResponse:
        if not service.health():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database unavailable",
            )
        return HealthResponse(status="ok")

    @app.get("/api/v1/logs/health", response_model=HealthResponse)
    def logs_health(service: LogService = Depends(get_log_service)) -> HealthResponse:
        if not service.health():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database unavailable",
            )
        return HealthResponse(status="ok")

    @app.post(
        "/api/v1/logs",
        response_model=LogEventResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_log(
        request: LogEventRequest, service: LogService = Depends(get_log_service)
    ) -> LogEventResponse:
        try:
            log_id = service.create_log_event(request)
            return LogEventResponse(id=log_id)
        except Exception as exc:  # pragma: no cover
            LOGGER.exception("failed to persist log event")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="failed to persist log event",
            ) from exc

    return app


app = create_app()
