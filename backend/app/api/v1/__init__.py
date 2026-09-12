"""Version 1 of the public API.

Everything is mounted under ``/api/v1`` so a future v2 can coexist with it
instead of breaking every deployed React bundle.
"""

from fastapi import APIRouter

from app.api.v1 import (
    admin_applications,
    admin_auth,
    admin_jobs,
    admin_stats,
    applications,
    jobs,
)

api_router = APIRouter()
api_router.include_router(jobs.router)
api_router.include_router(applications.router)
api_router.include_router(admin_auth.router)
api_router.include_router(admin_jobs.router)
api_router.include_router(admin_applications.router)
api_router.include_router(admin_stats.router)

__all__ = ["api_router"]
