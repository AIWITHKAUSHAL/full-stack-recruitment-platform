"""Administrator application review: list, filter, open, note, move status."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.deps import CurrentAdmin, DbSession
from app.core.config import settings
from app.core.exceptions import ResumeNotAvailableError
from app.core.security import create_download_token, verify_download_token
from app.models.enums import ApplicationStatus
from app.schemas.application import (
    ApplicationAdminDetail,
    ApplicationAdminSummary,
    ApplicationNotesUpdate,
    ApplicationStatusUpdate,
    ResumeDownloadResponse,
)
from app.schemas.common import MAX_PAGE_SIZE, Paginated
from app.services.applications import ApplicationService
from app.services.storage import resume_storage

router = APIRouter(prefix="/admin/applications", tags=["admin: applications"])

_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("", response_model=Paginated[ApplicationAdminSummary], summary="List and filter applications")
def list_applications(
    db: DbSession,
    admin: CurrentAdmin,
    search: str | None = Query(default=None, max_length=200, description="Name, email or application code"),
    job_id: int | None = Query(default=None, ge=1),
    application_status: ApplicationStatus | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
) -> Paginated[ApplicationAdminSummary]:
    return ApplicationService(db).list_for_admin(
        search=search,
        job_id=job_id,
        status=application_status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


@router.get("/{application_id}", response_model=ApplicationAdminDetail, summary="Open one application")
def get_application(application_id: int, db: DbSession, admin: CurrentAdmin) -> ApplicationAdminDetail:
    return ApplicationService(db).get_for_admin(application_id)


@router.patch(
    "/{application_id}/status",
    response_model=ApplicationAdminDetail,
    summary="Move an application along the hiring pipeline",
)
def update_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    db: DbSession,
    admin: CurrentAdmin,
) -> ApplicationAdminDetail:
    # Transition legality is decided by ApplicationStatus.can_transition, not
    # here — the route never writes to the database directly.
    return ApplicationService(db).update_status(application_id, payload.status, payload.note)


@router.patch(
    "/{application_id}/notes",
    response_model=ApplicationAdminDetail,
    summary="Replace the internal recruiter notes",
)
def update_notes(
    application_id: int,
    payload: ApplicationNotesUpdate,
    db: DbSession,
    admin: CurrentAdmin,
) -> ApplicationAdminDetail:
    return ApplicationService(db).update_notes(application_id, payload.admin_notes)


@router.get(
    "/{application_id}/resume",
    response_model=ResumeDownloadResponse,
    summary="Get a short-lived link to the candidate's resume",
)
def resume_link(application_id: int, db: DbSession, admin: CurrentAdmin) -> ResumeDownloadResponse:
    """The bucket stays private; access is always time limited.

    * S3 mode    – a presigned GET URL straight to S3.
    * local mode – a signed, single-purpose URL back to this API (below), which
                   gives students the same "expiring link" behaviour with no AWS
                   account.
    """
    _, key = ApplicationService(db).resume_reference(application_id)
    expiry = settings.resume_presign_expiry_seconds

    presigned = resume_storage.presigned_url(key)
    if presigned:
        return ResumeDownloadResponse(url=presigned, expires_in_seconds=expiry)

    token = create_download_token(application_id, expiry)
    return ResumeDownloadResponse(
        url=f"{settings.api_v1_prefix}/admin/applications/{application_id}/resume/file?token={token}",
        expires_in_seconds=expiry,
    )


@router.get(
    "/{application_id}/resume/file",
    summary="Stream a locally stored resume (local fallback only)",
    include_in_schema=False,
)
def resume_file(application_id: int, token: str, db: DbSession) -> Response:
    # No bearer dependency here on purpose: a browser following a link cannot
    # send an Authorization header. The signed token in the query string is the
    # credential, and it is valid for one application for a few minutes only.
    verify_download_token(token, application_id)

    _, key = ApplicationService(db).resume_reference(application_id)
    data = resume_storage.read_local(key)
    if data is None:
        raise ResumeNotAvailableError("The stored resume file could not be read.")

    extension = key.rsplit(".", 1)[-1].lower()
    return Response(
        content=data,
        media_type=_CONTENT_TYPES.get(extension, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="resume.{extension}"'},
    )
