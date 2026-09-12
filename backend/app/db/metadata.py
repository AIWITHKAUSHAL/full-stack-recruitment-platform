"""Single import surface for Alembic autogenerate.

Importing this module guarantees every ORM class is registered on
``Base.metadata``. ``alembic/env.py`` imports it and nothing else.
"""

from app.db.base import Base
from app.models.admin import Admin
from app.models.application import Application
from app.models.job import Job

__all__ = ["Base", "Admin", "Application", "Job"]

target_metadata = Base.metadata
