"""Dashboard statistics.

Kept deliberately small: four headline tiles plus a little context. Building a
full analytics product here would add queries, indexes and cost for no teaching
value (project rule R9).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import ApplicationStatus
from app.repositories.applications import ApplicationRepository
from app.repositories.jobs import JobRepository
from app.schemas.admin import (
    DashboardStats,
    DepartmentCount,
    RecentApplication,
    StatusCount,
)


class DashboardService:
    def __init__(self, db: Session):
        self.jobs = JobRepository(db)
        self.applications = ApplicationRepository(db)

    def stats(self) -> DashboardStats:
        by_status = self.applications.count_by_status()
        return DashboardStats(
            active_jobs=self.jobs.count(is_active=True),
            total_jobs=self.jobs.count(),
            total_applications=self.applications.count(),
            interviews=by_status.get(ApplicationStatus.INTERVIEW, 0),
            selected=by_status.get(ApplicationStatus.SELECTED, 0),
            rejected=by_status.get(ApplicationStatus.REJECTED, 0),
            # Every status is present even when its count is zero, so the UI
            # renders a stable set of bars instead of a shifting layout.
            applications_by_status=[
                StatusCount(status=status, count=by_status.get(status, 0))
                for status in ApplicationStatus
            ],
            applications_by_department=[
                DepartmentCount(department=department, count=count)
                for department, count in self.applications.count_by_department()
            ],
            recent_applications=[
                RecentApplication(
                    application_code=a.application_code,
                    name=a.name,
                    job_title=a.job.title,
                    status=a.status,
                    created_at=a.created_at,
                )
                for a in self.applications.recent(limit=6)
            ],
        )
