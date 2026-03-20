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


def _runtime_environment() -> str:
    """Resolve the runtime environment name used for safety guardrails."""
    return os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "dev")).strip().lower()


def _is_dev_environment() -> bool:
    """Return True when running in a local/dev/test style environment."""
    return _runtime_environment() in {"dev", "local", "test"}


def _default_auth_mode() -> str:
    """Use hybrid in dev-like environments, Cognito-only elsewhere."""
    return "hybrid" if _is_dev_environment() else "cognito"


def _parse_bool_env(name: str, default: bool) -> bool:
    """Parse a boolean env var using common true/false string forms."""
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean value")


def _env_or_secret(env_var: str, secret_arn_var: str, default: str | None) -> str:
    """Prefer direct env values, then secret ARN, then optional default."""
    direct_value = os.getenv(env_var)
    if direct_value:
        return direct_value

    secret_id = os.getenv(secret_arn_var, "").strip()
    if secret_id:
        return _read_secret(secret_id)

    if default is not None:
        return default
    raise RuntimeError(
        f"{env_var} or {secret_arn_var} must be set for non-dev environments"
    )


@dataclass(frozen=True)
class Settings:
    """Log service settings with dev-only convenience defaults."""

    # Use default_factory so env vars are read at instantiation time (not import
    # time). This keeps tests and local runs predictable when env vars are set
    # just before creating the app.
    environment: str = field(default_factory=_runtime_environment)
    db_host: str = field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    db_port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str = field(default_factory=lambda: os.getenv("DB_NAME", "crm"))
    db_user: str = field(
        default_factory=lambda: _env_or_secret(
            "DB_USER",
            "DB_USER_SECRET_ARN",
            "crm_app" if _is_dev_environment() else None,
        )
    )
    db_password: str = field(
        default_factory=lambda: _env_or_secret(
            "DB_PASSWORD",
            "DB_PASSWORD_SECRET_ARN",
            "devpassword" if _is_dev_environment() else None,
        )
    )
    jwt_hmac_secret: str = field(
        default_factory=lambda: _env_or_secret(
            "JWT_HMAC_SECRET",
            "JWT_HMAC_SECRET_ARN",
            "dev-only-insecure-secret" if _is_dev_environment() else None,
        )
    )
    # Authentication mode: local (HS256 only), cognito (RS256 only), hybrid (both)
    auth_mode: str = field(
        default_factory=lambda: os.getenv("AUTH_MODE", _default_auth_mode())
        .strip()
        .lower()
    )
    # Explicitly controls whether hybrid HS256/RS256 trust is allowed.
    allow_hybrid_auth: bool = field(
        default_factory=lambda: _parse_bool_env(
            "ALLOW_HYBRID_AUTH",
            _is_dev_environment(),
        )
    )
    # Cognito JWKS endpoint, required when auth_mode is cognito/hybrid.
    cognito_jwks_url: str = field(
        default_factory=lambda: os.getenv("COGNITO_JWKS_URL", "")
    )
    # Expected issuer in Cognito tokens
    # (https://cognito-idp.<region>.amazonaws.com/<pool_id>)
    cognito_issuer: str = field(default_factory=lambda: os.getenv("COGNITO_ISSUER", ""))
    # Cognito App Client ID used as the audience claim
    cognito_audience: str = field(
        default_factory=lambda: os.getenv("COGNITO_CLIENT_ID", "")
    )
    client_service_url: str = field(
        default_factory=lambda: os.getenv("CLIENT_SERVICE_URL", "http://localhost:8080")
        .rstrip("/")
    )

    def __post_init__(self) -> None:
        valid_modes = {"local", "cognito", "hybrid"}
        if self.auth_mode not in valid_modes:
            raise RuntimeError("AUTH_MODE must be one of: local, cognito, hybrid")
        if self.auth_mode == "hybrid" and not self.allow_hybrid_auth:
            raise RuntimeError("hybrid auth_mode is disabled for this environment")
        if self.auth_mode == "cognito":
            if not self.cognito_jwks_url.strip():
                raise RuntimeError(
                    "COGNITO_JWKS_URL must be set when AUTH_MODE is cognito"
                )
            if not self.cognito_issuer.strip():
                raise RuntimeError(
                    "COGNITO_ISSUER must be set when AUTH_MODE is cognito"
                )
            if not self.cognito_audience.strip():
                raise RuntimeError(
                    "COGNITO_CLIENT_ID must be set when AUTH_MODE is cognito"
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
