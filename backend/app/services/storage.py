"""Resume storage.

Why S3 and not a database column: resumes are large binary blobs that are read
rarely and never queried. Putting them in PostgreSQL would bloat backups, slow
restores and waste expensive database storage. S3 is durable, cheap, and lets
the bucket stay completely private while the backend hands out short-lived
presigned URLs (RESTRICTIONS.md #7, #23).

Local fallback: when ``S3_RESUME_BUCKET`` is empty the same interface writes to
``backend/.local-storage/`` so ``docker compose up`` works with no AWS account.
The fallback logs a warning — it never pretends an upload reached S3.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import InvalidResumeError, ResumeTooLargeError
from app.core.logging import get_logger

logger = get_logger("app.storage")

ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "pdf": {"application/pdf"},
    "doc": {"application/msword"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}

# Some browsers send these generic types for perfectly valid documents, so they
# are accepted as long as the extension is one of the three allowed ones.
GENERIC_CONTENT_TYPES = {"application/octet-stream", "binary/octet-stream", ""}

LOCAL_STORAGE_DIR = Path(__file__).resolve().parents[2] / ".local-storage"

_SAFE_CODE = re.compile(r"^[A-Z0-9\-]{4,32}$")


@dataclass(frozen=True)
class StoredResume:
    key: str
    size_bytes: int
    backend: str  # "s3" | "local"


class ResumeStorageService:
    """Validates and stores candidate resumes."""

    def __init__(self) -> None:
        self._client = None  # boto3 client is created lazily, only if S3 is used

    # ----------------------------------------------------------- validation --
    @staticmethod
    def _extension(filename: str) -> str:
        suffix = Path(filename).suffix.lower().lstrip(".")
        if suffix not in ALLOWED_EXTENSIONS:
            raise InvalidResumeError(
                "Resume must be a PDF, DOC or DOCX file. "
                f"Received a '.{suffix or 'unknown'}' file."
            )
        return suffix

    @classmethod
    def validate(cls, filename: str, content_type: str | None, size_bytes: int) -> str:
        """Returns the validated extension, or raises.

        Both the extension and the declared MIME type are checked, and the size
        limit is enforced on the bytes actually read — never on a client-supplied
        Content-Length header.
        """
        if not filename or not filename.strip():
            raise InvalidResumeError("The uploaded file has no filename.")

        extension = cls._extension(filename)

        declared = (content_type or "").split(";")[0].strip().lower()
        if declared not in GENERIC_CONTENT_TYPES and declared not in ALLOWED_EXTENSIONS[extension]:
            raise InvalidResumeError(
                f"File content type '{declared}' does not match a .{extension} document."
            )

        if size_bytes <= 0:
            raise InvalidResumeError("The uploaded file is empty.")
        if size_bytes > settings.resume_max_bytes:
            limit_mb = settings.resume_max_bytes / (1024 * 1024)
            raise ResumeTooLargeError(f"Resume exceeds the maximum allowed size of {limit_mb:.0f} MB.")
        return extension

    @staticmethod
    def build_key(application_code: str, extension: str) -> str:
        """``resumes/APP-2026-K9P4R2/resume.pdf``.

        The stored name is generated, never taken from the client, which removes
        path traversal and "resume.pdf.exe" style problems entirely.
        """
        if not _SAFE_CODE.match(application_code):
            raise InvalidResumeError("Invalid application code for resume storage.")
        return f"resumes/{application_code}/resume.{extension}"

    # -------------------------------------------------------------- storage --
    def store(self, application_code: str, filename: str, content_type: str | None, data: bytes) -> StoredResume:
        extension = self.validate(filename, content_type, len(data))
        key = self.build_key(application_code, extension)

        if settings.resume_storage_is_s3:
            self._s3_client().put_object(
                Bucket=settings.s3_resume_bucket,
                Key=key,
                Body=data,
                ContentType=next(iter(ALLOWED_EXTENSIONS[extension])),
                # Server-side encryption at rest; the bucket also enforces it.
                ServerSideEncryption="AES256",
            )
            logger.info(
                "resume stored",
                extra={"extra_fields": {"storage": "s3", "key": key, "bytes": len(data)}},
            )
            return StoredResume(key=key, size_bytes=len(data), backend="s3")

        destination = LOCAL_STORAGE_DIR / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        logger.warning(
            "S3_RESUME_BUCKET is not configured - resume written to the local "
            "filesystem fallback instead of S3",
            extra={"extra_fields": {"storage": "local", "key": key, "bytes": len(data)}},
        )
        return StoredResume(key=key, size_bytes=len(data), backend="local")

    def presigned_url(self, key: str) -> str | None:
        """Short-lived GET URL for an admin. Returns None outside S3 mode."""
        if not settings.resume_storage_is_s3:
            return None
        return self._s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_resume_bucket, "Key": key},
            ExpiresIn=settings.resume_presign_expiry_seconds,
        )

    def read_local(self, key: str) -> bytes | None:
        path = LOCAL_STORAGE_DIR / key
        if not path.is_file():
            return None
        # Defence in depth: refuse anything that escaped the storage root.
        if LOCAL_STORAGE_DIR.resolve() not in path.resolve().parents:
            return None
        return path.read_bytes()

    def is_configured(self) -> bool:
        """Reported by /health/ready as informational, never as a hard failure."""
        return settings.resume_storage_is_s3

    # ------------------------------------------------------------ internals --
    def _s3_client(self):
        if self._client is None:
            import boto3  # imported lazily so local runs need no AWS SDK config

            self._client = boto3.client("s3", region_name=settings.aws_region)
        return self._client


resume_storage = ResumeStorageService()
