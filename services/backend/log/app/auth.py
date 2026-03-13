"""JWT authentication helpers and role checks for the log service."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


class UnauthorizedError(Exception):
    pass


class ForbiddenError(Exception):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    """Representation of the authenticated subject and role."""

    user_id: str
    role: str

    def is_admin(self) -> bool:
        """Return True when the user has admin privileges."""
        return self.role == "admin"

    def is_agent(self) -> bool:
        """Return True when the user has agent privileges."""
        return self.role == "agent"


def _b64url_decode(segment: str) -> bytes:
    """Decode a base64url segment without padding."""
    padding = "=" * ((4 - (len(segment) % 4)) % 4)
    return base64.urlsafe_b64decode((segment + padding).encode("ascii"))


# ---------------------------------------------------------------------------
# HS256 (local/hybrid mode)
# ---------------------------------------------------------------------------

def verify_hs256_jwt(token: str, secret: str) -> dict[str, Any]:
    """Validate an HS256 JWT and return the decoded claims."""
    parts = token.split(".")
    if len(parts) != 3:
        raise UnauthorizedError("invalid_token")

    header_bytes = _b64url_decode(parts[0])
    payload_bytes = _b64url_decode(parts[1])
    sig_bytes = _b64url_decode(parts[2])

    try:
        header = json.loads(header_bytes.decode("utf-8"))
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise UnauthorizedError("invalid_token") from exc

    if header.get("alg") != "HS256":
        raise UnauthorizedError("invalid_token")

    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, sig_bytes):
        raise UnauthorizedError("invalid_token")

    exp = payload.get("exp")
    if exp is not None:
        try:
            exp_dt = datetime.fromtimestamp(int(exp), tz=timezone.utc)
        except Exception as exc:
            raise UnauthorizedError("invalid_token") from exc
        if datetime.now(timezone.utc) >= exp_dt:
            raise UnauthorizedError("token_expired")

    return payload


# ---------------------------------------------------------------------------
# RS256 (Cognito / hybrid mode)
# ---------------------------------------------------------------------------

# Module-level JWKS cache: jwks_url -> (expiry_monotonic, {kid: RSAPublicKey})
_JWKS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_JWKS_CACHE_TTL: float = 3600.0  # seconds


def _big_int(b64url: str) -> int:
    """Convert a base64url-encoded big-endian integer (JWK modulus/exponent)."""
    return int.from_bytes(_b64url_decode(b64url), "big")


def _build_rsa_public_key(jwk: dict[str, Any]) -> Any:
    """Construct an RSA public key object from a JWK dict."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers

    n = _big_int(jwk["n"])
    e = _big_int(jwk["e"])
    return RSAPublicNumbers(e, n).public_key()


def _fetch_jwks(jwks_url: str) -> dict[str, Any]:
    """Return a cached kid → RSAPublicKey map, refreshing when stale."""
    now = time.monotonic()
    cached = _JWKS_CACHE.get(jwks_url)
    if cached is not None:
        expiry, keys = cached
        if now < expiry:
            return keys

    try:
        with urllib.request.urlopen(jwks_url, timeout=5) as resp:  # noqa: S310
            body = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise UnauthorizedError("jwks_unavailable") from exc

    keys: dict[str, Any] = {}
    for jwk in body.get("keys", []):
        if jwk.get("kty") == "RSA" and "kid" in jwk:
            try:
                keys[jwk["kid"]] = _build_rsa_public_key(jwk)
            except Exception:
                # Skip malformed keys rather than failing entirely
                pass

    _JWKS_CACHE[jwks_url] = (now + _JWKS_CACHE_TTL, keys)
    return keys


def verify_rs256_jwt(
    token: str,
    jwks_url: str,
    issuer: str,
    audience: str,
) -> dict[str, Any]:
    """Validate a Cognito RS256 JWT and return the decoded claims."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15

    parts = token.split(".")
    if len(parts) != 3:
        raise UnauthorizedError("invalid_token")

    try:
        header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
        payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
    except Exception as exc:
        raise UnauthorizedError("invalid_token") from exc

    if header.get("alg") != "RS256":
        raise UnauthorizedError("invalid_token")

    kid = header.get("kid")
    if not kid:
        raise UnauthorizedError("invalid_token")

    keys = _fetch_jwks(jwks_url)
    public_key = keys.get(kid)
    if public_key is None:
        raise UnauthorizedError("invalid_token")

    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    sig_bytes = _b64url_decode(parts[2])
    try:
        public_key.verify(sig_bytes, signing_input, PKCS1v15(), hashes.SHA256())
    except InvalidSignature as exc:
        raise UnauthorizedError("invalid_token") from exc

    # Validate exp
    exp = payload.get("exp")
    if exp is not None:
        try:
            exp_dt = datetime.fromtimestamp(int(exp), tz=timezone.utc)
        except Exception as exc:
            raise UnauthorizedError("invalid_token") from exc
        if datetime.now(timezone.utc) >= exp_dt:
            raise UnauthorizedError("token_expired")

    # Validate issuer
    if payload.get("iss") != issuer:
        raise UnauthorizedError("invalid_token")

    # Validate audience — Cognito access tokens use `client_id`; ID tokens use `aud`
    token_aud = payload.get("aud") or payload.get("client_id")
    if token_aud != audience:
        raise UnauthorizedError("invalid_token")

    return payload


def _cognito_role(claims: dict[str, Any]) -> str | None:
    """Extract an app role from Cognito groups claim."""
    groups = claims.get("cognito:groups")
    if isinstance(groups, list):
        for group in groups:
            if group in {"admin", "agent"}:
                return group
    return None


# ---------------------------------------------------------------------------
# Dispatcher — picks HS256 or RS256 based on token header + auth_mode
# ---------------------------------------------------------------------------

def require_bearer_user(
    authorization: str | None,
    secret: str,
    *,
    auth_mode: str = "local",
    cognito_jwks_url: str = "",
    cognito_issuer: str = "",
    cognito_audience: str = "",
) -> AuthenticatedUser:
    """Parse a bearer token and return the authenticated user.

    Dispatches to HS256 or RS256 validation based on the JWT header ``alg``
    field and the configured ``auth_mode``.  In ``hybrid`` mode both algorithms
    are accepted; in ``local`` only HS256 is accepted; in ``cognito`` only
    RS256 is accepted.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("missing_bearer")
    token = authorization.removeprefix("Bearer ").strip()

    # Peek at the JWT header to determine the algorithm
    parts = token.split(".")
    alg = "HS256"
    if len(parts) == 3:
        try:
            header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
            alg = header.get("alg", "HS256")
        except Exception:
            pass

    if alg == "RS256":
        if auth_mode not in ("cognito", "hybrid"):
            raise UnauthorizedError("invalid_token")
        if not cognito_jwks_url:
            raise UnauthorizedError("invalid_token")
        claims = verify_rs256_jwt(token, cognito_jwks_url, cognito_issuer, cognito_audience)
        sub = claims.get("sub")
        role = claims.get("role") or _cognito_role(claims)
    else:
        if auth_mode == "cognito":
            raise UnauthorizedError("invalid_token")
        claims = verify_hs256_jwt(token, secret)
        sub = claims.get("sub")
        role = claims.get("role")

    if not isinstance(sub, str) or not isinstance(role, str):
        raise UnauthorizedError("invalid_token")
    if role not in {"admin", "agent"}:
        raise UnauthorizedError("invalid_token")
    return AuthenticatedUser(user_id=sub, role=role)


def require_roles(user: AuthenticatedUser, allowed: set[str]) -> None:
    """Ensure the user role is within the allowed set."""
    if user.role not in allowed:
        raise ForbiddenError("forbidden")
