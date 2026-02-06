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
                        agent_id,
                        message,
                        payload,
                        occurred_at
                    )
                    VALUES (
                        %(source)s,
                        %(action)s,
                        %(entityType)s,
                        %(entityId)s,
                        %(agentId)s,
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
                        agent_id,
                        client_id,
                        date_time,
                        correlation_id
                    )
                    VALUES (
                        %(action)s,
                        %(attributeName)s,
                        %(beforeValue)s,
                        %(afterValue)s,
                        %(agentId)s,
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
        agent_id: str | None,
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
        if agent_id:
            where.append("agent_id = %(agentId)s")
            params["agentId"] = agent_id
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
                cur.execute(count_sql, params)
                total_row = cur.fetchone()
                total = int(total_row["total"]) if total_row else 0
                cur.execute(list_sql, params)
                rows = list(cur.fetchall())
        return rows, total

    def insert_communication(self, record: dict) -> int:
        """Insert a communication record and return the new id."""
        with psycopg.connect(self._settings.dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO communications (
                        client_id,
                        agent_id,
                        channel,
                        to_email,
                        subject,
                        body,
                        status,
                        provider_message_id,
                        error_message
                    )
                    VALUES (
                        %(clientId)s,
                        %(agentId)s,
                        %(channel)s,
                        %(toEmail)s,
                        %(subject)s,
                        %(body)s,
                        %(status)s,
                        %(providerMessageId)s,
                        %(errorMessage)s
                    )
                    RETURNING id
                    """,
                    record,
                )
                row = cur.fetchone()
            conn.commit()
        if row is None:
            raise RuntimeError("failed to persist communication")
        return int(row["id"])

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

    def list_communications(
        self,
        limit: int,
        offset: int,
        client_id: str,
        agent_id: str | None = None,
    ) -> tuple[list[dict], int]:
        """List communications for a client and optional agent scope."""
        where_sql = "WHERE client_id = %s"
        params: list[object] = [client_id]
        if agent_id:
            where_sql += " AND agent_id = %s"
            params.append(agent_id)

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
