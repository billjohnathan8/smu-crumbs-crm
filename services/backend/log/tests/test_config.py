"""Configuration tests for environment and secret-backed settings."""

from __future__ import annotations

from app.config import Settings


def test_settings_prefers_direct_env_values(monkeypatch) -> None:
    monkeypatch.setenv("DB_USER", "direct-user")
    monkeypatch.setenv("DB_PASSWORD", "direct-password")
    monkeypatch.setenv("JWT_HMAC_SECRET", "direct-jwt")
    monkeypatch.setenv(
        "DB_USER_SECRET_ARN", "arn:aws:secretsmanager:region:acct:secret:u"
    )
    monkeypatch.setenv(
        "DB_PASSWORD_SECRET_ARN", "arn:aws:secretsmanager:region:acct:secret:p"
    )
    monkeypatch.setenv(
        "JWT_HMAC_SECRET_ARN", "arn:aws:secretsmanager:region:acct:secret:j"
    )

    settings = Settings()

    assert settings.db_user == "direct-user"
    assert settings.db_password == "direct-password"
    assert settings.jwt_hmac_secret == "direct-jwt"


def test_settings_resolves_secret_arn_values(monkeypatch) -> None:
    monkeypatch.delenv("DB_USER", raising=False)
    monkeypatch.delenv("DB_PASSWORD", raising=False)
    monkeypatch.delenv("JWT_HMAC_SECRET", raising=False)
    monkeypatch.setenv("DB_USER_SECRET_ARN", "arn-user")
    monkeypatch.setenv("DB_PASSWORD_SECRET_ARN", "arn-password")
    monkeypatch.setenv("JWT_HMAC_SECRET_ARN", "arn-jwt")

    def fake_read_secret(secret_id: str) -> str:
        return {
            "arn-user": "secret-user",
            "arn-password": "secret-password",
            "arn-jwt": "secret-jwt",
        }[secret_id]

    monkeypatch.setattr("app.config._read_secret", fake_read_secret)
    settings = Settings()

    assert settings.db_user == "secret-user"
    assert settings.db_password == "secret-password"
    assert settings.jwt_hmac_secret == "secret-jwt"
