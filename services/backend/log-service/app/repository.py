from __future__ import annotations

from pathlib import Path

import psycopg

from .config import Settings


class LogRepository:
    def __init__(self, settings: Settings):
        self._settings = settings

    def ping(self) -> bool:
        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True

    def run_migrations(self) -> None:
        migrations_dir = Path(__file__).parent / "migrations"
        migration_files = sorted(migrations_dir.glob("*.sql"))
        if not migration_files:
            return

        with psycopg.connect(self._settings.dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version VARCHAR(128) PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
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
                    VALUES (%(source)s, %(action)s, %(entityType)s, %(entityId)s, %(agentId)s, %(message)s, %(payload)s, %(occurredAt)s)
                    RETURNING id
                    """,
                    event,
                )
                row = cur.fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("failed to persist log event")

        return int(row[0])