"""Administrator persistence."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.admin import Admin


class AdminRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, admin_id: int) -> Admin | None:
        return self.db.get(Admin, admin_id)

    def get_by_email(self, email: str) -> Admin | None:
        """Case-insensitive: recruiters type "Admin@..." and expect it to work."""
        stmt = select(Admin).where(func.lower(Admin.email) == email.strip().lower())
        return self.db.execute(stmt).scalar_one_or_none()

    def add(self, admin: Admin) -> Admin:
        self.db.add(admin)
        self.db.flush()
        return admin

    def count(self) -> int:
        return self.db.execute(select(func.count(Admin.id))).scalar_one()
