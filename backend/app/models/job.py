"""``jobs`` table — a role the company is hiring for."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import EmploymentType

if TYPE_CHECKING:
    from app.models.application import Application


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Human-facing identifier (JOB-2026-0007). Candidates and recruiters quote
    # this, never the surrogate primary key.
    job_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # native_enum=False stores a VARCHAR + CHECK constraint instead of a
    # PostgreSQL ENUM type. Adding a value then needs no ALTER TYPE, and the
    # same model runs on SQLite in the test suite.
    employment_type: Mapped[EmploymentType] = mapped_column(
        Enum(
            EmploymentType,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        index=True,
    )

    description: Mapped[str] = mapped_column(Text, nullable=False)
    responsibilities: Mapped[str] = mapped_column(Text, nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    experience_required: Mapped[str] = mapped_column(String(100), nullable=False)

    # Controls public visibility. Deactivating is preferred over deleting once
    # applications exist, so the hiring history stays intact.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    applications: Mapped[list[Application]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        # The public careers page always filters on is_active and orders by
        # created_at; this composite index serves that exact query.
        Index("ix_jobs_active_created", "is_active", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Job {self.job_code} {self.title!r} active={self.is_active}>"
