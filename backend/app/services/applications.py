"""Candidate application business rules.

Everything that makes this an applicant *tracking* system rather than a form
dump lives here: tracking-code generation, the duplicate-application rule, the
hiring pipeline transitions, and what a candidate is allowed to see.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ApplicationNotFoundError,
    DuplicateApplicationError,
    InvalidStatusTransitionError,
    JobInactiveError,
    JobNotFoundError,
    ResumeNotAvailableError,
)
from app.core.logging import get_logger
from app.core.security import random_code
from app.models.application import Application
from app.models.enums import ApplicationStatus
from app.repositories.applications import ApplicationRepository
from app.repositories.jobs import JobRepository
from app.schemas.application import (
    ApplicationAdminDetail,
    ApplicationAdminSummary,
    ApplicationCreate,
    ApplicationCreatedResponse,
    ApplicationTrackingResponse,
)
from app.schemas.common import Paginated
from app.services.storage import resume_storage

logger = get_logger("app.applications")

MAX_CODE_ATTEMPTS = 5


class ApplicationService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ApplicationRepository(db)
        self.jobs = JobRepository(db)

    # ------------------------------------------------------------ candidate --
    def submit(
        self,
        job_id: int,
        payload: ApplicationCreate,
        resume: tuple[str, str | None, bytes] | None = None,
    ) -> ApplicationCreatedResponse:
        """Create an application, optionally storing a resume in S3.

        ``resume`` is ``(filename, content_type, data)``; the route reads the
        bytes so that the size limit is enforced on what actually arrived.
        """
        job = self.jobs.get_by_id(job_id)
        if job is None:
            raise JobNotFoundError()
        if not job.is_active:
            # A job that exists but is closed gets an explicit, honest error —
            # unlike the detail endpoint, the candidate already knows it exists.
            raise JobInactiveError()

        email = str(payload.email).strip().lower()

        # Business rule: one live application per (job, email). A previously
        # rejected candidate is allowed to apply again.
        if self.repo.find_live_application(job.id, email) is not None:
            raise DuplicateApplicationError()

        application = Application(
            application_code=self._generate_application_code(),
            job_id=job.id,
            name=payload.name,
            email=email,
            phone=payload.phone,
            experience=payload.experience,
            profile_url=payload.profile_url,
            cover_note=payload.cover_note,
            status=ApplicationStatus.APPLIED,
        )

        # The resume is validated and uploaded before the row is committed, so a
        # rejected file never leaves a half-created application behind.
        if resume is not None:
            filename, content_type, data = resume
            stored = resume_storage.store(application.application_code, filename, content_type, data)
            application.resume_key = stored.key

        self.repo.add(application)
        try:
            self.db.commit()
        except IntegrityError as exc:
            # The partial unique index caught a race between two concurrent
            # submissions from the same candidate.
            self.db.rollback()
            raise DuplicateApplicationError() from exc

        self.db.refresh(application)
        logger.info(
            "application submitted",
            extra={
                "extra_fields": {
                    "application_code": application.application_code,
                    "job_code": job.job_code,
                    "resume": bool(application.resume_key),
                }
            },
        )
        return ApplicationCreatedResponse(
            application_code=application.application_code,
            job_title=job.title,
            status=application.status,
            resume_uploaded=bool(application.resume_key),
            submitted_at=application.created_at,
        )

    def track(self, application_code: str, email: str) -> ApplicationTrackingResponse:
        """Code **and** email must both match, and the response is deliberately
        minimal (project rule R4). A wrong email returns the same 404 as an
        unknown code, so the endpoint cannot be used to test whether a code
        exists."""
        application = self.repo.get_by_code_and_email(application_code, email)
        if application is None:
            raise ApplicationNotFoundError()
        return ApplicationTrackingResponse(
            application_code=application.application_code,
            job_title=application.job.title,
            job_code=application.job.job_code,
            status=application.status,
            submitted_at=application.created_at,
            last_updated_at=application.updated_at,
        )

    # ---------------------------------------------------------------- admin --
    def list_for_admin(
        self,
        *,
        search: str | None = None,
        job_id: int | None = None,
        status: ApplicationStatus | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Paginated[ApplicationAdminSummary]:
        applications, total = self.repo.list_applications(
            search=search,
            job_id=job_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )
        items = [self._to_admin_summary(a) for a in applications]
        return Paginated.build(items, page, page_size, total)

    def get_for_admin(self, application_id: int) -> ApplicationAdminDetail:
        application = self._get_or_404(application_id)
        return ApplicationAdminDetail(
            **self._to_admin_summary(application).model_dump(),
            profile_url=application.profile_url,
            cover_note=application.cover_note,
            admin_notes=application.admin_notes,
            allowed_next_statuses=ApplicationStatus.next_statuses(application.status),
        )

    def update_status(
        self, application_id: int, target: ApplicationStatus, note: str | None = None
    ) -> ApplicationAdminDetail:
        application = self._get_or_404(application_id)
        current = application.status

        # The single implementation of the pipeline rules (project rule R3).
        if not ApplicationStatus.can_transition(current, target):
            allowed = ApplicationStatus.next_statuses(current)
            allowed_text = ", ".join(s.value for s in allowed) or "no further transitions"
            raise InvalidStatusTransitionError(
                f"Cannot move an application from {current.value} to {target.value}. "
                f"Allowed from {current.value}: {allowed_text}."
            )

        application.status = target
        if note and note.strip():
            application.admin_notes = self._append_note(
                application.admin_notes, f"[{current.value} → {target.value}] {note.strip()}"
            )
        self.db.commit()
        self.db.refresh(application)
        logger.info(
            "application status changed",
            extra={
                "extra_fields": {
                    "application_code": application.application_code,
                    "from": current.value,
                    "to": target.value,
                }
            },
        )
        return self.get_for_admin(application_id)

    def update_notes(self, application_id: int, notes: str) -> ApplicationAdminDetail:
        application = self._get_or_404(application_id)
        application.admin_notes = notes
        self.db.commit()
        return self.get_for_admin(application_id)

    def resume_reference(self, application_id: int) -> tuple[Application, str]:
        application = self._get_or_404(application_id)
        if not application.resume_key:
            raise ResumeNotAvailableError()
        return application, application.resume_key

    # ------------------------------------------------------------ internals --
    def _get_or_404(self, application_id: int) -> Application:
        application = self.repo.get_by_id(application_id)
        if application is None:
            raise ApplicationNotFoundError("No application with that id exists.")
        return application

    @staticmethod
    def _to_admin_summary(application: Application) -> ApplicationAdminSummary:
        return ApplicationAdminSummary(
            id=application.id,
            application_code=application.application_code,
            name=application.name,
            email=application.email,
            phone=application.phone,
            experience=application.experience,
            status=application.status,
            job_id=application.job_id,
            job_title=application.job.title,
            job_code=application.job.job_code,
            has_resume=bool(application.resume_key),
            created_at=application.created_at,
            updated_at=application.updated_at,
        )

    @staticmethod
    def _append_note(existing: str | None, addition: str) -> str:
        stamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        line = f"{stamp} {addition}"
        return f"{existing}\n{line}" if existing else line

    def _generate_application_code(self) -> str:
        """``APP-2026-K9P4R2`` — unguessable enough to be a bearer-style handle.

        Sequential database ids are never exposed: they would let anyone walk
        every candidate's application.
        """
        year = datetime.now(UTC).year
        for _ in range(MAX_CODE_ATTEMPTS):
            candidate = f"APP-{year}-{random_code(6)}"
            if not self.repo.code_exists(candidate):
                return candidate
        # 5 collisions on a 32^6 space means something is very wrong; fall back
        # to a longer code rather than failing the candidate's submission.
        return f"APP-{year}-{random_code(10)}"
