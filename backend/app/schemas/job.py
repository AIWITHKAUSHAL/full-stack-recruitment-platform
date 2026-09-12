"""Job request/response schemas.

Two distinct public shapes on purpose:

* ``JobSummary`` — what the careers-page card needs (small, cheap, no full text)
* ``JobDetail``  — the whole posting, returned only from the detail endpoint
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import EmploymentType


class JobSort(str, Enum):
    NEWEST = "newest"
    OLDEST = "oldest"
    TITLE_ASC = "title_asc"
    TITLE_DESC = "title_desc"


class JobSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_code: str
    title: str
    department: str
    location: str
    employment_type: EmploymentType
    experience_required: str
    is_active: bool
    created_at: datetime
    summary: str = Field(description="First ~180 characters of the description, for the card")


class JobDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_code: str
    title: str
    department: str
    location: str
    employment_type: EmploymentType
    description: str
    responsibilities: str
    skills: str
    experience_required: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AdminJobSummary(JobSummary):
    """Admin list rows additionally show how many people applied."""

    application_count: int = 0


class JobCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    department: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=100)
    employment_type: EmploymentType
    description: str = Field(min_length=20)
    responsibilities: str = Field(min_length=10)
    skills: str = Field(min_length=2)
    experience_required: str = Field(min_length=1, max_length=100)
    is_active: bool = True

    @field_validator("title", "department", "location", "experience_required")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class JobUpdate(BaseModel):
    """PATCH body — every field optional, only supplied fields are applied."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    department: str | None = Field(default=None, min_length=2, max_length=100)
    location: str | None = Field(default=None, min_length=2, max_length=100)
    employment_type: EmploymentType | None = None
    description: str | None = Field(default=None, min_length=20)
    responsibilities: str | None = Field(default=None, min_length=10)
    skills: str | None = Field(default=None, min_length=2)
    experience_required: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class JobFilterOptions(BaseModel):
    """Powers the careers-page filter dropdowns without hardcoding them in React."""

    departments: list[str]
    locations: list[str]
    employment_types: list[EmploymentType]
    total_active_jobs: int
