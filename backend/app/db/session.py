"""Engine, session factory and the FastAPI ``get_db`` dependency.

Why a pool: every ECS task holds a small pool of PostgreSQL connections.
RDS ``db.t4g.micro`` allows a limited number of connections, so the pool is
deliberately small (5 + 10 overflow per task) and recycles connections before
idle timeouts turn them into errors.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _create_engine() -> Engine:
    url = settings.database_url
    # SQLite is only ever used by the test fixture; it needs different arguments
    # and has no real connection pool to configure.
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, future=True)
    return create_engine(
        url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle_seconds,
        pool_pre_ping=True,  # survives RDS failovers / dropped idle connections
        future=True,
    )


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Iterator[Session]:
    """Request-scoped session. Commits are explicit, in the service layer."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_is_reachable() -> bool:
    """Used by /health/ready — a cheap round trip, not a full query."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
