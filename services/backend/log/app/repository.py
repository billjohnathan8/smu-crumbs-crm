"""Database access layer for the log service."""

from __future__ import annotations

from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .config import Settings


class LogRepository:
    """Persist and query audit logs and communications in PostgreSQL."""

    def __init__(self, settings: Settings):
        self._settings = settings

    def ping(self) -> bool:
        """Run a lightweight query to verify database connectivity."""
        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True

    def run_migrations(self) -> None:
        """Apply SQL migrations in order, tracking applied versions."""
        migrations_dir = Path(__file__).parent / "migrations"
        migration_files = sorted(migrations_dir.glob("*.sql"))
        if not migration_files:
            return

        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version VARCHAR(128) PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """)
                for file_path in migration_files:
                    version = file_path.name
                    cur.execute(
                        "SELECT 1 FROM schema_migrations WHERE version = %s",
                        (version,),
                    )
                    if cur.fetchone():
                        continue

                    cur.execute(file_path.read_text(encoding="utf-8"))
                    cur.execute(
                        "INSERT INTO schema_migrations(version) VALUES (%s)",
                        (version,),
                    )
            conn.commit()

    def insert_log_event(self, event: dict) -> int:
        """Insert a generic log event row and return the new id."""
        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO logs (
                        source,
                        action,
                        entity_type,
                        entity_id,
                        user_id,
                        message,
                        payload,
                        occurred_at
                    )
                    VALUES (
                        %(source)s,
                        %(action)s,
                        %(entityType)s,
                        %(entityId)s,
                        %(userId)s,
                        %(message)s,
                        %(payload)s,
                        %(occurredAt)s
                    )
                    RETURNING id
                    """,
                    event,
                )
                row = cur.fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("failed to persist log event")

        return int(row[0])

    def insert_audit_log(self, record: dict) -> int:
        """Insert an audit log row and return the new id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (
                        action,
                        attribute_name,
                        before_value,
                        after_value,
                        user_id,
                        client_id,
                        date_time,
                        correlation_id
                    )
                    VALUES (
                        %(action)s,
                        %(attributeName)s,
                        %(beforeValue)s,
                        %(afterValue)s,
                        %(userId)s,
                        %(clientId)s,
                        %(dateTime)s,
                        %(correlationId)s
                    )
                    RETURNING id
                    """,
                    record,
                )
                row = cur.fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("failed to persist audit log")
        return int(row["id"])

    def get_audit_log(self, log_id: int) -> dict | None:
        """Fetch a single audit log row by id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM audit_logs WHERE id = %s", (log_id,))
                row = cur.fetchone()
        return row

    def delete_audit_log(self, log_id: int) -> bool:
        """Delete a single audit log row by id."""
        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM audit_logs WHERE id = %s", (log_id,))
                deleted = cur.rowcount
            conn.commit()
        return deleted > 0

    def update_audit_log(self, log_id: int, patch: dict) -> dict | None:
        """Update a subset of audit log fields and return the new row."""
        fields = []
        params: dict[str, object] = {"id": log_id}

        for key, col in [
            ("attributeName", "attribute_name"),
            ("beforeValue", "before_value"),
            ("afterValue", "after_value"),
            ("dateTime", "date_time"),
        ]:
            if key in patch and patch[key] is not None:
                fields.append(f"{col} = %({key})s")
                params[key] = patch[key]

        if not fields:
            return self.get_audit_log(log_id)

        sql = (
            "UPDATE audit_logs SET "
            + ", ".join(fields)
            + ", updated_at = NOW() WHERE id = %(id)s RETURNING *"
        )
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            conn.commit()
        return row

    def list_audit_logs(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        user_id: str | None,
        action: str | None,
        from_dt,
        to_dt,
    ) -> tuple[list[dict], int]:
        """List audit logs with optional filters and return rows plus total."""
        where = []
        params: dict[str, object] = {"limit": limit, "offset": offset}
        if client_id:
            where.append("client_id = %(clientId)s")
            params["clientId"] = client_id
        if user_id:
            where.append("user_id = %(userId)s")
            params["userId"] = user_id
        if action:
            where.append("action = %(action)s")
            params["action"] = action
        if from_dt:
            where.append("date_time >= %(from)s")
            params["from"] = from_dt
        if to_dt:
            where.append("date_time < %(to)s")
            params["to"] = to_dt

        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        count_sql = "SELECT COUNT(*) AS total FROM audit_logs" + where_sql
        list_sql = (
            "SELECT * FROM audit_logs"
            + where_sql
            + " ORDER BY date_time DESC, id DESC LIMIT %(limit)s OFFSET %(offset)s"
        )

        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(count_sql, params)
                    total_row = cur.fetchone()
                    total = int(total_row["total"]) if total_row else 0
                    cur.execute(list_sql, params)
                    rows = list(cur.fetchall())
                except psycopg.errors.UndefinedTable:
                    # Keep read paths available during partial rollouts where V2
                    # migrations have not yet materialized audit tables.
                    return [], 0
        return rows, total

    def insert_communication(self, record: dict) -> int:
        """Insert a communication record and return the new id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO communications (
                        client_id,
                        user_id,
                        channel,
                        to_email,
                        subject,
                        body,
                        status,
                        provider_message_id,
                        error_message,
                        idempotency_key,
                        retry_count,
                        next_attempt_at,
                        last_attempt_at,
                        delivery_event
                    )
                    VALUES (
                        %(clientId)s,
                        %(userId)s,
                        %(channel)s,
                        %(toEmail)s,
                        %(subject)s,
                        %(body)s,
                        %(status)s,
                        %(providerMessageId)s,
                        %(errorMessage)s,
                        %(idempotencyKey)s,
                        %(retryCount)s,
                        %(nextAttemptAt)s,
                        %(lastAttemptAt)s,
                        %(deliveryEvent)s
                    )
                    ON CONFLICT (idempotency_key)
                    DO UPDATE SET updated_at = NOW()
                    RETURNING id
                    """,
                    record,
                )
                row = cur.fetchone()
            conn.commit()
        if row is None:
            raise RuntimeError("failed to persist communication")
        return int(row["id"])

    def insert_aml_alert(self, payload: dict) -> dict:
        """Insert an AML alert row and return the persisted record."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO aml_alerts (
                        alert_id,
                        client_id,
                        transaction_id,
                        alert_type,
                        description,
                        detected_at,
                        review_status
                    )
                    VALUES (
                        %(alertId)s,
                        %(clientId)s,
                        %(transactionId)s,
                        %(alertType)s,
                        %(description)s,
                        %(detectedAt)s,
                        %(reviewStatus)s
                    )
                    RETURNING *
                    """,
                    payload,
                )
                row = cur.fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("failed to persist aml alert")
        return row

    def get_aml_alert_by_alert_id(self, alert_id: str) -> dict | None:
        """Fetch an AML alert by external alert id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM aml_alerts WHERE alert_id = %s",
                    (alert_id,),
                )
                row = cur.fetchone()
        return row

    def list_aml_alerts(
        self,
        limit: int,
        offset: int,
        client_id: str | None,
        client_ids: list[str] | None,
        alert_type: str | None,
        review_status: str | None,
    ) -> tuple[list[dict], int]:
        """List AML alerts with optional filters and return rows plus total."""
        where = []
        params: dict[str, object] = {"limit": limit, "offset": offset}
        if client_id:
            where.append("client_id = %(clientId)s")
            params["clientId"] = client_id
        elif client_ids:
            where.append("client_id = ANY(%(clientIds)s)")
            params["clientIds"] = client_ids
        if alert_type:
            where.append("alert_type = %(alertType)s")
            params["alertType"] = alert_type
        if review_status:
            where.append("review_status = %(reviewStatus)s")
            params["reviewStatus"] = review_status

        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        count_sql = "SELECT COUNT(*) AS total FROM aml_alerts" + where_sql
        list_sql = (
            "SELECT * FROM aml_alerts"
            + where_sql
            + " ORDER BY detected_at DESC, id DESC LIMIT %(limit)s OFFSET %(offset)s"
        )

        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(count_sql, params)
                    total_row = cur.fetchone()
                    total = int(total_row["total"]) if total_row else 0
                    cur.execute(list_sql, params)
                    rows = list(cur.fetchall())
                except psycopg.errors.UndefinedTable:
                    # Keep AML list paths available during partial rollouts where
                    # V2 migrations have not yet materialized AML tables.
                    return [], 0
        return rows, total

    def update_aml_alert_review(self, alert_id: str, review_status: str) -> dict | None:
        """Update review status for an AML alert and return the updated row."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE aml_alerts
                    SET review_status = %s, updated_at = NOW()
                    WHERE alert_id = %s
                    RETURNING *
                    """,
                    (review_status, alert_id),
                )
                row = cur.fetchone()
            conn.commit()
        return row

    def get_communication(self, communication_id: int) -> dict | None:
        """Fetch a communication record by id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM communications WHERE id = %s",
                    (communication_id,),
                )
                row = cur.fetchone()
        return row

    def get_communication_by_provider_message_id(
        self, provider_message_id: str
    ) -> dict | None:
        """Fetch a communication record by provider message id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT * FROM communications
                    WHERE provider_message_id = %s
                    ORDER BY updated_at DESC, id DESC
                    LIMIT 1
                    """,
                    (provider_message_id,),
                )
                row = cur.fetchone()
        return row

    def list_communications(
        self,
        limit: int,
        offset: int,
        client_id: str,
        user_id: str | None = None,
    ) -> tuple[list[dict], int]:
        """List communications for a client and optional user scope."""
        where_sql = "WHERE client_id = %s"
        params: list[object] = [client_id]
        if user_id:
            where_sql += " AND user_id = %s"
            params.append(user_id)

        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT COUNT(*) AS total FROM communications {where_sql}",
                    tuple(params),
                )
                total = int((cur.fetchone() or {"total": 0})["total"])
                cur.execute(
                    f"""
                    SELECT * FROM communications
                    {where_sql}
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    tuple(params + [limit, offset]),
                )
                rows = list(cur.fetchall())
        return rows, total

    def list_queued_communications(
        self,
        limit: int,
        status: str | None = "queued",
        created_from=None,
        created_to=None,
        recipient: str | None = None,
        subject: str | None = None,
        client_id: str | None = None,
        user_id: str | None = None,
    ) -> list[dict]:
        """List communications with optional filters and queued-dispatch semantics."""
        where: list[str] = []
        params: dict[str, object] = {"limit": limit}

        if status:
            where.append("status = %(status)s")
            params["status"] = status
            if status == "queued":
                where.append("(next_attempt_at IS NULL OR next_attempt_at <= NOW())")
        if created_from is not None:
            where.append("created_at >= %(createdFrom)s")
            params["createdFrom"] = created_from
        if created_to is not None:
            where.append("created_at <= %(createdTo)s")
            params["createdTo"] = created_to
        if recipient:
            where.append("to_email ILIKE %(recipient)s")
            params["recipient"] = f"%{recipient}%"
        if subject:
            where.append("subject ILIKE %(subject)s")
            params["subject"] = f"%{subject}%"
        if client_id:
            where.append("client_id ILIKE %(clientId)s")
            params["clientId"] = f"%{client_id}%"
        if user_id:
            where.append("user_id ILIKE %(userId)s")
            params["userId"] = f"%{user_id}%"

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""

        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        (
                            "SELECT * FROM communications "
                            f"{where_sql} "
                            "ORDER BY COALESCE(next_attempt_at, created_at) ASC, id ASC "
                            "LIMIT %(limit)s"
                        ),
                        params,
                    )
                    rows = list(cur.fetchall())
                except (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn):
                    # Keep queued-communications reads available during partial rollouts
                    # where communication tables/columns are not yet materialized.
                    return []
        return rows

    def update_communication_status(
        self, communication_id: int, patch: dict
    ) -> dict | None:
        """Update communication delivery fields by communication id."""
        return self._update_communication_status(
            where_clause="id = %(communicationId)s",
            where_params={"communicationId": communication_id},
            patch=patch,
        )

    def update_communication_status_by_provider_message_id(
        self, provider_message_id: str, patch: dict
    ) -> dict | None:
        """Update communication delivery fields by provider message id."""
        return self._update_communication_status(
            where_clause="provider_message_id = %(providerMessageIdLookup)s",
            where_params={"providerMessageIdLookup": provider_message_id},
            patch=patch,
        )

    def _update_communication_status(
        self,
        where_clause: str,
        where_params: dict[str, object],
        patch: dict,
    ) -> dict | None:
        fields = []
        params: dict[str, object] = {}
        params.update(where_params)

        for key, column in [
            ("status", "status"),
            ("providerMessageId", "provider_message_id"),
            ("errorMessage", "error_message"),
            ("retryCount", "retry_count"),
            ("nextAttemptAt", "next_attempt_at"),
            ("lastAttemptAt", "last_attempt_at"),
            ("deliveryEvent", "delivery_event"),
        ]:
            if key in patch:
                fields.append(f"{column} = %({key})s")
                params[key] = patch.get(key)

        if not fields:
            return None

        sql = f"""
            UPDATE communications
            SET {", ".join(fields)}, updated_at = NOW()
            WHERE {where_clause}
            RETURNING *
        """
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            conn.commit()
        return row
