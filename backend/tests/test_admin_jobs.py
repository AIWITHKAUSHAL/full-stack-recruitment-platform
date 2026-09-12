"""Admin job management."""

from __future__ import annotations

from tests.conftest import make_job

NEW_JOB = {
    "title": "Platform Engineer",
    "department": "Engineering",
    "location": "Pune",
    "employment_type": "CONTRACT",
    "description": "Own the internal developer platform and the pipelines behind it.",
    "responsibilities": "Build and maintain CI/CD tooling for every team.",
    "skills": "Terraform, GitHub Actions, AWS",
    "experience_required": "4+ years",
}


def test_admin_list_includes_inactive_jobs(client, auth_headers, jobs):
    body = client.get("/api/v1/admin/jobs", headers=auth_headers).json()
    assert body["total"] == 5  # the public list shows only 4
    assert any(item["is_active"] is False for item in body["items"])


def test_admin_list_can_filter_by_active_flag(client, auth_headers, jobs):
    assert client.get("/api/v1/admin/jobs?is_active=false", headers=auth_headers).json()["total"] == 1
    assert client.get("/api/v1/admin/jobs?is_active=true", headers=auth_headers).json()["total"] == 4


def test_admin_list_shows_application_counts(client, auth_headers, job, application):
    body = client.get("/api/v1/admin/jobs", headers=auth_headers).json()
    row = next(item for item in body["items"] if item["id"] == job.id)
    assert row["application_count"] == 1


def test_create_job(client, auth_headers):
    response = client.post("/api/v1/admin/jobs", json=NEW_JOB, headers=auth_headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Platform Engineer"
    assert body["is_active"] is True
    # The job code is generated server-side; the client never supplies it.
    assert body["job_code"].startswith("JOB-")


def test_created_job_codes_do_not_collide(client, auth_headers):
    first = client.post("/api/v1/admin/jobs", json=NEW_JOB, headers=auth_headers).json()
    second = client.post("/api/v1/admin/jobs", json=NEW_JOB, headers=auth_headers).json()
    assert first["job_code"] != second["job_code"]


def test_client_supplied_job_code_is_ignored(client, auth_headers):
    body = client.post(
        "/api/v1/admin/jobs", json={**NEW_JOB, "job_code": "JOB-HACKED"}, headers=auth_headers
    ).json()
    assert body["job_code"] != "JOB-HACKED"


def test_create_job_validates_input(client, auth_headers):
    response = client.post(
        "/api/v1/admin/jobs", json={**NEW_JOB, "title": "x"}, headers=auth_headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_job_rejects_an_unknown_employment_type(client, auth_headers):
    response = client.post(
        "/api/v1/admin/jobs", json={**NEW_JOB, "employment_type": "PERMANENT"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_create_job_requires_authentication(client):
    assert client.post("/api/v1/admin/jobs", json=NEW_JOB).status_code == 401


def test_patch_updates_only_the_supplied_fields(client, auth_headers, job):
    response = client.patch(
        f"/api/v1/admin/jobs/{job.id}", json={"location": "Remote"}, headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["location"] == "Remote"
    assert body["title"] == job.title  # untouched


def test_patch_unknown_job_returns_404(client, auth_headers):
    response = client.patch("/api/v1/admin/jobs/999999", json={"location": "Remote"}, headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "JOB_NOT_FOUND"


def test_deactivate_then_activate(client, auth_headers, job):
    deactivated = client.patch(f"/api/v1/admin/jobs/{job.id}/deactivate", headers=auth_headers).json()
    assert deactivated["is_active"] is False
    # A deactivated job disappears from the public careers page immediately.
    assert client.get("/api/v1/jobs").json()["total"] == 0

    activated = client.patch(f"/api/v1/admin/jobs/{job.id}/activate", headers=auth_headers).json()
    assert activated["is_active"] is True
    assert client.get("/api/v1/jobs").json()["total"] == 1


def test_admin_can_read_an_inactive_job(client, auth_headers, db):
    closed = make_job(db, seq=8, is_active=False)
    assert client.get(f"/api/v1/admin/jobs/{closed.id}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/jobs/{closed.id}").status_code == 404
