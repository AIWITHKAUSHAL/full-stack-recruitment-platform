"""Administrator job management. Every route requires a valid admin token."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentAdmin, DbSession
from app.models.enums import EmploymentType
from app.schemas.common import MAX_PAGE_SIZE, Paginated
from app.schemas.job import (
    AdminJobSummary,
    JobCreate,
    JobDetail,
    JobSort,
    JobUpdate,
)
from app.services.jobs import JobService

router = APIRouter(prefix="/admin/jobs", tags=["admin: jobs"])


@router.get("", response_model=Paginated[AdminJobSummary], summary="List all jobs, active or not")
def list_jobs(
    db: DbSession,
    admin: CurrentAdmin,
    search: str | None = Query(default=None, max_length=200),
    department: str | None = Query(default=None, max_length=100),
    location: str | None = Query(default=None, max_length=100),
    employment_type: EmploymentType | None = Query(default=None),
    is_active: bool | None = Query(default=None, description="Omit for both active and inactive"),
    sort: JobSort = Query(default=JobSort.NEWEST),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
) -> Paginated[AdminJobSummary]:
    return JobService(db).list_admin_jobs(
        search=search,
        department=department,
        location=location,
        employment_type=employment_type,
        is_active=is_active,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/{job_id}", response_model=JobDetail, summary="One job, including inactive ones")
def get_job(job_id: int, db: DbSession, admin: CurrentAdmin) -> JobDetail:
    return JobService(db).get_admin_job(job_id)


@router.post("", response_model=JobDetail, status_code=status.HTTP_201_CREATED, summary="Create a job")
def create_job(payload: JobCreate, db: DbSession, admin: CurrentAdmin) -> JobDetail:
    # The job_code is generated server-side; clients cannot choose it.
    return JobService(db).create_job(payload)


@router.patch("/{job_id}", response_model=JobDetail, summary="Update any subset of a job's fields")
def update_job(job_id: int, payload: JobUpdate, db: DbSession, admin: CurrentAdmin) -> JobDetail:
    return JobService(db).update_job(job_id, payload)


@router.patch("/{job_id}/activate", response_model=JobDetail, summary="Publish a job")
def activate_job(job_id: int, db: DbSession, admin: CurrentAdmin) -> JobDetail:
    return JobService(db).set_active(job_id, True)


@router.patch("/{job_id}/deactivate", response_model=JobDetail, summary="Close a job to new applicants")
def deactivate_job(job_id: int, db: DbSession, admin: CurrentAdmin) -> JobDetail:
    # Deliberately no DELETE endpoint: deactivation preserves the applications
    # and the candidates' tracking pages (CLAUDE.md §20).
    return JobService(db).set_active(job_id, False)
