from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


class UnauthorizedError(Exception):
    pass


class ForbiddenError(Exception):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    role: str

    def is_admin(self) -> bool:
        return self.role == "admin"

    def is_agent(self) -> bool:
        return self.role == "agent"


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * ((4 - (len(segment) % 4)) % 4)
    return base64.urlsafe_b64decode((segment + padding).encode("ascii"))


def verify_hs256_jwt(token: str, secret: str) -> dict[str, Any]:
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


def require_bearer_user(authorization: str | None, secret: str) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("missing_bearer")
    token = authorization.removeprefix("Bearer ").strip()
    claims = verify_hs256_jwt(token, secret)
    sub = claims.get("sub")
    role = claims.get("role")
    if not isinstance(sub, str) or not isinstance(role, str):
        raise UnauthorizedError("invalid_token")
    if role not in {"admin", "agent"}:
        raise UnauthorizedError("invalid_token")
    return AuthenticatedUser(user_id=sub, role=role)


def require_roles(user: AuthenticatedUser, allowed: set[str]) -> None:
    if user.role not in allowed:
        raise ForbiddenError("forbidden")
