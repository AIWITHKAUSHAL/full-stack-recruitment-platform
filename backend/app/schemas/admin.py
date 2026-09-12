"""Admin profile and dashboard-statistics schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import ApplicationStatus


class AdminProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None = None
    is_active: bool


class StatusCount(BaseModel):
    status: ApplicationStatus
    count: int


class DepartmentCount(BaseModel):
    department: str
    count: int


class RecentApplication(BaseModel):
    application_code: str
    name: str
    job_title: str
    status: ApplicationStatus
    created_at: datetime


class DashboardStats(BaseModel):
    """The four headline tiles plus a little supporting context.

    Deliberately small: this is a hiring tracker, not an analytics product.
    """

    active_jobs: int
    total_jobs: int
    total_applications: int
    interviews: int
    selected: int
    rejected: int
    applications_by_status: list[StatusCount]
    applications_by_department: list[DepartmentCount]
    recent_applications: list[RecentApplication]
