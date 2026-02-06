"""Configuration settings loaded from environment variables."""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    """Log service settings with environment-based defaults."""

    # Use default_factory so env vars are read at instantiation time (not import
    # time). This keeps tests and local runs predictable when env vars are set
    # just before creating the app.
    db_host: str = field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    db_port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str = field(default_factory=lambda: os.getenv("DB_NAME", "cs301"))
    db_user: str = field(default_factory=lambda: os.getenv("DB_USER", "cs301"))
    db_password: str = field(
        default_factory=lambda: os.getenv("DB_PASSWORD", "cs301pass")
    )
    jwt_hmac_secret: str = field(
        default_factory=lambda: os.getenv("JWT_HMAC_SECRET", "dev-only-insecure-secret")
    )

    @property
    def dsn(self) -> str:
        """Build a PostgreSQL DSN string from settings."""
        return (
            f"host={self.db_host} "
            f"port={self.db_port} "
            f"dbname={self.db_name} "
            f"user={self.db_user} "
            f"password={self.db_password}"
        )
