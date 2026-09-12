#!/usr/bin/env bash
# =============================================================================
# Seed jobs, demo applications and the bootstrap admin.
#
#   ./scripts/seed.sh              # against the running docker compose stack
#   TARGET=local ./scripts/seed.sh # against a locally installed venv
#
# The seed is idempotent: every row has a stable natural key, so running this
# twice never produces duplicates.
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

TARGET="${TARGET:-docker}"

cd "${REPO_ROOT}"

case "${TARGET}" in
  docker)
    require_command docker
    docker compose ps --status running --services 2>/dev/null | grep -q '^backend$' \
      || fail "The backend container is not running. Start it with 'docker compose up -d'."
    log "Seeding through the backend container"
    docker compose exec -T backend python -m scripts.seed "$@"
    ;;
  local)
    [ -x backend/.venv/bin/python ] || fail "backend/.venv not found. Run 'make install' first."
    log "Seeding with the local virtualenv"
    (cd backend && .venv/bin/python -m scripts.seed "$@")
    ;;
  *)
    fail "Unknown TARGET '${TARGET}'. Use 'docker' or 'local'."
    ;;
esac

success "Seed complete"
