"""Liveness and readiness.

Two endpoints, two different questions:

* ``/health``       – is this process alive? The ALB target group polls this.
                      It must NOT depend on the database: if PostgreSQL blips,
                      killing every task makes the outage worse, not better.
* ``/health/ready`` – can this process actually serve traffic? Checks the
                      database round trip; reports resume storage as
                      informational only.
"""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.core.config import settings
from app.db.session import database_is_reachable
from app.services.storage import resume_storage

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe (used by the ALB target group)")
def health() -> dict:
    return {"status": "healthy", "service": settings.project_name, "environment": settings.environment}


@router.get("/health/ready", summary="Readiness probe (checks PostgreSQL connectivity)")
def readiness(response: Response) -> dict:
    database_ok = database_is_reachable()
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if database_ok else "not_ready",
        "checks": {
            "database": "ok" if database_ok else "unavailable",
            # Informational: the app works without S3 (local fallback), so this
            # never fails readiness on its own.
            "resume_storage": "s3" if resume_storage.is_configured() else "local-fallback",
        },
    }
