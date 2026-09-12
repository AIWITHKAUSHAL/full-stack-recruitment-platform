"""Declarative base and shared column mixins.

``Base.metadata`` is what Alembic autogenerate compares the live database
against, so every model module must be imported before autogenerate runs —
see ``app/db/metadata.py``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """created_at / updated_at maintained by the database, not by Python.

    Using server-side defaults means a row inserted by a migration, a seed
    script or psql gets correct timestamps too.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
