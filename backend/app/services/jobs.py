"""Job business rules.

Routes call this; this calls the repository. The rules that live here rather
than in a route handler: public visibility of inactive jobs, job-code
generation, and how a PATCH is applied.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import JobNotFoundError
from app.models.enums import EmploymentType
from app.models.job import Job
from app.repositories.jobs import JobRepository
from app.schemas.common import Paginated
from app.schemas.job import (
    AdminJobSummary,
    JobCreate,
    JobDetail,
    JobFilterOptions,
    JobSort,
    JobSummary,
    JobUpdate,
)

SUMMARY_LENGTH = 180


def _summarise(description: str) -> str:
    """Short teaser for the job card. Truncates on a word boundary."""
    text = " ".join(description.split())
    if len(text) <= SUMMARY_LENGTH:
        return text
    return text[:SUMMARY_LENGTH].rsplit(" ", 1)[0] + "…"


def _to_summary(job: Job) -> JobSummary:
    return JobSummary(
        id=job.id,
        job_code=job.job_code,
        title=job.title,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_required=job.experience_required,
        is_active=job.is_active,
        created_at=job.created_at,
        summary=_summarise(job.description),
    )


class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = JobRepository(db)

    # --------------------------------------------------------------- public --
    def list_public_jobs(
        self,
        *,
        search: str | None = None,
        department: str | None = None,
        location: str | None = None,
        employment_type: EmploymentType | None = None,
        sort: JobSort = JobSort.NEWEST,
        page: int = 1,
        page_size: int = 12,
    ) -> Paginated[JobSummary]:
        # is_active=True is hardcoded here, not taken from the caller: the public
        # endpoint must never be able to ask for inactive jobs.
        jobs, total = self.repo.list_jobs(
            search=search,
            department=department,
            location=location,
            employment_type=employment_type,
            is_active=True,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        return Paginated.build([_to_summary(job) for job in jobs], page, page_size, total)

    def get_public_job(self, job_id: int) -> JobDetail:
        """An inactive job is reported as *not found*, not as 'inactive': the
        public API should not confirm the existence of unpublished roles."""
        job = self.repo.get_by_id(job_id)
        if job is None or not job.is_active:
            raise JobNotFoundError()
        return JobDetail.model_validate(job)

    def get_filter_options(self) -> JobFilterOptions:
        return JobFilterOptions(
            departments=self.repo.distinct_departments(active_only=True),
            locations=self.repo.distinct_locations(active_only=True),
            employment_types=list(EmploymentType),
            total_active_jobs=self.repo.count(is_active=True),
        )

    # ---------------------------------------------------------------- admin --
    def list_admin_jobs(
        self,
        *,
        search: str | None = None,
        department: str | None = None,
        location: str | None = None,
        employment_type: EmploymentType | None = None,
        is_active: bool | None = None,
        sort: JobSort = JobSort.NEWEST,
        page: int = 1,
        page_size: int = 20,
    ) -> Paginated[AdminJobSummary]:
        jobs, total = self.repo.list_jobs(
            search=search,
            department=department,
            location=location,
            employment_type=employment_type,
            is_active=is_active,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        counts = self.repo.application_counts([job.id for job in jobs])
        items = [
            AdminJobSummary(**_to_summary(job).model_dump(), application_count=counts.get(job.id, 0))
            for job in jobs
        ]
        return Paginated.build(items, page, page_size, total)

    def get_admin_job(self, job_id: int) -> JobDetail:
        job = self.repo.get_by_id(job_id)
        if job is None:
            raise JobNotFoundError()
        return JobDetail.model_validate(job)

    def create_job(self, payload: JobCreate) -> JobDetail:
        job = Job(job_code=self._next_job_code(), **payload.model_dump())
        self.repo.add(job)
        self.db.commit()
        self.db.refresh(job)
        return JobDetail.model_validate(job)

    def update_job(self, job_id: int, payload: JobUpdate) -> JobDetail:
        job = self.repo.get_by_id(job_id)
        if job is None:
            raise JobNotFoundError()
        # exclude_unset means "only the fields the client actually sent",
        # which is what makes this a real PATCH rather than a partial PUT.
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(job, field, value)
        self.db.commit()
        self.db.refresh(job)
        return JobDetail.model_validate(job)

    def set_active(self, job_id: int, is_active: bool) -> JobDetail:
        """Deactivation is preferred over deletion once applications exist, so
        the hiring history and the candidate's tracking page stay intact."""
        return self.update_job(job_id, JobUpdate(is_active=is_active))

    # ------------------------------------------------------------ internals --
    def _next_job_code(self) -> str:
        """JOB-<year>-<zero padded sequence>, unique per year.

        Derived from the highest existing code for the year rather than from a
        row count, so deleting a job never causes a code to be reused.
        """
        year = datetime.now(UTC).year
        highest = self.repo.max_job_code_for_year(year)
        sequence = 1
        if highest:
            try:
                sequence = int(highest.rsplit("-", 1)[1]) + 1
            except (IndexError, ValueError):  # pragma: no cover - defensive
                sequence = self.repo.count() + 1
        return f"JOB-{year}-{sequence:04d}"
