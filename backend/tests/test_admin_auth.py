"""Admin authentication and the gate in front of every admin endpoint."""

from __future__ import annotations

import pytest

PROTECTED = [
    ("get", "/api/v1/admin/jobs"),
    ("get", "/api/v1/admin/applications"),
    ("get", "/api/v1/admin/stats"),
    ("get", "/api/v1/admin/auth/me"),
]


def test_login_returns_a_token(client, admin, admin_password):
    response = client.post(
        "/api/v1/admin/auth/login", json={"email": admin.email, "password": admin_password}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in_seconds"] > 0
    assert body["admin_email"] == admin.email


def test_login_is_case_insensitive_on_email(client, admin, admin_password):
    response = client.post(
        "/api/v1/admin/auth/login",
        json={"email": admin.email.upper(), "password": admin_password},
    )
    assert response.status_code == 200


def test_login_with_a_wrong_password_fails(client, admin):
    response = client.post(
        "/api/v1/admin/auth/login", json={"email": admin.email, "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_login_for_an_unknown_account_returns_the_same_error(client, admin):
    response = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "nobody@example.com", "password": "whatever"},
    )
    # Identical to a wrong password: the login form must not double as a way to
    # find out which email addresses are registered.
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_deactivated_admin_cannot_log_in(client, db, admin, admin_password):
    admin.is_active = False
    db.commit()
    response = client.post(
        "/api/v1/admin/auth/login", json={"email": admin.email, "password": admin_password}
    )
    assert response.status_code == 401


def test_password_is_never_stored_in_plaintext(db, admin, admin_password):
    assert admin.password_hash != admin_password
    assert admin.password_hash.startswith("$2")  # bcrypt


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_admin_routes_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_admin_routes_reject_a_garbage_token(client, method, path):
    response = getattr(client, method)(path, headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_admin_routes_accept_a_valid_token(client, auth_headers):
    assert client.get("/api/v1/admin/stats", headers=auth_headers).status_code == 200


def test_expired_token_is_rejected(client, admin):
    from app.core import security

    token = security.jwt.encode(
        {"sub": str(admin.id), "iat": 0, "exp": 1},  # expired in 1970
        security.settings.jwt_secret_key,
        algorithm=security.settings.jwt_algorithm,
    )
    response = client.get("/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "expired" in response.json()["error"]["message"].lower()


def test_token_signed_with_another_key_is_rejected(client, admin):
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": str(admin.id), "exp": 9999999999}, "attacker-key", algorithm="HS256")
    response = client.get("/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_deactivating_an_admin_invalidates_an_existing_token(client, db, admin, auth_headers):
    assert client.get("/api/v1/admin/auth/me", headers=auth_headers).status_code == 200
    admin.is_active = False
    db.commit()
    # The admin row is re-read on every request, so revocation is immediate.
    assert client.get("/api/v1/admin/auth/me", headers=auth_headers).status_code == 401


def test_me_returns_the_profile_without_the_hash(client, auth_headers, admin):
    body = client.get("/api/v1/admin/auth/me", headers=auth_headers).json()
    assert body["email"] == admin.email
    assert "password_hash" not in body


def _login_status(client, email: str, password: str) -> int:
    return client.post(
        "/api/v1/admin/auth/login", json={"email": email, "password": password}
    ).status_code


def test_reset_password_replaces_the_old_password(client, db, admin, admin_password):
    from app.services.auth import AuthService

    AuthService(db).reset_password(admin.email.upper(), "A-New-Strong-Password-42")

    assert _login_status(client, admin.email, admin_password) == 401
    assert _login_status(client, admin.email, "A-New-Strong-Password-42") == 200
    assert admin.password_hash.startswith("$2")  # still bcrypt, never plaintext


def test_reset_password_for_an_unknown_admin_fails(db, admin):
    from app.core.exceptions import AdminNotFoundError
    from app.services.auth import AuthService

    with pytest.raises(AdminNotFoundError):
        AuthService(db).reset_password("nobody@example.com", "A-New-Strong-Password-42")


def test_seed_only_resets_an_existing_password_when_asked(
    client, db, admin, admin_password, monkeypatch
):
    from app.core.config import settings
    from scripts.seed import seed_admin

    monkeypatch.setattr(settings, "admin_password", "Rotated-Password-42")

    # A plain re-seed must never overwrite a password somebody already uses.
    assert seed_admin(db) == "already present"
    assert _login_status(client, admin.email, admin_password) == 200

    assert seed_admin(db, reset_password=True) == "password reset"
    assert _login_status(client, admin.email, admin_password) == 401
    assert _login_status(client, admin.email, "Rotated-Password-42") == 200
