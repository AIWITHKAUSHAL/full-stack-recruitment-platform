"""Administrator dashboard statistics."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentAdmin, DbSession
from app.schemas.admin import DashboardStats
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/admin", tags=["admin: dashboard"])


@router.get("/stats", response_model=DashboardStats, summary="Hiring statistics for the dashboard")
def stats(db: DbSession, admin: CurrentAdmin) -> DashboardStats:
    return DashboardService(db).stats()
