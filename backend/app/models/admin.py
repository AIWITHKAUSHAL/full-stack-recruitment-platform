"""``admins`` table — the recruiter accounts allowed into the admin API."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Admin(Base, TimestampMixin):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    # bcrypt hash only. There is no column that could hold a plaintext password.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    full_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Deactivating beats deleting: tokens stop working immediately at the next
    # request because get_current_admin re-reads the row.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Admin {self.email} active={self.is_active}>"
