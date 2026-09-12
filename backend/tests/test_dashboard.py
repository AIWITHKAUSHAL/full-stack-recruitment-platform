"""Admin dashboard statistics."""

from __future__ import annotations

from app.models.application import Application
from app.models.enums import ApplicationStatus
from tests.conftest import make_job


def _application(db, job, code, status):
    db.add(
        Application(
            application_code=code,
            job_id=job.id,
            name="Demo Candidate",
            email=f"{code.lower()}@example.com",
            phone="+91 9000000000",
            experience="2-4 years",
            status=status,
        )
    )
    db.commit()


def test_stats_require_authentication(client):
    assert client.get("/api/v1/admin/stats").status_code == 401


def test_headline_tiles(client, db, auth_headers, jobs):
    engineering = jobs[0]
    hr = jobs[2]
    _application(db, engineering, "APP-2026-AAA111", ApplicationStatus.APPLIED)
    _application(db, engineering, "APP-2026-BBB222", ApplicationStatus.INTERVIEW)
    _application(db, engineering, "APP-2026-CCC333", ApplicationStatus.SELECTED)
    _application(db, hr, "APP-2026-DDD444", ApplicationStatus.REJECTED)

    body = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    assert body["active_jobs"] == 4      # one fixture job is inactive
    assert body["total_jobs"] == 5
    assert body["total_applications"] == 4
    assert body["interviews"] == 1
    assert body["selected"] == 1
    assert body["rejected"] == 1


def test_every_status_appears_even_when_zero(client, auth_headers, job):
    body = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    statuses = [row["status"] for row in body["applications_by_status"]]
    assert statuses == ["APPLIED", "SCREENING", "INTERVIEW", "SELECTED", "REJECTED"]
    assert all(row["count"] == 0 for row in body["applications_by_status"])


def test_breakdown_by_department(client, db, auth_headers, jobs):
    _application(db, jobs[0], "APP-2026-EEE555", ApplicationStatus.APPLIED)
    _application(db, jobs[2], "APP-2026-FFF666", ApplicationStatus.APPLIED)
    body = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    departments = {row["department"]: row["count"] for row in body["applications_by_department"]}
    assert departments == {"Engineering": 1, "Human Resources": 1}


def test_recent_applications_are_newest_first(client, db, auth_headers, job):
    for index in range(3):
        _application(db, job, f"APP-2026-R{index:05d}", ApplicationStatus.APPLIED)
    body = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    recent = body["recent_applications"]
    assert len(recent) == 3
    assert [row["created_at"] for row in recent] == sorted(
        [row["created_at"] for row in recent], reverse=True
    )


def test_empty_system_returns_zeroes(client, auth_headers):
    body = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    assert body["active_jobs"] == 0
    assert body["total_applications"] == 0
    assert body["recent_applications"] == []


def test_deactivating_a_job_lowers_the_active_count(client, db, auth_headers):
    job = make_job(db, seq=3)
    assert client.get("/api/v1/admin/stats", headers=auth_headers).json()["active_jobs"] == 1
    client.patch(f"/api/v1/admin/jobs/{job.id}/deactivate", headers=auth_headers)
    stats = client.get("/api/v1/admin/stats", headers=auth_headers).json()
    assert stats["active_jobs"] == 0
    assert stats["total_jobs"] == 1
