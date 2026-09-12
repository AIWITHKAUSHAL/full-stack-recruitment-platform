"""The error envelope, request ids and information leakage."""

from __future__ import annotations

import pytest


def test_error_envelope_shape(client):
    body = client.get("/api/v1/jobs/999999").json()
    assert body["success"] is False
    assert set(body["error"]) >= {"code", "message"}
    assert isinstance(body["request_id"], str) and body["request_id"]


def test_request_id_in_the_body_matches_the_header(client):
    response = client.get("/api/v1/jobs/999999")
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


def test_an_upstream_request_id_is_honoured(client):
    response = client.get("/health", headers={"X-Request-ID": "trace-from-the-alb"})
    assert response.headers["X-Request-ID"] == "trace-from-the-alb"


def test_unknown_route_returns_the_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_validation_errors_name_the_offending_fields(client, job):
    response = client.post(
        f"/api/v1/jobs/{job.id}/applications",
        data={"name": "A", "email": "bad", "phone": "1", "experience": "2 years"},
    )
    assert response.status_code == 422
    fields = response.json()["error"]["details"]["fields"]
    # Every bad field is reported at once, so the React form can mark them all.
    assert {"name", "email", "phone"} <= set(fields)


def test_a_missing_form_field_is_reported_by_name(client, job):
    response = client.post(
        f"/api/v1/jobs/{job.id}/applications",
        data={"name": "Meera Nair", "email": "meera@example.com", "phone": "+91 9123456780"},
    )
    assert response.status_code == 422
    assert "experience" in response.json()["error"]["details"]["fields"]


@pytest.mark.parametrize("leak", ["Traceback", "SELECT", "sqlalchemy", "password", "psycopg"])
def test_errors_never_leak_internals(client, leak):
    body = client.get("/api/v1/jobs/999999").text
    assert leak.lower() not in body.lower()


def test_sql_injection_attempt_is_treated_as_plain_text(client, jobs):
    # SQLAlchemy binds parameters; the payload is matched literally and finds
    # nothing rather than executing.
    response = client.get("/api/v1/jobs?search=' OR 1=1--")
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_method_not_allowed_uses_the_envelope(client):
    response = client.delete("/api/v1/jobs")
    assert response.status_code == 405
    assert response.json()["success"] is False
