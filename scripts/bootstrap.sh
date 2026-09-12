#!/usr/bin/env bash
# =============================================================================
# One-command local setup.
#
#   ./scripts/bootstrap.sh
#
# Brings up PostgreSQL, the FastAPI backend and the Vite dev server with Docker
# Compose, waits for the API to answer, and prints the URLs. It touches no AWS
# resources and costs nothing.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_command docker

cd "${REPO_ROOT}"

if [ ! -f .env ]; then
  log "Creating .env from .env.example"
  cp .env.example .env
  success "Created .env — edit ADMIN_PASSWORD and JWT_SECRET_KEY before using this anywhere real."
fi

log "Building and starting the local stack (postgres + backend + frontend)"
docker compose up --build -d

log "Waiting for the backend to become healthy"
for attempt in $(seq 1 60); do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    success "Backend is up"
    break
  fi
  if [ "${attempt}" -eq 60 ]; then
    docker compose logs --tail=50 backend
    fail "Backend did not become healthy within two minutes."
  fi
  sleep 2
done

# The compose file sets RUN_MIGRATIONS_ON_START and SEED_ON_START, so by this
# point the schema exists and the demo data is in place.
JOB_COUNT="$(curl -fsS 'http://localhost:8000/api/v1/jobs?page_size=1' | sed -n 's/.*"total":\([0-9]*\).*/\1/p')"

cat <<SUMMARY

${BOLD}==========================================================${RESET}
${BOLD}Mini Job Board Application Tracker — running locally${RESET}
${BOLD}==========================================================${RESET}

  Frontend    http://localhost:5173
  API         http://localhost:8000/api/v1/jobs
  Swagger     http://localhost:8000/docs
  Health      http://localhost:8000/health
  PostgreSQL  localhost:5432

  Active jobs seeded: ${JOB_COUNT:-unknown}

  Admin sign-in (from .env):
    email     ${ADMIN_EMAIL:-admin@minijobboard.dev}
    password  ${ADMIN_PASSWORD:-ChangeMe123!}

  Stop with:   docker compose down
  Reset data:  docker compose down -v

${BOLD}==========================================================${RESET}

SUMMARY
