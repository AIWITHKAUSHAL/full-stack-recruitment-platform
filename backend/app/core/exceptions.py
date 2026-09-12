"""Application error types and the single error-response envelope.

Why this exists: a REST API that returns a different error shape from every
route is painful to consume and impossible to handle generically in the React
client. Every failure in this backend becomes an ``AppError`` with a stable
machine-readable ``code``, and one exception handler renders it.

Never put a stack trace, a SQL statement, a credential or another candidate's
data into ``message`` — it is returned to anonymous internet callers.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for every expected failure in the application."""

    status_code: int = 400
    code: str = "APP_ERROR"
    message: str = "The request could not be completed."

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None):
        self.message = message or self.message
        self.details = details or {}
        super().__init__(self.message)


# ------------------------------------------------------------------- jobs ---
class JobNotFoundError(AppError):
    status_code = 404
    code = "JOB_NOT_FOUND"
    message = "The requested job was not found."


class JobInactiveError(AppError):
    status_code = 409
    code = "JOB_INACTIVE"
    message = "This job is no longer accepting applications."


# ----------------------------------------------------------- applications ---
class ApplicationNotFoundError(AppError):
    status_code = 404
    code = "APPLICATION_NOT_FOUND"
    message = "No application matches that application code and email address."


class DuplicateApplicationError(AppError):
    status_code = 409
    code = "DUPLICATE_APPLICATION"
    message = "You have already applied to this job with this email address."


class InvalidApplicationStatusError(AppError):
    status_code = 422
    code = "INVALID_APPLICATION_STATUS"
    message = "That application status is not recognised."


class InvalidStatusTransitionError(AppError):
    status_code = 409
    code = "INVALID_STATUS_TRANSITION"
    message = "That hiring-pipeline transition is not allowed."


# ---------------------------------------------------------------- resumes ---
class InvalidResumeError(AppError):
    status_code = 422
    code = "INVALID_RESUME"
    message = "Resume must be a PDF, DOC or DOCX file."


class ResumeTooLargeError(AppError):
    status_code = 413
    code = "RESUME_TOO_LARGE"
    message = "Resume exceeds the maximum allowed size of 5 MB."


class ResumeNotAvailableError(AppError):
    status_code = 404
    code = "RESUME_NOT_AVAILABLE"
    message = "No resume was uploaded for this application."


# ------------------------------------------------------------------- auth ---
class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Authentication is required or the credentials are invalid."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


# ----------------------------------------------------------------- generic ---
class ValidationError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "The submitted data is not valid."


class DatabaseError(AppError):
    status_code = 503
    code = "DATABASE_ERROR"
    message = "The database is currently unavailable."


class InternalError(AppError):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "An unexpected error occurred."


def error_body(code: str, message: str, request_id: str, details: dict | None = None) -> dict:
    """The one and only error envelope used by this API."""
    body: dict[str, Any] = {
        "success": False,
        "error": {"code": code, "message": message},
        "request_id": request_id,
    }
    if details:
        body["error"]["details"] = details
    return body
