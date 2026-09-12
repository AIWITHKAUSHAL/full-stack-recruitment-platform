"""Job persistence.

Why a repository layer: every SQLAlchemy ``select()`` in this application lives
under ``app/repositories/``. Services express intent ("give me active jobs
matching these filters"), repositories express SQL. That separation is what lets
the test suite run against SQLite while production runs on PostgreSQL, and it
keeps query tuning in one reviewable place.
"""

from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.enums import EmploymentType
from app.models.job import Job
from app.schemas.job import JobSort


class JobRepository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------- reads ----
    def get_by_id(self, job_id: int) -> Job | None:
        return self.db.get(Job, job_id)

    def get_by_code(self, job_code: str) -> Job | None:
        return self.db.execute(select(Job).where(Job.job_code == job_code)).scalar_one_or_none()

    def _apply_filters(
        self,
        stmt: Select,
        *,
        search: str | None,
        department: str | None,
        location: str | None,
        employment_type: EmploymentType | None,
        is_active: bool | None,
    ) -> Select:
        if is_active is not None:
            stmt = stmt.where(Job.is_active.is_(is_active))
        if search:
            # ILIKE is PostgreSQL; SQLAlchemy's .ilike() emits LOWER(...) LIKE on
            # SQLite, so the same code works in tests. The parameter is bound,
            # never interpolated — no SQL injection surface.
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Job.title.ilike(pattern),
                    Job.description.ilike(pattern),
                    Job.skills.ilike(pattern),
                    Job.department.ilike(pattern),
                    Job.job_code.ilike(pattern),
                )
            )
        if department:
            stmt = stmt.where(Job.department == department)
        if location:
            stmt = stmt.where(Job.location == location)
        if employment_type:
            stmt = stmt.where(Job.employment_type == employment_type)
        return stmt

    @staticmethod
    def _apply_sort(stmt: Select, sort: JobSort) -> Select:
        ordering = {
            JobSort.NEWEST: (Job.created_at.desc(), Job.id.desc()),
            JobSort.OLDEST: (Job.created_at.asc(), Job.id.asc()),
            JobSort.TITLE_ASC: (Job.title.asc(),),
            JobSort.TITLE_DESC: (Job.title.desc(),),
        }[sort]
        return stmt.order_by(*ordering)

    def list_jobs(
        self,
        *,
        search: str | None = None,
        department: str | None = None,
        location: str | None = None,
        employment_type: EmploymentType | None = None,
        is_active: bool | None = True,
        sort: JobSort = JobSort.NEWEST,
        page: int = 1,
        page_size: int = 12,
    ) -> tuple[list[Job], int]:
        """Returns (page of jobs, total matching rows)."""
        filters = {
            "search": search,
            "department": department,
            "location": location,
            "employment_type": employment_type,
            "is_active": is_active,
        }

        count_stmt = self._apply_filters(select(func.count(Job.id)), **filters)
        total = self.db.execute(count_stmt).scalar_one()

        stmt = self._apply_filters(select(Job), **filters)
        stmt = self._apply_sort(stmt, sort).offset((page - 1) * page_size).limit(page_size)
        jobs = list(self.db.execute(stmt).scalars().all())
        return jobs, total

    def application_counts(self, job_ids: list[int]) -> dict[int, int]:
        """One grouped query for the admin job list — avoids N+1 counting."""
        if not job_ids:
            return {}
        stmt = (
            select(Application.job_id, func.count(Application.id))
            .where(Application.job_id.in_(job_ids))
            .group_by(Application.job_id)
        )
        return dict(self.db.execute(stmt).all())

    def distinct_departments(self, *, active_only: bool = True) -> list[str]:
        stmt = select(Job.department).distinct().order_by(Job.department)
        if active_only:
            stmt = stmt.where(Job.is_active.is_(True))
        return [row for row in self.db.execute(stmt).scalars().all() if row]

    def distinct_locations(self, *, active_only: bool = True) -> list[str]:
        stmt = select(Job.location).distinct().order_by(Job.location)
        if active_only:
            stmt = stmt.where(Job.is_active.is_(True))
        return [row for row in self.db.execute(stmt).scalars().all() if row]

    def count(self, *, is_active: bool | None = None) -> int:
        stmt = select(func.count(Job.id))
        if is_active is not None:
            stmt = stmt.where(Job.is_active.is_(is_active))
        return self.db.execute(stmt).scalar_one()

    def max_job_code_for_year(self, year: int) -> str | None:
        prefix = f"JOB-{year}-"
        stmt = (
            select(func.max(Job.job_code))
            .where(Job.job_code.like(f"{prefix}%"))
        )
        return self.db.execute(stmt).scalar_one_or_none()

    # ------------------------------------------------------------ writes ----
    def add(self, job: Job) -> Job:
        """Adds and flushes so the caller sees the generated id; the service commits."""
        self.db.add(job)
        self.db.flush()
        return job
