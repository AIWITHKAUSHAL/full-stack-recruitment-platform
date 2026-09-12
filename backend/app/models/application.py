"""``applications`` table — one candidate's submission against one job."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import ApplicationStatus

if TYPE_CHECKING:
    from app.models.job import Job


class Application(Base, TimestampMixin):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # The candidate-facing tracking code (APP-2026-K9P4R2). Deliberately not the
    # primary key: sequential ids would let anyone enumerate other people's
    # applications.
    application_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )

    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Stored lower-cased by the service so tracking lookups are case-insensitive.
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    experience: Mapped[str] = mapped_column(String(100), nullable=False)
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Only the S3 object key lives here (resumes/APP-2026-XXXX/resume.pdf).
    # The binary belongs in S3 — see RESTRICTIONS.md #23.
    resume_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    cover_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(
            ApplicationStatus,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ApplicationStatus.APPLIED,
        server_default=ApplicationStatus.APPLIED.value,
        index=True,
    )

    # Internal recruiter notes. NEVER returned by any public endpoint.
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[Job] = relationship(back_populates="applications")

    __table_args__ = (
        # Admin "applications for job X in status Y" is the hot query.
        Index("ix_applications_job_status", "job_id", "status"),
        Index("ix_applications_created_at", "created_at"),
        # Business rule, enforced by the database as well as the service layer:
        # one *live* application per (job, email). A rejected candidate may
        # re-apply later, so REJECTED rows are excluded from the constraint.
        Index(
            "uq_applications_job_email_active",
            "job_id",
            "email",
            unique=True,
            postgresql_where=text("status <> 'REJECTED'"),
            sqlite_where=text("status <> 'REJECTED'"),
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Application {self.application_code} job={self.job_id} status={self.status}>"
