"""Configuration settings loaded from environment variables."""

import base64
import os
from dataclasses import dataclass, field
from functools import lru_cache


@lru_cache(maxsize=None)
def _read_secret(secret_id: str) -> str:
    """Resolve a plaintext secret value from AWS Secrets Manager."""
    try:
        import boto3
    except Exception as exc:  # pragma: no cover - exercised in Lambda packaging
        raise RuntimeError("boto3 is required to resolve secret references") from exc

    response = boto3.client("secretsmanager").get_secret_value(SecretId=secret_id)
    secret_string = response.get("SecretString")
    if secret_string is not None:
        return secret_string

    secret_binary = response.get("SecretBinary")
    if secret_binary is None:
        raise RuntimeError(f"secret {secret_id} has no SecretString/SecretBinary value")
    if isinstance(secret_binary, str):
        secret_binary = secret_binary.encode("utf-8")
    return base64.b64decode(secret_binary).decode("utf-8")


def _env_or_secret(env_var: str, secret_arn_var: str, default: str) -> str:
    """Prefer direct env values, otherwise resolve via secret ARN env var."""
    direct_value = os.getenv(env_var)
    if direct_value:
        return direct_value

    secret_id = os.getenv(secret_arn_var, "").strip()
    if secret_id:
        return _read_secret(secret_id)
    return default


@dataclass(frozen=True)
class Settings:
    """Log service settings with environment-based defaults."""

    # Use default_factory so env vars are read at instantiation time (not import
    # time). This keeps tests and local runs predictable when env vars are set
    # just before creating the app.
    db_host: str = field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    db_port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str = field(default_factory=lambda: os.getenv("DB_NAME", "cs301"))
    db_user: str = field(
        default_factory=lambda: _env_or_secret("DB_USER", "DB_USER_SECRET_ARN", "cs301")
    )
    db_password: str = field(
        default_factory=lambda: _env_or_secret(
            "DB_PASSWORD", "DB_PASSWORD_SECRET_ARN", "cs301pass"
        )
    )
    jwt_hmac_secret: str = field(
        default_factory=lambda: _env_or_secret(
            "JWT_HMAC_SECRET",
            "JWT_HMAC_SECRET_ARN",
            "dev-only-insecure-secret",
        )
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
