#!/usr/bin/env sh
# Container entrypoint used by docker-compose only.
#
# It waits for PostgreSQL, applies migrations and (optionally) seeds demo data
# before starting uvicorn with reload. On AWS these are separate, explicit
# deployment steps — a production container must not migrate its own database
# on every start, because N tasks would race each other.
set -e

echo "[start-dev] waiting for PostgreSQL ..."
python - <<'PY'
import time
from sqlalchemy import create_engine, text
from app.core.config import settings

for attempt in range(30):
    try:
        create_engine(settings.database_url).connect().execute(text("SELECT 1"))
        print("[start-dev] database is up")
        break
    except Exception as exc:  # noqa: BLE001 - startup loop
        print(f"[start-dev] attempt {attempt + 1}/30: {type(exc).__name__}")
        time.sleep(2)
else:
    raise SystemExit("[start-dev] database never became reachable")
PY

if [ "${RUN_MIGRATIONS_ON_START}" = "true" ]; then
  echo "[start-dev] alembic upgrade head"
  alembic upgrade head
fi

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[start-dev] seeding demo data (idempotent)"
  python -m scripts.seed
fi

echo "[start-dev] starting uvicorn on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
