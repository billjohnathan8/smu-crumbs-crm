"""PostgreSQL integration coverage for the log repository."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.config import Settings
from app.repository import LogRepository

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION_TESTS") != "true",
    reason="Set RUN_DB_INTEGRATION_TESTS=true to run DB integration tests.",
)


def test_postgres_repository_round_trip() -> None:
    repo = LogRepository(Settings())

    assert repo.ping() is True
    repo.run_migrations()

    correlation_id = f"ci-{uuid4()}"
    created_id = repo.insert_audit_log(
        {
            "action": "CREATE",
            "attributeName": "status",
            "beforeValue": None,
            "afterValue": "approved",
            "userId": "usr_ci",
            "clientId": "clt_ci",
            "dateTime": datetime.now(timezone.utc),
            "correlationId": correlation_id,
        }
    )

    row = repo.get_audit_log(created_id)
    assert row is not None
    assert row["id"] == created_id
    assert row["user_id"] == "usr_ci"
    assert row["correlation_id"] == correlation_id
