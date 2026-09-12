"""Admin application review: listing, filtering, detail, notes, status moves."""

from __future__ import annotations

from tests.conftest import MINIMAL_PDF, application_form, make_job


def _apply(client, job_id, **overrides):
    return client.post(
        f"/api/v1/jobs/{job_id}/applications", data=application_form(**overrides)
    ).json()


def test_list_applications(client, auth_headers, application):
    body = client.get("/api/v1/admin/applications", headers=auth_headers).json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["application_code"] == application.application_code
    assert row["job_title"]  # joined from the job, not an extra query per row
    assert row["has_resume"] is False


def test_list_requires_authentication(client, application):
    assert client.get("/api/v1/admin/applications").status_code == 401


def test_search_by_name_email_and_code(client, auth_headers, application):
    for query in ("Aarav", "aarav.sharma@example.com", application.application_code):
        body = client.get(f"/api/v1/admin/applications?search={query}", headers=auth_headers).json()
        assert body["total"] == 1, query


def test_filter_by_status(client, auth_headers, application):
    assert client.get("/api/v1/admin/applications?status=APPLIED", headers=auth_headers).json()["total"] == 1
    assert client.get("/api/v1/admin/applications?status=SELECTED", headers=auth_headers).json()["total"] == 0


def test_filter_by_job(client, db, auth_headers, job, application):
    other = make_job(db, seq=6, title="React Frontend Engineer")
    assert client.get(f"/api/v1/admin/applications?job_id={job.id}", headers=auth_headers).json()["total"] == 1
    assert client.get(f"/api/v1/admin/applications?job_id={other.id}", headers=auth_headers).json()["total"] == 0


def test_filter_by_date_range(client, auth_headers, application):
    from datetime import UTC, datetime, timedelta

    today = datetime.now(UTC).date()
    past = today - timedelta(days=7)
    future = today + timedelta(days=1)
    url = f"/api/v1/admin/applications?date_from={past}&date_to={future}"
    assert client.get(url, headers=auth_headers).json()["total"] == 1
    assert client.get(
        f"/api/v1/admin/applications?date_from={future}", headers=auth_headers
    ).json()["total"] == 0


def test_detail_includes_internal_fields_and_legal_next_steps(client, auth_headers, application):
    body = client.get(f"/api/v1/admin/applications/{application.id}", headers=auth_headers).json()
    assert body["cover_note"] == "Keen to work on this problem."
    assert body["profile_url"] == "https://github.com/aarav"
    assert "admin_notes" in body
    assert body["allowed_next_statuses"] == ["REJECTED", "SCREENING"]


def test_detail_of_an_unknown_application(client, auth_headers):
    response = client.get("/api/v1/admin/applications/999999", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "APPLICATION_NOT_FOUND"


def test_walk_the_full_pipeline(client, auth_headers, application):
    url = f"/api/v1/admin/applications/{application.id}/status"
    for target in ("SCREENING", "INTERVIEW", "SELECTED"):
        response = client.patch(url, json={"status": target}, headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.json()["status"] == target
    assert response.json()["allowed_next_statuses"] == []


def test_skipping_a_stage_is_rejected(client, auth_headers, application):
    response = client.patch(
        f"/api/v1/admin/applications/{application.id}/status",
        json={"status": "SELECTED"},
        headers=auth_headers,
    )
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "INVALID_STATUS_TRANSITION"
    # The message tells the recruiter what IS allowed.
    assert "SCREENING" in body["error"]["message"]


def test_moving_backwards_is_rejected(client, auth_headers, application):
    url = f"/api/v1/admin/applications/{application.id}/status"
    client.patch(url, json={"status": "SCREENING"}, headers=auth_headers)
    response = client.patch(url, json={"status": "APPLIED"}, headers=auth_headers)
    assert response.status_code == 409


def test_a_terminal_application_cannot_move_again(client, auth_headers, application):
    url = f"/api/v1/admin/applications/{application.id}/status"
    client.patch(url, json={"status": "REJECTED"}, headers=auth_headers)
    assert client.patch(url, json={"status": "SCREENING"}, headers=auth_headers).status_code == 409


def test_unknown_status_value_is_rejected(client, auth_headers, application):
    response = client.patch(
        f"/api/v1/admin/applications/{application.id}/status",
        json={"status": "interviewing"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_status_change_note_is_appended_to_admin_notes(client, auth_headers, application):
    body = client.patch(
        f"/api/v1/admin/applications/{application.id}/status",
        json={"status": "SCREENING", "note": "Strong Python background."},
        headers=auth_headers,
    ).json()
    assert "Strong Python background." in body["admin_notes"]
    assert "APPLIED → SCREENING" in body["admin_notes"]


def test_status_change_is_visible_to_the_candidate(client, auth_headers, job):
    submitted = _apply(client, job.id)
    detail = client.get(
        f"/api/v1/admin/applications?search={submitted['application_code']}", headers=auth_headers
    ).json()["items"][0]
    client.patch(
        f"/api/v1/admin/applications/{detail['id']}/status",
        json={"status": "SCREENING"},
        headers=auth_headers,
    )
    tracked = client.get(
        "/api/v1/applications/track",
        params={"application_code": submitted["application_code"], "email": application_form()["email"]},
    ).json()
    assert tracked["status"] == "SCREENING"


def test_notes_can_be_replaced(client, auth_headers, application):
    body = client.patch(
        f"/api/v1/admin/applications/{application.id}/notes",
        json={"admin_notes": "Scheduled for a system design round."},
        headers=auth_headers,
    ).json()
    assert body["admin_notes"] == "Scheduled for a system design round."


def test_notes_are_never_exposed_publicly(client, auth_headers, job):
    submitted = _apply(client, job.id)
    row = client.get(
        f"/api/v1/admin/applications?search={submitted['application_code']}", headers=auth_headers
    ).json()["items"][0]
    client.patch(
        f"/api/v1/admin/applications/{row['id']}/notes",
        json={"admin_notes": "Internal: salary expectation is high."},
        headers=auth_headers,
    )
    tracked = client.get(
        "/api/v1/applications/track",
        params={"application_code": submitted["application_code"], "email": application_form()["email"]},
    ).json()
    assert "Internal" not in str(tracked)


# ------------------------------------------------------------------ resume --
def test_resume_link_is_time_limited(client, auth_headers, job):
    submitted = client.post(
        f"/api/v1/jobs/{job.id}/applications",
        data=application_form(),
        files={"resume": ("cv.pdf", MINIMAL_PDF, "application/pdf")},
    ).json()
    row = client.get(
        f"/api/v1/admin/applications?search={submitted['application_code']}", headers=auth_headers
    ).json()["items"][0]
    assert row["has_resume"] is True

    link = client.get(f"/api/v1/admin/applications/{row['id']}/resume", headers=auth_headers).json()
    assert link["expires_in_seconds"] == 300
    assert "token=" in link["url"]  # local fallback: signed, single-purpose URL

    # The signed URL serves the file; no bearer header is involved.
    download = client.get(link["url"])
    assert download.status_code == 200
    assert download.content == MINIMAL_PDF


def test_resume_link_requires_authentication(client, application):
    assert client.get(f"/api/v1/admin/applications/{application.id}/resume").status_code == 401


def test_resume_link_for_an_application_without_a_resume(client, auth_headers, application):
    response = client.get(
        f"/api/v1/admin/applications/{application.id}/resume", headers=auth_headers
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESUME_NOT_AVAILABLE"


def test_download_token_is_not_valid_for_another_application(client, auth_headers, db, job):
    from app.core.security import create_download_token

    submitted = client.post(
        f"/api/v1/jobs/{job.id}/applications",
        data=application_form(),
        files={"resume": ("cv.pdf", MINIMAL_PDF, "application/pdf")},
    ).json()
    row = client.get(
        f"/api/v1/admin/applications?search={submitted['application_code']}", headers=auth_headers
    ).json()["items"][0]

    stolen = create_download_token(row["id"] + 1000, 300)
    response = client.get(f"/api/v1/admin/applications/{row['id']}/resume/file?token={stolen}")
    assert response.status_code == 401
