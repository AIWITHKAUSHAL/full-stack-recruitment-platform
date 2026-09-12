"""Application (candidate submission) schemas.

The important security boundary in this file is ``ApplicationTrackingResponse``:
it is returned to an anonymous caller who knows a code and an email, so it
contains only what that candidate is entitled to see. See project rule R4.
"""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import ApplicationStatus

# Deliberately permissive: international numbers, spaces, dashes, optional "+".
PHONE_PATTERN = re.compile(r"^\+?[0-9][0-9\s\-()]{6,19}$")


class ApplicationCreate(BaseModel):
    """Submitted by a candidate. Mirrored by the React form, re-validated here —
    browser validation is a convenience, never a control (project rule R6)."""

    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)
    experience: str = Field(min_length=1, max_length=100)
    profile_url: str | None = Field(default=None, max_length=500)
    cover_note: str | None = Field(default=None, max_length=4000)

    @field_validator("name", "experience")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be blank")
        return cleaned

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str) -> str:
        cleaned = value.strip()
        if not PHONE_PATTERN.match(cleaned):
            raise ValueError("Enter a valid phone number, for example +91 98765 43210")
        return cleaned

    @field_validator("profile_url")
    @classmethod
    def _validate_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        cleaned = value.strip()
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("Profile URL must start with http:// or https://")
        return cleaned


class ApplicationCreatedResponse(BaseModel):
    """Returned once, immediately after submission. The application_code here is
    the candidate's only handle on their application from then on."""

    success: bool = True
    application_code: str
    job_title: str
    status: ApplicationStatus
    resume_uploaded: bool
    submitted_at: datetime
    message: str = (
        "Application received. Save your application code — you will need it, "
        "together with your email address, to track your status."
    )


class ApplicationTrackingResponse(BaseModel):
    """Candidate-safe view. Adding admin_notes, the database id, or anything
    about another candidate to this model is a security bug."""

    application_code: str
    job_title: str
    job_code: str
    status: ApplicationStatus
    submitted_at: datetime
    last_updated_at: datetime


class ApplicationAdminSummary(BaseModel):
    """Row in the admin applications table."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    application_code: str
    name: str
    email: EmailStr
    phone: str
    experience: str
    status: ApplicationStatus
    job_id: int
    job_title: str
    job_code: str
    has_resume: bool
    created_at: datetime
    updated_at: datetime


class ApplicationAdminDetail(ApplicationAdminSummary):
    profile_url: str | None = None
    cover_note: str | None = None
    admin_notes: str | None = None
    allowed_next_statuses: list[ApplicationStatus] = Field(
        default_factory=list,
        description="Legal transitions from the current status; the UI renders only these.",
    )


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus
    # Optional note recorded alongside the move, appended to admin_notes.
    note: str | None = Field(default=None, max_length=2000)


class ApplicationNotesUpdate(BaseModel):
    admin_notes: str = Field(max_length=8000)


class ResumeDownloadResponse(BaseModel):
    """A short-lived presigned S3 URL. The bucket itself stays private."""

    url: str
    expires_in_seconds: int
