"""Pytest fixtures.

The suite runs against a throwaway SQLite database rather than PostgreSQL so
that ``pytest`` works on a laptop and in CI with no services running. This is
only safe because the models deliberately avoid PostgreSQL-specific types
(CLAUDE.md §7) — the same ORM code runs unchanged against RDS.

``Base.metadata.create_all`` is used here and NOWHERE else in the project; every
real environment gets its schema from Alembic.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Must be set before anything imports app.core.config, which snapshots the
# environment into a cached Settings object at import time.
_TMP_DB = Path(tempfile.mkdtemp(prefix="mjb-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["ENVIRONMENT"] = "local"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-not-used-anywhere-else"
os.environ["S3_RESUME_BUCKET"] = ""  # force the local storage fallback
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "TestAdminPassword123!"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.metadata import target_metadata  # noqa: E402  (registers every model)
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.application import Application  # noqa: E402
from app.models.enums import ApplicationStatus, EmploymentType  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.services.auth import AuthService  # noqa: E402

assert target_metadata is Base.metadata


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    """Every test starts from an empty database, in dependency-safe order."""
    yield
    with SessionLocal() as db:
        db.query(Application).delete()
        db.query(Job).delete()
        db.execute(Base.metadata.tables["admins"].delete())
        db.commit()


@pytest.fixture(autouse=True)
def _isolated_resume_storage(tmp_path, monkeypatch) -> None:
    """Keep uploaded test resumes inside pytest's tmp dir, not the repo."""
    monkeypatch.setattr("app.services.storage.LOCAL_STORAGE_DIR", tmp_path / "resumes")


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


# ------------------------------------------------------------------ data ----
def make_job(db: Session, **overrides) -> Job:
    defaults = dict(
        job_code=f"JOB-2026-{overrides.pop('seq', 1):04d}",
        title="Senior FastAPI Developer",
        department="Engineering",
        location="Bengaluru",
        employment_type=EmploymentType.FULL_TIME,
        description="We are looking for a senior backend engineer to own our hiring platform services.",
        responsibilities="Design and build FastAPI services.",
        skills="Python, FastAPI, PostgreSQL",
        experience_required="5+ years",
        is_active=True,
    )
    defaults.update(overrides)
    job = Job(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@pytest.fixture
def job(db: Session) -> Job:
    return make_job(db)


@pytest.fixture
def jobs(db: Session) -> list[Job]:
    """A small, deliberately varied catalogue for filter and pagination tests."""
    specs = [
        dict(seq=1, title="Senior FastAPI Developer", department="Engineering",
             location="Bengaluru", employment_type=EmploymentType.FULL_TIME),
        dict(seq=2, title="React Frontend Engineer", department="Engineering",
             location="Delhi NCR", employment_type=EmploymentType.FULL_TIME),
        dict(seq=3, title="HR Executive", department="Human Resources",
             location="Delhi NCR", employment_type=EmploymentType.PART_TIME),
        dict(seq=4, title="Software Intern", department="Engineering",
             location="Remote", employment_type=EmploymentType.INTERNSHIP),
        dict(seq=5, title="Retired Sales Role", department="Sales",
             location="Mumbai", employment_type=EmploymentType.CONTRACT, is_active=False),
    ]
    return [make_job(db, **spec) for spec in specs]


@pytest.fixture
def application(db: Session, job: Job) -> Application:
    row = Application(
        application_code="APP-2026-TEST01",
        job_id=job.id,
        name="Aarav Sharma",
        email="aarav.sharma@example.com",
        phone="+91 9876543210",
        experience="5-7 years",
        profile_url="https://github.com/aarav",
        cover_note="Keen to work on this problem.",
        status=ApplicationStatus.APPLIED,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ------------------------------------------------------------------ auth ----
@pytest.fixture
def admin_password() -> str:
    return settings.admin_password


@pytest.fixture
def admin(db: Session, admin_password: str):
    created, _ = AuthService(db).ensure_admin(settings.admin_email, admin_password, "Test Admin")
    return created


@pytest.fixture
def auth_headers(client: TestClient, admin, admin_password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin.email, "password": admin_password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# --------------------------------------------------------------- helpers ----
def application_form(**overrides) -> dict[str, str]:
    payload = {
        "name": "Meera Nair",
        "email": "meera.nair@example.com",
        "phone": "+91 9123456780",
        "experience": "3-5 years",
        "profile_url": "https://github.com/meera",
        "cover_note": "I would love to join.",
    }
    payload.update(overrides)
    return {k: v for k, v in payload.items() if v is not None}


# A minimal but genuinely valid PDF, so content-type checks are exercised
# against something real rather than random bytes.
MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)
