"""Alembic environment.

Why Alembic rather than ``Base.metadata.create_all()``: a deployed database
already contains data. ``create_all`` can only create missing tables — it cannot
add a column, change a type or backfill a value. Migrations give every
environment the same, reviewable, repeatable schema history, and the deploy
pipeline runs ``alembic upgrade head`` before new tasks take traffic.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.db.metadata import target_metadata  # imports every model

config = context.config

# The URL comes from the environment, never from alembic.ini — and it is passed
# straight to SQLAlchemy rather than through config.set_main_option(). Alembic's
# config is a ConfigParser, which treats '%' as interpolation syntax: a
# URL-encoded password such as 'p%24ss' makes it crash, and its error message
# echoes the full URL, password included, into the logs.

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Generate SQL without a live connection (``alembic upgrade head --sql``)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(settings.database_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # Needed for SQLite, harmless on PostgreSQL: lets ALTER-style
            # operations work in the test database too.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
