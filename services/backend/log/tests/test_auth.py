"""Authentication helper tests for JWT verification and role checks."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.auth import (
    AuthenticatedUser,
    ForbiddenError,
    UnauthorizedError,
    _JWKS_CACHE,
    require_bearer_user,
    require_roles,
    verify_hs256_jwt,
    verify_rs256_jwt,
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
    valid = mint_token("usr_1", "user", "secret")
    expired = mint_token("usr_1", "user", "secret", exp_seconds=-1)

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
    token = mint_token("usr_1", "user", "secret")

    user = require_bearer_user(f"Bearer {token}", "secret")
    assert user == AuthenticatedUser(user_id="usr_1", role="user")

    with pytest.raises(UnauthorizedError):
        require_bearer_user(None, "secret")
    with pytest.raises(UnauthorizedError):
        require_bearer_user("Bearer token", "wrong-secret")

    require_roles(user, {"user", "admin"})
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


# ---------------------------------------------------------------------------
# RS256 / Cognito helpers
# ---------------------------------------------------------------------------


def _generate_rsa_key():
    """Generate an RSA-2048 key pair for testing (uses cryptography library)."""
    from cryptography.hazmat.primitives.asymmetric import rsa

    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _private_key_to_jwk(private_key, kid: str = "test-key-1") -> dict:
    """Serialize the public part of an RSA private key as a JWK dict."""
    pub = private_key.public_key()
    pub_numbers = pub.public_numbers()

    def _int_to_b64url(n: int) -> str:
        length = (n.bit_length() + 7) // 8
        return (
            base64.urlsafe_b64encode(n.to_bytes(length, "big"))
            .decode("ascii")
            .rstrip("=")
        )

    return {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": kid,
        "n": _int_to_b64url(pub_numbers.n),
        "e": _int_to_b64url(pub_numbers.e),
    }


def _mint_rs256_token(
    private_key,
    kid: str,
    sub: str,
    role: str,
    issuer: str,
    audience: str,
    exp_seconds: int = 3600,
    extra_claims: dict | None = None,
) -> str:
    """Create a signed RS256 JWT for testing."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15

    now = int(datetime.now(timezone.utc).timestamp())
    claims: dict = {
        "sub": sub,
        "role": role,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + exp_seconds,
    }
    if extra_claims:
        claims.update(extra_claims)

    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT", "kid": kid}).encode())
    payload = _b64url(json.dumps(claims).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = private_key.sign(signing_input, PKCS1v15(), hashes.SHA256())
    return f"{header}.{payload}.{_b64url(sig)}"


def _make_urlopen_mock(jwk_dict: dict):
    """Return a context-manager mock for urllib.request.urlopen returning a JWKS."""

    class _FakeResponse:
        def read(self):
            return json.dumps({"keys": [jwk_dict]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    return _FakeResponse()


@pytest.fixture(autouse=True)
def _clear_jwks_cache():
    """Ensure JWKS cache is clean before every test to avoid test pollution."""
    _JWKS_CACHE.clear()
    yield
    _JWKS_CACHE.clear()


def test_verify_rs256_jwt_success() -> None:
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "admin",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="client-app-id",
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        claims = verify_rs256_jwt(
            token,
            jwks_url="https://fake.jwks/keys",
            issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
            audience="client-app-id",
        )

    assert claims["sub"] == "cog-usr-1"
    assert claims["role"] == "admin"


def test_verify_rs256_jwt_expired() -> None:
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="client-app-id",
        exp_seconds=-10,
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError, match="token_expired"):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_wrong_issuer() -> None:
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://attacker.com/pool",
        audience="client-app-id",
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_wrong_audience() -> None:
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="other-app-id",
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_wrong_signature() -> None:
    private_key = _generate_rsa_key()
    other_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(other_key, "kid-1")  # JWK is for different key
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="client-app-id",
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_unknown_kid() -> None:
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-other")  # different kid in JWKS
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="client-app-id",
    )

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_jwks_unavailable() -> None:
    private_key = _generate_rsa_key()
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "cog-usr-1",
        "user",
        issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        audience="client-app-id",
    )

    with patch("urllib.request.urlopen", side_effect=OSError("network error")):
        with pytest.raises(UnauthorizedError, match="jwks_unavailable"):
            verify_rs256_jwt(
                token,
                jwks_url="https://fake.jwks/keys",
                issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
                audience="client-app-id",
            )


def test_verify_rs256_jwt_uses_cognito_groups_when_no_role_claim() -> None:
    """RS256 tokens from Cognito that use groups instead of a role claim."""
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")

    now = int(datetime.now(timezone.utc).timestamp())
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15

    claims_dict = {
        "sub": "cog-usr-groups",
        "iss": "https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
        "aud": "client-app-id",
        "iat": now,
        "exp": now + 3600,
        "cognito:groups": ["admin", "other-group"],
        # deliberately no "role" claim
    }
    header = _b64url(
        json.dumps({"alg": "RS256", "typ": "JWT", "kid": "kid-1"}).encode()
    )
    payload = _b64url(json.dumps(claims_dict).encode())
    sig = private_key.sign(
        f"{header}.{payload}".encode("ascii"), PKCS1v15(), hashes.SHA256()
    )
    token = f"{header}.{payload}.{_b64url(sig)}"

    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        user = require_bearer_user(
            f"Bearer {token}",
            "unused-secret",
            auth_mode="hybrid",
            cognito_jwks_url="https://fake.jwks/keys",
            cognito_issuer="https://cognito-idp.ap-southeast-1.amazonaws.com/pool1",
            cognito_audience="client-app-id",
        )

    assert user == AuthenticatedUser(user_id="cog-usr-groups", role="admin")


def test_require_bearer_user_hybrid_accepts_both_algs() -> None:
    """In hybrid mode, both HS256 and RS256 tokens should be accepted."""
    # HS256 path
    hs256_token = mint_token("hs-usr", "user", "secret")
    user = require_bearer_user(f"Bearer {hs256_token}", "secret", auth_mode="hybrid")
    assert user.user_id == "hs-usr"

    # RS256 path
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    rs256_token = _mint_rs256_token(
        private_key,
        "kid-1",
        "rs-usr",
        "admin",
        issuer="https://cognito.example.com/pool",
        audience="app-client",
    )
    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        rs_user = require_bearer_user(
            f"Bearer {rs256_token}",
            "secret",
            auth_mode="hybrid",
            cognito_jwks_url="https://fake.jwks/keys",
            cognito_issuer="https://cognito.example.com/pool",
            cognito_audience="app-client",
        )
    assert rs_user.user_id == "rs-usr"


def test_require_bearer_user_local_mode_rejects_rs256() -> None:
    """local auth_mode must reject RS256 tokens."""
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    rs256_token = _mint_rs256_token(
        private_key,
        "kid-1",
        "rs-usr",
        "admin",
        issuer="https://cognito.example.com/pool",
        audience="app-client",
    )
    with patch("urllib.request.urlopen", return_value=_make_urlopen_mock(jwk)):
        with pytest.raises(UnauthorizedError):
            require_bearer_user(
                f"Bearer {rs256_token}",
                "secret",
                auth_mode="local",
            )


def test_require_bearer_user_cognito_mode_rejects_hs256() -> None:
    """cognito auth_mode must reject HS256 tokens."""
    hs256_token = mint_token("hs-usr", "user", "secret")
    with pytest.raises(UnauthorizedError):
        require_bearer_user(
            f"Bearer {hs256_token}",
            "secret",
            auth_mode="cognito",
            cognito_jwks_url="https://fake.jwks/keys",
            cognito_issuer="https://cognito.example.com/pool",
            cognito_audience="app-client",
        )


def test_jwks_cache_is_used_on_second_call() -> None:
    """Verify JWKS endpoint is only called once when cached."""
    private_key = _generate_rsa_key()
    jwk = _private_key_to_jwk(private_key, "kid-1")
    token = _mint_rs256_token(
        private_key,
        "kid-1",
        "usr",
        "user",
        issuer="https://cognito.example.com/pool",
        audience="app-client",
    )
    call_count = 0

    def counting_urlopen(url, timeout=None):
        nonlocal call_count
        call_count += 1
        return _make_urlopen_mock(jwk)

    with patch("urllib.request.urlopen", side_effect=counting_urlopen):
        verify_rs256_jwt(
            token,
            "https://fake.jwks/keys",
            "https://cognito.example.com/pool",
            "app-client",
        )
        verify_rs256_jwt(
            token,
            "https://fake.jwks/keys",
            "https://cognito.example.com/pool",
            "app-client",
        )

    assert call_count == 1, "JWKS endpoint should only be fetched once when cached"
