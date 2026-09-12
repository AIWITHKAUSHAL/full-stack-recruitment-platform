"""Candidate submission, resume validation and application tracking."""

from __future__ import annotations

import re

from tests.conftest import MINIMAL_PDF, application_form, make_job

CODE_PATTERN = re.compile(r"^APP-\d{4}-[A-Z0-9]{6,10}$")


def submit(client, job_id: int, files=None, **overrides):
    return client.post(
        f"/api/v1/jobs/{job_id}/applications",
        data=application_form(**overrides),
        files=files,
    )


# ------------------------------------------------------------- submission ---
def test_submit_application_succeeds(client, job):
    response = submit(client, job.id)
    assert response.status_code == 201, response.text
    body = response.json()
    assert CODE_PATTERN.match(body["application_code"])
    assert body["job_title"] == job.title
    assert body["status"] == "APPLIED"
    assert body["resume_uploaded"] is False


def test_application_code_is_not_the_database_id(client, job):
    code = submit(client, job.id).json()["application_code"]
    assert str(code).isdigit() is False
    assert "APP-" in code


def test_two_candidates_get_different_codes(client, job):
    first = submit(client, job.id, email="one@example.com").json()["application_code"]
    second = submit(client, job.id, email="two@example.com").json()["application_code"]
    assert first != second


def test_application_is_persisted(client, db, job):
    from app.models.application import Application

    code = submit(client, job.id).json()["application_code"]
    stored = db.query(Application).filter_by(application_code=code).one()
    assert stored.job_id == job.id
    assert stored.status.value == "APPLIED"


def test_email_is_stored_lowercased(client, db, job):
    from app.models.application import Application

    code = submit(client, job.id, email="MiXeD.Case@Example.Com").json()["application_code"]
    stored = db.query(Application).filter_by(application_code=code).one()
    assert stored.email == "mixed.case@example.com"


# ------------------------------------------------------------- validation ---
def test_invalid_email_is_rejected(client, job):
    response = submit(client, job.id, email="not-an-email")
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "email" in body["error"]["details"]["fields"]


def test_invalid_phone_is_rejected(client, job):
    response = submit(client, job.id, phone="abc")
    assert response.status_code == 422
    assert "phone" in response.json()["error"]["details"]["fields"]


def test_missing_name_is_rejected(client, job):
    response = client.post(
        f"/api/v1/jobs/{job.id}/applications",
        data={k: v for k, v in application_form().items() if k != "name"},
    )
    assert response.status_code == 422


def test_profile_url_must_be_http(client, job):
    response = submit(client, job.id, profile_url="javascript:alert(1)")
    assert response.status_code == 422
    assert "profile_url" in response.json()["error"]["details"]["fields"]


def test_cannot_apply_to_an_unknown_job(client):
    response = submit(client, 999999)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "JOB_NOT_FOUND"


def test_cannot_apply_to_an_inactive_job(client, db):
    closed = make_job(db, seq=9, is_active=False)
    response = submit(client, closed.id)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "JOB_INACTIVE"


# -------------------------------------------------------------- duplicates --
def test_duplicate_application_is_rejected(client, job):
    assert submit(client, job.id, email="same@example.com").status_code == 201
    second = submit(client, job.id, email="same@example.com")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "DUPLICATE_APPLICATION"


def test_duplicate_check_is_case_insensitive(client, job):
    submit(client, job.id, email="dup@example.com")
    assert submit(client, job.id, email="DUP@Example.Com").status_code == 409


def test_same_email_may_apply_to_a_different_job(client, db, job):
    other = make_job(db, seq=7, title="React Frontend Engineer")
    assert submit(client, job.id, email="multi@example.com").status_code == 201
    assert submit(client, other.id, email="multi@example.com").status_code == 201


def test_rejected_candidate_may_reapply(client, db, job):
    from app.models.application import Application
    from app.models.enums import ApplicationStatus

    code = submit(client, job.id, email="again@example.com").json()["application_code"]
    row = db.query(Application).filter_by(application_code=code).one()
    row.status = ApplicationStatus.REJECTED
    db.commit()
    # The live-application rule deliberately excludes rejected applications.
    assert submit(client, job.id, email="again@example.com").status_code == 201


# ------------------------------------------------------------------ resume --
def test_resume_upload_succeeds(client, job):
    response = submit(
        client, job.id, files={"resume": ("cv.pdf", MINIMAL_PDF, "application/pdf")}
    )
    assert response.status_code == 201
    assert response.json()["resume_uploaded"] is True


def test_resume_key_is_generated_not_taken_from_the_client(client, db, job):
    from app.models.application import Application

    body = submit(
        client,
        job.id,
        files={"resume": ("../../etc/passwd.pdf", MINIMAL_PDF, "application/pdf")},
    ).json()
    stored = db.query(Application).filter_by(application_code=body["application_code"]).one()
    assert stored.resume_key == f"resumes/{body['application_code']}/resume.pdf"
    assert ".." not in stored.resume_key


def test_executable_resume_is_rejected(client, job):
    response = submit(
        client, job.id, files={"resume": ("payload.exe", b"MZ\x90\x00", "application/octet-stream")}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_RESUME"


def test_mismatched_content_type_is_rejected(client, job):
    response = submit(
        client, job.id, files={"resume": ("cv.pdf", MINIMAL_PDF, "image/png")}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_RESUME"


def test_oversized_resume_is_rejected(client, job):
    oversized = b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024)
    response = submit(
        client, job.id, files={"resume": ("big.pdf", oversized, "application/pdf")}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "RESUME_TOO_LARGE"


def test_empty_resume_is_rejected(client, job):
    response = submit(client, job.id, files={"resume": ("cv.pdf", b"", "application/pdf")})
    assert response.status_code == 422


def test_no_application_row_is_left_behind_when_the_resume_is_invalid(client, db, job):
    from app.models.application import Application

    submit(client, job.id, files={"resume": ("bad.exe", b"x", "application/octet-stream")})
    assert db.query(Application).count() == 0


# ---------------------------------------------------------------- tracking --
def test_tracking_returns_candidate_safe_fields(client, job):
    submitted = submit(client, job.id).json()
    response = client.get(
        "/api/v1/applications/track",
        params={"application_code": submitted["application_code"], "email": application_form()["email"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "application_code", "job_title", "job_code", "status", "submitted_at", "last_updated_at",
    }
    # Nothing internal may leak into a public response.
    assert "admin_notes" not in body
    assert "id" not in body
    assert "email" not in body


def test_tracking_is_case_insensitive_on_email_and_code(client, job):
    submitted = submit(client, job.id).json()
    response = client.get(
        "/api/v1/applications/track",
        params={
            "application_code": submitted["application_code"].lower(),
            "email": application_form()["email"].upper(),
        },
    )
    assert response.status_code == 200


def test_tracking_with_the_wrong_email_fails(client, job):
    submitted = submit(client, job.id).json()
    response = client.get(
        "/api/v1/applications/track",
        params={"application_code": submitted["application_code"], "email": "someone.else@example.com"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "APPLICATION_NOT_FOUND"


def test_tracking_an_unknown_code_fails_identically(client, job):
    response = client.get(
        "/api/v1/applications/track",
        params={"application_code": "APP-2026-NOPE22", "email": application_form()["email"]},
    )
    # Same status and code as a wrong email, so the endpoint cannot be used to
    # discover which application codes exist.
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "APPLICATION_NOT_FOUND"


def test_tracking_requires_both_parameters(client):
    assert client.get("/api/v1/applications/track?application_code=APP-2026-ABCDEF").status_code == 422
