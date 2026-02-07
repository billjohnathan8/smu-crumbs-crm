"""Authentication helper tests for JWT verification and role checks."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone

import pytest

from app.auth import (
    AuthenticatedUser,
    ForbiddenError,
    UnauthorizedError,
    require_bearer_user,
    require_roles,
    verify_hs256_jwt,
)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def mint_token(sub: str, role: str, secret: str, exp_seconds: int = 3600) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(
        json.dumps(
            {
                "sub": sub,
                "role": role,
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int(datetime.now(timezone.utc).timestamp()) + exp_seconds,
            }
        ).encode("utf-8")
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def mint_token_with_claims(claims: dict, secret: str) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(json.dumps(claims).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def test_verify_hs256_jwt_success() -> None:
    token = mint_token("usr_1", "admin", "secret")

    claims = verify_hs256_jwt(token, "secret")

    assert claims["sub"] == "usr_1"
    assert claims["role"] == "admin"


def test_verify_hs256_jwt_invalid_or_expired_token() -> None:
    valid = mint_token("usr_1", "agent", "secret")
    expired = mint_token("usr_1", "agent", "secret", exp_seconds=-1)

    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt("bad-format", "secret")
    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt(valid, "wrong-secret")
    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt(expired, "secret")


def test_verify_hs256_jwt_rejects_wrong_alg_and_malformed_json() -> None:
    secret = "secret"
    valid = mint_token("usr_1", "admin", secret)
    parts = valid.split(".")

    bad_alg_header = _b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode("utf-8"))
    wrong_alg = f"{bad_alg_header}.{parts[1]}.{parts[2]}"
    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt(wrong_alg, secret)

    not_json_header = _b64url(b"not-json")
    malformed = f"{not_json_header}.{parts[1]}.{parts[2]}"
    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt(malformed, secret)


def test_verify_hs256_jwt_rejects_invalid_exp() -> None:
    secret = "secret"
    token = mint_token_with_claims(
        {
            "sub": "usr_1",
            "role": "admin",
            "iat": 0,
            "exp": "not-a-number",
        },
        secret,
    )

    with pytest.raises(UnauthorizedError):
        verify_hs256_jwt(token, secret)


def test_require_bearer_user_and_require_roles() -> None:
    token = mint_token("usr_1", "agent", "secret")

    user = require_bearer_user(f"Bearer {token}", "secret")
    assert user == AuthenticatedUser(user_id="usr_1", role="agent")

    with pytest.raises(UnauthorizedError):
        require_bearer_user(None, "secret")
    with pytest.raises(UnauthorizedError):
        require_bearer_user("Bearer token", "wrong-secret")

    require_roles(user, {"agent", "admin"})
    with pytest.raises(ForbiddenError):
        require_roles(user, {"admin"})


def test_require_bearer_user_rejects_bad_claims() -> None:
    secret = "secret"
    bad_role = mint_token("usr_1", "guest", secret)
    with pytest.raises(UnauthorizedError):
        require_bearer_user(f"Bearer {bad_role}", secret)

    bad_types = mint_token_with_claims({"sub": 123, "role": "admin", "iat": 0}, secret)
    with pytest.raises(UnauthorizedError):
        require_bearer_user(f"Bearer {bad_types}", secret)
