"""Administrator authentication.

Why this is a service and not inline in the route: "is this person allowed in"
is a business decision (is the account active? is the password right? how long
does the token live?), and the same rules are needed by the seed script.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AdminNotFoundError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.admin import Admin
from app.repositories.admins import AdminRepository
from app.schemas.auth import TokenResponse

logger = get_logger("app.auth")


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AdminRepository(db)

    def login(self, email: str, password: str) -> TokenResponse:
        admin = self.repo.get_by_email(email)

        # The same generic message for "no such account", "wrong password" and
        # "deactivated account": a login form must not double as a way to find
        # out which email addresses are registered.
        if admin is None or not verify_password(password, admin.password_hash) or not admin.is_active:
            # Logs the attempt without the password and without the token.
            logger.warning(
                "admin login failed",
                extra={"extra_fields": {"email_domain": email.split("@")[-1] if "@" in email else "-"}},
            )
            raise UnauthorizedError("Incorrect email address or password.")

        token = create_access_token(subject=str(admin.id), extra_claims={"email": admin.email})
        logger.info("admin login succeeded", extra={"extra_fields": {"admin_id": admin.id}})
        return TokenResponse(
            access_token=token,
            expires_in_seconds=settings.jwt_expire_minutes * 60,
            admin_email=admin.email,
        )

    def resolve_admin_from_token(self, token: str) -> Admin:
        """Used by the ``get_current_admin`` dependency on every admin request.

        The database row is re-read on each request rather than trusted from the
        token, so deactivating an administrator takes effect immediately instead
        of when their token happens to expire.
        """
        claims = decode_access_token(token)
        subject = claims.get("sub")
        if not subject:
            raise UnauthorizedError("Invalid authentication token.")
        try:
            admin_id = int(subject)
        except (TypeError, ValueError) as exc:
            raise UnauthorizedError("Invalid authentication token.") from exc

        admin = self.repo.get_by_id(admin_id)
        if admin is None or not admin.is_active:
            raise UnauthorizedError("This administrator account is no longer active.")
        return admin

    def ensure_admin(self, email: str, password: str, full_name: str | None = None) -> tuple[Admin, bool]:
        """Idempotent bootstrap used by the seed script.

        Returns ``(admin, created)``. An existing admin's password is left alone
        so re-running the seed never resets a changed password.
        """
        existing = self.repo.get_by_email(email)
        if existing is not None:
            return existing, False
        admin = Admin(
            email=email.strip().lower(),
            password_hash=hash_password(password),
            full_name=full_name,
            is_active=True,
        )
        self.repo.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        return admin, True

    def reset_password(self, email: str, new_password: str) -> Admin:
        """Operator recovery for a forgotten or mistyped bootstrap password.

        Exists because the database is private and there is no self-service
        "forgot password" flow: without this, a lost admin password could only
        be fixed with hand-written SQL. Deliberately *not* reachable over HTTP —
        only the seed script calls it, run by someone who already has AWS access.
        """
        admin = self.repo.get_by_email(email)
        if admin is None:
            raise AdminNotFoundError(f"No administrator is registered as {email}.")
        admin.password_hash = hash_password(new_password)
        self.db.commit()
        # The admin id only — never the email/password pair.
        logger.info("admin password reset", extra={"extra_fields": {"admin_id": admin.id}})
        return admin
