"""Public application endpoints: submit an application, track an application."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from pydantic import ValidationError as PydanticValidationError

from app.api.deps import DbSession
from app.core.config import settings
from app.core.exceptions import ResumeTooLargeError, ValidationError
from app.schemas.application import (
    ApplicationCreate,
    ApplicationCreatedResponse,
    ApplicationTrackingResponse,
)
from app.services.applications import ApplicationService

router = APIRouter(tags=["applications (public)"])

# Read in chunks so an oversized upload is rejected without first buffering the
# whole thing in the task's 512 MB of memory.
_CHUNK = 64 * 1024


async def _read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    buffer = bytearray()
    while chunk := await upload.read(_CHUNK):
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise ResumeTooLargeError(
                f"Resume exceeds the maximum allowed size of {max_bytes / (1024 * 1024):.0f} MB."
            )
    return bytes(buffer)


@router.post(
    "/jobs/{job_id}/applications",
    response_model=ApplicationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an application (multipart/form-data, resume optional)",
)
async def submit_application(
    job_id: int,
    db: DbSession,
    # Declared as form fields rather than a JSON body so the optional resume can
    # travel in the same request. The values are handed straight to the Pydantic
    # model below, so validation is identical either way.
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    experience: str = Form(...),
    profile_url: str | None = Form(default=None),
    cover_note: str | None = Form(default=None),
    resume: UploadFile | None = File(default=None),
) -> ApplicationCreatedResponse:
    try:
        payload = ApplicationCreate(
            name=name,
            email=email,
            phone=phone,
            experience=experience,
            profile_url=profile_url,
            cover_note=cover_note,
        )
    except PydanticValidationError as exc:
        # Re-raised as our own error type so the response matches the standard
        # envelope, with per-field details the React form can display.
        raise ValidationError(
            "Please correct the highlighted fields.",
            details={
                "fields": {
                    ".".join(str(part) for part in error["loc"]): error["msg"]
                    for error in exc.errors()
                }
            },
        ) from exc

    resume_tuple = None
    # An HTML form with an empty file input still sends a part with no filename.
    if resume is not None and resume.filename:
        data = await _read_upload(resume, settings.resume_max_bytes)
        resume_tuple = (resume.filename, resume.content_type, data)

    return ApplicationService(db).submit(job_id, payload, resume_tuple)


@router.get(
    "/applications/track",
    response_model=ApplicationTrackingResponse,
    summary="Track an application with its code and the email address used to apply",
)
def track_application(
    db: DbSession,
    application_code: str = Query(min_length=4, max_length=32, examples=["APP-2026-K9P4R2"]),
    email: str = Query(min_length=3, max_length=255),
) -> ApplicationTrackingResponse:
    # Both values are required: the code alone never reveals a candidate.
    return ApplicationService(db).track(application_code, email)
