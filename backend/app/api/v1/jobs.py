"""Public job endpoints — no authentication, active jobs only.

Route handlers stay thin on purpose: parse query parameters, call one service
method, return the schema (project rule R1).
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.models.enums import EmploymentType
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Paginated
from app.schemas.job import JobDetail, JobFilterOptions, JobSort, JobSummary
from app.services.jobs import JobService

router = APIRouter(prefix="/jobs", tags=["jobs (public)"])


@router.get(
    "",
    response_model=Paginated[JobSummary],
    summary="List active job openings with search, filters, sorting and pagination",
)
def list_jobs(
    db: DbSession,
    search: str | None = Query(default=None, max_length=200, description="Free text across title, description, skills"),
    department: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=100),
    employment_type: EmploymentType | None = Query(default=None),
    sort: JobSort = Query(default=JobSort.NEWEST),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> Paginated[JobSummary]:
    # Filtering and pagination happen in SQL, not in the browser: the API must
    # never return the whole table and let React sort it out.
    return JobService(db).list_public_jobs(
        search=search,
        department=department,
        location=location,
        employment_type=employment_type,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/filters",
    response_model=JobFilterOptions,
    summary="Filter dropdown values and the active-job count for the careers hero",
)
def job_filters(db: DbSession) -> JobFilterOptions:
    # Declared before /{job_id} so "filters" is never parsed as an id.
    return JobService(db).get_filter_options()


@router.get("/{job_id}", response_model=JobDetail, summary="Full detail of one active job")
def get_job(job_id: int, db: DbSession) -> JobDetail:
    return JobService(db).get_public_job(job_id)
