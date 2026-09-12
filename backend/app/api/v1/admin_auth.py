"""Administrator login and profile."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentAdmin, DbSession
from app.schemas.admin import AdminProfile
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth import AuthService

router = APIRouter(prefix="/admin/auth", tags=["admin: authentication"])


@router.post("/login", response_model=TokenResponse, summary="Exchange credentials for a JWT")
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    # The response contains a token; it is never written to the log.
    return AuthService(db).login(str(payload.email), payload.password)


@router.get("/me", response_model=AdminProfile, summary="The signed-in administrator")
def me(admin: CurrentAdmin) -> AdminProfile:
    # Also serves as the front end's "is my stored token still valid?" check.
    return AdminProfile.model_validate(admin)
