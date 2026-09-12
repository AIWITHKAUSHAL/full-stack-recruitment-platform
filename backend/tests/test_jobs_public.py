"""Public careers-page behaviour: listing, search, filters, sort, pagination."""

from __future__ import annotations

import pytest


def test_list_returns_only_active_jobs(client, jobs):
    body = client.get("/api/v1/jobs").json()
    assert body["total"] == 4  # the fifth fixture job is inactive
    assert all(item["is_active"] for item in body["items"])
    assert "Retired Sales Role" not in [item["title"] for item in body["items"]]


def test_list_envelope_shape(client, jobs):
    body = client.get("/api/v1/jobs?page_size=2").json()
    assert set(body) == {"items", "page", "page_size", "total", "pages"}
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["pages"] == 2
    assert len(body["items"]) == 2


def test_pagination_second_page_has_different_rows(client, jobs):
    first = client.get("/api/v1/jobs?page=1&page_size=2").json()["items"]
    second = client.get("/api/v1/jobs?page=2&page_size=2").json()["items"]
    assert {j["id"] for j in first}.isdisjoint({j["id"] for j in second})


def test_search_matches_title(client, jobs):
    body = client.get("/api/v1/jobs?search=react").json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "React Frontend Engineer"


def test_search_matches_skills(client, jobs):
    body = client.get("/api/v1/jobs?search=PostgreSQL").json()
    assert body["total"] >= 1


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("department=Engineering", 3),
        ("department=Human Resources", 1),
        ("location=Delhi NCR", 2),
        ("location=Remote", 1),
        ("employment_type=FULL_TIME", 2),
        ("employment_type=INTERNSHIP", 1),
        ("department=Engineering&location=Remote", 1),
    ],
)
def test_filters(client, jobs, query, expected):
    assert client.get(f"/api/v1/jobs?{query}").json()["total"] == expected


def test_unknown_employment_type_is_rejected(client, jobs):
    response = client.get("/api/v1/jobs?employment_type=PERMANENT")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_sort_by_title(client, jobs):
    titles = [j["title"] for j in client.get("/api/v1/jobs?sort=title_asc").json()["items"]]
    assert titles == sorted(titles)


def test_job_detail_returns_full_posting(client, job):
    body = client.get(f"/api/v1/jobs/{job.id}").json()
    assert body["job_code"] == job.job_code
    assert body["responsibilities"]
    assert body["skills"]
    assert body["experience_required"] == "5+ years"


def test_inactive_job_detail_is_not_public(client, jobs):
    inactive = next(j for j in jobs if not j.is_active)
    response = client.get(f"/api/v1/jobs/{inactive.id}")
    # Reported as not found, not as "inactive": the public API should not
    # confirm that an unpublished role exists.
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "JOB_NOT_FOUND"


def test_missing_job_detail_returns_error_envelope(client):
    response = client.get("/api/v1/jobs/999999")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "JOB_NOT_FOUND"
    assert body["request_id"]


def test_filter_options_endpoint(client, jobs):
    body = client.get("/api/v1/jobs/filters").json()
    assert body["total_active_jobs"] == 4
    assert "Engineering" in body["departments"]
    assert "Sales" not in body["departments"]  # only the inactive job is Sales
    assert "Remote" in body["locations"]
    assert "FULL_TIME" in body["employment_types"]


def test_summary_is_truncated_for_the_card(client, job):
    item = client.get("/api/v1/jobs").json()["items"][0]
    assert len(item["summary"]) <= 200
