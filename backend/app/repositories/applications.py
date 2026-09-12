"""Application persistence."""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.application import Application
from app.models.enums import ApplicationStatus
from app.models.job import Job


class ApplicationRepository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------- reads ----
    def get_by_id(self, application_id: int) -> Application | None:
        stmt = (
            select(Application)
            .options(joinedload(Application.job))
            .where(Application.id == application_id)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_code_and_email(self, application_code: str, email: str) -> Application | None:
        """Tracking lookup. BOTH the code and the email must match — the code
        alone is not enough, so a leaked code does not expose a candidate."""
        stmt = (
            select(Application)
            .options(joinedload(Application.job))
            .where(
                Application.application_code == application_code.strip().upper(),
                func.lower(Application.email) == email.strip().lower(),
            )
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def code_exists(self, application_code: str) -> bool:
        stmt = select(func.count(Application.id)).where(
            Application.application_code == application_code
        )
        return self.db.execute(stmt).scalar_one() > 0

    def find_live_application(self, job_id: int, email: str) -> Application | None:
        """A non-rejected application by this email for this job, if any.

        Backs the duplicate-application business rule. The database enforces the
        same thing with a partial unique index, as a backstop against races.
        """
        stmt = select(Application).where(
            Application.job_id == job_id,
            func.lower(Application.email) == email.strip().lower(),
            Application.status != ApplicationStatus.REJECTED,
        )
        return self.db.execute(stmt).scalars().first()

    def _apply_filters(
        self,
        stmt: Select,
        *,
        search: str | None,
        job_id: int | None,
        status: ApplicationStatus | None,
        date_from: date | None,
        date_to: date | None,
    ) -> Select:
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Application.name.ilike(pattern),
                    Application.email.ilike(pattern),
                    Application.application_code.ilike(pattern),
                )
            )
        if job_id:
            stmt = stmt.where(Application.job_id == job_id)
        if status:
            stmt = stmt.where(Application.status == status)
        if date_from:
            stmt = stmt.where(Application.created_at >= datetime.combine(date_from, time.min))
        if date_to:
            stmt = stmt.where(Application.created_at <= datetime.combine(date_to, time.max))
        return stmt

    def list_applications(
        self,
        *,
        search: str | None = None,
        job_id: int | None = None,
        status: ApplicationStatus | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Application], int]:
        filters = {
            "search": search,
            "job_id": job_id,
            "status": status,
            "date_from": date_from,
            "date_to": date_to,
        }

        total = self.db.execute(
            self._apply_filters(select(func.count(Application.id)), **filters)
        ).scalar_one()

        stmt = self._apply_filters(select(Application), **filters)
        stmt = (
            stmt.options(joinedload(Application.job))
            .order_by(Application.created_at.desc(), Application.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(self.db.execute(stmt).scalars().all()), total

    # ------------------------------------------------- dashboard aggregates --
    def count(self, *, status: ApplicationStatus | None = None) -> int:
        stmt = select(func.count(Application.id))
        if status:
            stmt = stmt.where(Application.status == status)
        return self.db.execute(stmt).scalar_one()

    def count_by_status(self) -> dict[ApplicationStatus, int]:
        stmt = select(Application.status, func.count(Application.id)).group_by(Application.status)
        return dict(self.db.execute(stmt).all())

    def count_by_department(self) -> list[tuple[str, int]]:
        stmt = (
            select(Job.department, func.count(Application.id))
            .join(Job, Job.id == Application.job_id)
            .group_by(Job.department)
            .order_by(func.count(Application.id).desc())
        )
        return list(self.db.execute(stmt).all())

    def recent(self, limit: int = 5) -> list[Application]:
        stmt = (
            select(Application)
            .options(joinedload(Application.job))
            .order_by(Application.created_at.desc(), Application.id.desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())

    # ------------------------------------------------------------ writes ----
    def add(self, application: Application) -> Application:
        self.db.add(application)
        self.db.flush()
        return application
