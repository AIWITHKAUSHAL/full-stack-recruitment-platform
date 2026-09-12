"""Password hashing and JWT issuing/verification.

Why JWT: the admin UI is a static React bundle served from CloudFront, so there
is no server-side session store to talk to. A short-lived signed bearer token
lets any ECS task validate the caller without shared state — which is also what
makes the backend horizontally scalable.

Why bcrypt (used directly, not via passlib): it is a maintained, single-purpose
library with an adaptive cost factor. Plaintext passwords are never stored.
"""

from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

# bcrypt silently truncates anything past 72 bytes; reject instead of surprising.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise ValueError("Password must be at most 72 bytes")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # A malformed stored hash must read as "wrong password", never as a 500.
        return False


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """Issue an HS256 token carrying sub / iat / exp."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Return the claims, or raise UnauthorizedError. Never logs the token."""
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Your session has expired. Please sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid authentication token.") from exc


# Ambiguous characters (0/O, 1/I) are excluded so a candidate can read the code
# off a screen and type it back without support tickets.
_CODE_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")


def random_code(length: int = 6) -> str:
    """Cryptographically random, human-readable suffix for public codes."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


# --------------------------------------------------------------------------
# Short-lived resume download tokens.
#
# In AWS mode the backend hands the admin a presigned S3 URL. Locally there is
# no S3, so the same user experience ("open this link, it stops working in a few
# minutes") is reproduced with a signed, single-purpose, short-lived token in
# the query string. A browser opening a link cannot send an Authorization
# header, which is exactly why both mechanisms put the credential in the URL.
# --------------------------------------------------------------------------
DOWNLOAD_TOKEN_PURPOSE = "resume-download"


def create_download_token(application_id: int, expires_in_seconds: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": f"application:{application_id}",
        "purpose": DOWNLOAD_TOKEN_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_download_token(token: str, application_id: int) -> None:
    claims = decode_access_token(token)
    if claims.get("purpose") != DOWNLOAD_TOKEN_PURPOSE:
        raise UnauthorizedError("This link is not valid for downloading a resume.")
    if claims.get("sub") != f"application:{application_id}":
        raise UnauthorizedError("This link does not belong to that application.")
