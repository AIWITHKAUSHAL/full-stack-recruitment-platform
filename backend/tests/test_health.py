"""Health, readiness and the OpenAPI document."""

from __future__ import annotations


def test_health_returns_200_and_is_not_database_dependent(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_readiness_reports_database_and_storage(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"
    # No bucket configured in tests, so the fallback must be reported honestly.
    assert body["checks"]["resume_storage"] == "local-fallback"


def test_openapi_document_is_served(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/jobs" in paths
    assert "/api/v1/applications/track" in paths


def test_every_response_carries_a_request_id(client):
    response = client.get("/health")
    assert response.headers["X-Request-ID"]
