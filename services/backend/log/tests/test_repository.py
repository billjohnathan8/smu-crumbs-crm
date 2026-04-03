"""Repository tests covering query generation and persistence behavior."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone

import psycopg
import pytest

from app.config import Settings
from app.repository import LogRepository


class FakeCursor:
    def __init__(self, fetchone_values=None, fetchall_values=None) -> None:
        self.fetchone_values = list(fetchone_values or [])
        self.fetchall_values = list(fetchall_values or [])
        self.executed: list[tuple[str, object]] = []
        self.rowcount = 1

    def execute(self, sql: str, params=None) -> None:
        self.executed.append((sql, params))

    def fetchone(self):
        if self.fetchone_values:
            return self.fetchone_values.pop(0)
        return None

    def fetchall(self):
        return self.fetchall_values

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def commit(self) -> None:
        return None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def _patch_connect(
    monkeypatch: pytest.MonkeyPatch, factory: Callable[..., FakeConnection]
) -> None:
    monkeypatch.setattr("app.repository.psycopg.connect", factory)


def test_update_audit_log_without_fields_returns_existing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = LogRepository(Settings())
    monkeypatch.setattr(repo, "get_audit_log", lambda _log_id: {"id": 10})

    result = repo.update_audit_log(10, {})

    assert result == {"id": 10}


def test_list_audit_logs_applies_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(
        fetchone_values=[{"total": 1}],
        fetchall_values=[{"id": 9, "action": "CREATE"}],
    )

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    rows, total = repo.list_audit_logs(
        limit=10,
        offset=0,
        client_id="clt_1",
        user_id="usr_1",
        action="CREATE",
        from_dt=datetime(2026, 1, 1, tzinfo=timezone.utc),
        to_dt=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )

    assert total == 1
    assert rows[0]["id"] == 9
    count_sql = cursor.executed[0][0]
    list_sql = cursor.executed[1][0]
    assert "client_id = %(clientId)s" in count_sql
    assert "user_id = %(userId)s" in count_sql
    assert "action = %(action)s" in list_sql
    assert "ORDER BY date_time DESC" in list_sql


def test_insert_audit_log_raises_when_insert_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[None])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    with pytest.raises(RuntimeError):
        repo.insert_audit_log(
            {
                "action": "CREATE",
                "attributeName": "Client ID",
                "beforeValue": None,
                "afterValue": "clt_1",
                "userId": "usr_1",
                "clientId": "clt_1",
                "dateTime": datetime(2026, 1, 1, tzinfo=timezone.utc),
                "correlationId": "req_1",
            }
        )


def test_ping_executes_query(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(fetchone_values=[(1,)])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    assert repo.ping() is True
    assert cursor.executed[0][0].strip() == "SELECT 1"


def test_delete_audit_log_returns_false_when_no_rows_deleted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()
    cursor.rowcount = 0

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    assert repo.delete_audit_log(999) is False


def test_update_audit_log_updates_only_non_null_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[{"id": 10, "attribute_name": "status"}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    row = repo.update_audit_log(
        10,
        {
            "attributeName": "status",
            "beforeValue": None,
            "afterValue": "approved",
        },
    )

    assert row is not None
    sql, params = cursor.executed[0]
    assert "attribute_name = %(attributeName)s" in sql
    assert "after_value = %(afterValue)s" in sql
    assert "before_value" not in sql
    assert params["id"] == 10
    assert params["attributeName"] == "status"
    assert params["afterValue"] == "approved"


def test_list_audit_logs_without_filters_handles_missing_total_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[None], fetchall_values=[{"id": 1}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    rows, total = repo.list_audit_logs(
        limit=10,
        offset=0,
        client_id=None,
        user_id=None,
        action=None,
        from_dt=None,
        to_dt=None,
    )

    assert total == 0
    assert rows == [{"id": 1}]
    assert "WHERE" not in cursor.executed[0][0]


def test_insert_log_event_success_and_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    ok_cursor = FakeCursor(fetchone_values=[(5,)])

    def ok_connect(*_args, **_kwargs):
        return FakeConnection(ok_cursor)

    _patch_connect(monkeypatch, ok_connect)
    repo = LogRepository(Settings())
    created = repo.insert_log_event(
        {
            "source": "api",
            "action": "CREATE",
            "entityType": "client",
            "entityId": "clt_1",
            "userId": "usr_1",
            "message": "created",
            "payload": "{}",
            "occurredAt": datetime(2026, 1, 1, tzinfo=timezone.utc),
        }
    )
    assert created == 5

    bad_cursor = FakeCursor(fetchone_values=[None])

    def bad_connect(*_args, **_kwargs):
        return FakeConnection(bad_cursor)

    _patch_connect(monkeypatch, bad_connect)
    repo = LogRepository(Settings())
    with pytest.raises(RuntimeError):
        repo.insert_log_event(
            {
                "source": "api",
                "action": "CREATE",
                "entityType": "client",
                "entityId": "clt_1",
                "userId": "usr_1",
                "message": "created",
                "payload": "{}",
                "occurredAt": datetime(2026, 1, 1, tzinfo=timezone.utc),
            }
        )


def test_insert_communication_success_and_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ok_cursor = FakeCursor(fetchone_values=[{"id": 7}])

    def ok_connect(*_args, **_kwargs):
        return FakeConnection(ok_cursor)

    _patch_connect(monkeypatch, ok_connect)
    repo = LogRepository(Settings())
    assert (
        repo.insert_communication(
            {
                "clientId": "clt_1",
                "userId": "usr_1",
                "channel": "email",
                "toEmail": "to@example.com",
                "subject": "Hello",
                "body": "Body",
                "status": "queued",
                "providerMessageId": None,
                "errorMessage": None,
                "idempotencyKey": "verify:clt_1",
                "retryCount": 0,
                "nextAttemptAt": None,
                "lastAttemptAt": None,
                "deliveryEvent": None,
            }
        )
        == 7
    )

    bad_cursor = FakeCursor(fetchone_values=[None])

    def bad_connect(*_args, **_kwargs):
        return FakeConnection(bad_cursor)

    _patch_connect(monkeypatch, bad_connect)
    repo = LogRepository(Settings())
    with pytest.raises(RuntimeError):
        repo.insert_communication(
            {
                "clientId": "clt_1",
                "userId": "usr_1",
                "channel": "email",
                "toEmail": "to@example.com",
                "subject": "Hello",
                "body": "Body",
                "status": "queued",
                "providerMessageId": None,
                "errorMessage": None,
                "idempotencyKey": "verify:clt_1",
                "retryCount": 0,
                "nextAttemptAt": None,
                "lastAttemptAt": None,
                "deliveryEvent": None,
            }
        )


def test_list_communications_applies_agent_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[{"total": 2}], fetchall_values=[{"id": 1}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    rows, total = repo.list_communications(
        limit=10,
        offset=0,
        client_id="clt_1",
        user_id="usr_1",
    )

    assert total == 2
    assert rows == [{"id": 1}]
    assert "AND user_id = %s" in cursor.executed[0][0]


def test_list_queued_communications_filters_due_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchall_values=[{"id": 2, "status": "queued"}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    rows = repo.list_queued_communications(limit=25)

    assert rows == [{"id": 2, "status": "queued"}]
    sql, params = cursor.executed[0]
    assert "status = 'queued'" in sql
    assert "next_attempt_at <= NOW()" in sql
    assert params == (25,)


def test_list_queued_communications_returns_empty_when_table_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class UndefinedTableCursor(FakeCursor):
        def execute(self, sql: str, params=None) -> None:
            self.executed.append((sql, params))
            raise psycopg.errors.UndefinedTable("relation \"communications\" does not exist")

    cursor = UndefinedTableCursor()

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    rows = repo.list_queued_communications(limit=25)

    assert rows == []


def test_update_communication_status_updates_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[{"id": 5, "status": "sent"}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    row = repo.update_communication_status(
        5,
        {
            "status": "sent",
            "providerMessageId": "ses-1",
            "errorMessage": None,
            "retryCount": 1,
        },
    )

    assert row == {"id": 5, "status": "sent"}
    sql, params = cursor.executed[0]
    assert "status = %(status)s" in sql
    assert "provider_message_id = %(providerMessageId)s" in sql
    assert "retry_count = %(retryCount)s" in sql
    assert params["communicationId"] == 5


def test_update_communication_status_by_provider_message_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[{"id": 9, "status": "failed"}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    row = repo.update_communication_status_by_provider_message_id(
        "ses-99",
        {
            "status": "failed",
            "errorMessage": "bounce",
            "deliveryEvent": "BOUNCE",
        },
    )

    assert row == {"id": 9, "status": "failed"}
    sql, params = cursor.executed[0]
    assert "provider_message_id = %(providerMessageIdLookup)s" in sql
    assert params["providerMessageIdLookup"] == "ses-99"


def test_get_communication_by_provider_message_id_returns_latest_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[{"id": 7, "provider_message_id": "ses-7"}])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    row = repo.get_communication_by_provider_message_id("ses-7")

    assert row == {"id": 7, "provider_message_id": "ses-7"}
    assert "WHERE provider_message_id = %s" in cursor.executed[0][0]


def test_run_migrations_skips_applied_and_applies_new(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor(fetchone_values=[(1,), None])

    def fake_connect(*_args, **_kwargs):
        return FakeConnection(cursor)

    _patch_connect(monkeypatch, fake_connect)
    repo = LogRepository(Settings())

    repo.run_migrations()

    executed_sql = "\n".join(sql for sql, _params in cursor.executed)
    assert "CREATE TABLE IF NOT EXISTS schema_migrations" in executed_sql
    assert "CREATE TABLE IF NOT EXISTS audit_logs" in executed_sql
    assert "INSERT INTO schema_migrations" in executed_sql
