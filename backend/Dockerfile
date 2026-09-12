# =============================================================================
# Backend container image (FastAPI)
#
# Multi-stage: dependencies are installed into a virtualenv in a builder stage
# so the runtime image carries no compiler toolchain and no pip cache.
#
# Built for linux/amd64 in CI because AWS Fargate runs x86_64 by default —
# an image built on an Apple Silicon laptop without --platform will start and
# then die with "exec format error".
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not backend/:
#
#     docker build -f backend/Dockerfile .
#
# The seed catalogue lives in seed/jobs.json at the root and must ship inside
# the image so `python -m scripts.seed` works as a one-off ECS task. A backend/
# context could not reach it.
# =============================================================================

# ---------------------------------------------------------------- builder ---
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Only what psycopg and friends need to build; discarded with this stage.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

# ---------------------------------------------------------------- runtime ---
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# curl is used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user: a compromised process should not be root.
RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser --create-home appuser

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:appuser backend/alembic.ini ./
COPY --chown=appuser:appuser backend/alembic ./alembic
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/scripts ./scripts

# scripts/seed.py looks for /seed/jobs.json first, then ../seed relative to the
# package — both resolve here.
COPY --chown=appuser:appuser seed /seed

# The local-storage fallback directory must be writable by the app user.
RUN mkdir -p /app/.local-storage && chown -R appuser:appuser /app/.local-storage

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# No --reload in the image: reload watches the filesystem and forks a reloader
# process, neither of which belongs in a Fargate task.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
