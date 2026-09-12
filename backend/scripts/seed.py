"""Idempotent demonstration seed.

Running this twice must not create a second copy of anything. That is achieved
by giving every seeded row a *stable, deterministic* natural key:

* jobs         – the ``job_code`` in ``seed/jobs.json`` (JOB-2026-0001 …)
* applications – ``APP-2026-S<nnn>``, derived from a fixed random seed
* admin        – the email address from ``ADMIN_EMAIL``

so each seed row is looked up first and only inserted when missing.

    python -m scripts.seed                          # jobs + admin + demo applications
    python -m scripts.seed --no-demo                # jobs + admin only
    python -m scripts.seed --reset-admin-password   # also set ADMIN_EMAIL's password
                                                    # to ADMIN_PASSWORD (recovery)
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.application import Application
from app.models.enums import ApplicationStatus, EmploymentType
from app.models.job import Job
from app.services.auth import AuthService

# Works both in the container (/seed) and from a checkout (../seed).
SEED_CANDIDATES = [
    Path("/seed/jobs.json"),
    Path(__file__).resolve().parents[2] / "seed" / "jobs.json",
]

# Fixed seed => the same demo applications every time => idempotent codes.
DEMO_RANDOM_SEED = 20260101
DEMO_APPLICATION_COUNT = 40

FIRST_NAMES = [
    "Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Ishita", "Kabir", "Meera",
    "Rohan", "Saanvi", "Aditya", "Neha", "Karthik", "Priya", "Farhan", "Tanvi",
    "Rahul", "Sneha", "Imran", "Lakshmi",
]
LAST_NAMES = [
    "Sharma", "Iyer", "Verma", "Nair", "Reddy", "Bose", "Khan", "Menon",
    "Gupta", "Desai", "Rao", "Chatterjee", "Pillai", "Joshi", "Malhotra",
]
EXPERIENCES = ["0-1 years", "1-2 years", "2-4 years", "3-5 years", "5-7 years", "8+ years"]
# Weighted so the pipeline looks like a real funnel rather than a flat spread.
STATUS_WEIGHTS = [
    (ApplicationStatus.APPLIED, 40),
    (ApplicationStatus.SCREENING, 22),
    (ApplicationStatus.INTERVIEW, 18),
    (ApplicationStatus.SELECTED, 8),
    (ApplicationStatus.REJECTED, 12),
]

COVER_NOTES = [
    "I have followed your engineering blog for a while and would love to work on this problem.",
    "My last role covered most of this scope; I am looking for more ownership.",
    "Happy to share code samples and walk through architecture decisions I have made.",
    "I am relocating to this city next month and this role matches my background closely.",
    "",
]


def _seed_file() -> Path:
    for path in SEED_CANDIDATES:
        if path.is_file():
            return path
    raise SystemExit(f"seed/jobs.json not found. Looked in: {[str(p) for p in SEED_CANDIDATES]}")


def seed_jobs(db: Session) -> tuple[int, int]:
    """Upsert by job_code. Returns (created, updated)."""
    payload = json.loads(_seed_file().read_text(encoding="utf-8"))
    created = updated = 0

    for entry in payload:
        job = db.execute(
            select(Job).where(Job.job_code == entry["job_code"])
        ).scalar_one_or_none()

        fields = {
            "title": entry["title"],
            "department": entry["department"],
            "location": entry["location"],
            "employment_type": EmploymentType(entry["employment_type"]),
            "description": entry["description"],
            "responsibilities": entry["responsibilities"],
            "skills": entry["skills"],
            "experience_required": entry["experience_required"],
            "is_active": entry.get("is_active", True),
        }

        if job is None:
            db.add(Job(job_code=entry["job_code"], **fields))
            created += 1
        else:
            # Re-running the seed refreshes the copy but never duplicates a row.
            for key, value in fields.items():
                setattr(job, key, value)
            updated += 1

    db.commit()
    return created, updated


def seed_admin(db: Session, reset_password: bool = False) -> str:
    """Creates the bootstrap administrator if it does not exist yet.

    An existing admin's password is deliberately left untouched, so re-seeding
    never resets a password somebody has already changed — unless the operator
    explicitly asks for it with ``--reset-admin-password``.

    Returns what happened: "created", "password reset" or "already present".
    """
    service = AuthService(db)
    _, was_created = service.ensure_admin(
        email=settings.admin_email,
        password=settings.admin_password,
        full_name="Demo Administrator",
    )
    if was_created:
        return "created"
    if reset_password:
        service.reset_password(settings.admin_email, settings.admin_password)
        return "password reset"
    return "already present"


def _status_plan(total: int) -> list[ApplicationStatus]:
    """Distribute `total` applications across the pipeline by fixed proportions."""
    weight_total = sum(weight for _, weight in STATUS_WEIGHTS)
    plan: list[ApplicationStatus] = []
    for status, weight in STATUS_WEIGHTS:
        plan.extend([status] * round(total * weight / weight_total))
    # Rounding can leave the plan a row or two short or long.
    while len(plan) < total:
        plan.append(ApplicationStatus.APPLIED)
    return plan[:total]


def seed_demo_applications(db: Session) -> int:
    """Clearly fictional candidates spread across the pipeline."""
    jobs = list(db.execute(select(Job).where(Job.is_active.is_(True))).scalars().all())
    if not jobs:
        return 0

    rng = random.Random(DEMO_RANDOM_SEED)
    # Exact proportions rather than weighted random draws, so the seeded
    # dashboard always shows a believable funnel instead of whatever 40 coin
    # flips happened to produce.
    statuses = _status_plan(DEMO_APPLICATION_COUNT)
    rng.shuffle(statuses)
    now = datetime.now(UTC)
    created = 0
    # Tracks (job_id, email) inside this run so the generated data itself does
    # not violate the one-live-application-per-candidate rule.
    used: set[tuple[int, str]] = set()

    for index in range(1, DEMO_APPLICATION_COUNT + 1):
        code = f"APP-2026-S{index:03d}"
        if db.execute(
            select(Application).where(Application.application_code == code)
        ).scalar_one_or_none():
            continue  # already seeded: idempotent

        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        job = rng.choice(jobs)
        email = f"{first}.{last}{index}@example.com".lower()  # RFC 2606 reserved documentation domain
        status = statuses[index - 1]

        if status != ApplicationStatus.REJECTED and (job.id, email) in used:
            continue
        used.add((job.id, email))

        submitted = now - timedelta(days=rng.randint(0, 45), hours=rng.randint(0, 23))
        application = Application(
            application_code=code,
            job_id=job.id,
            name=f"{first} {last}",
            email=email,
            phone=f"+91 9{rng.randint(100000000, 999999999)}",
            experience=rng.choice(EXPERIENCES),
            profile_url=f"https://github.com/{first.lower()}-{last.lower()}",
            cover_note=rng.choice(COVER_NOTES) or None,
            status=status,
            admin_notes=(
                "Seeded demonstration data. Strong match on the core skills."
                if status in {ApplicationStatus.INTERVIEW, ApplicationStatus.SELECTED}
                else None
            ),
        )
        # Timestamps are set explicitly so the dashboard has a believable history
        # instead of forty applications submitted in the same second.
        application.created_at = submitted
        application.updated_at = submitted + timedelta(hours=rng.randint(1, 72))
        db.add(application)
        created += 1

    db.commit()
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Mini Job Board database")
    parser.add_argument("--no-demo", action="store_true", help="skip fake applications")
    parser.add_argument(
        "--reset-admin-password",
        action="store_true",
        help="set the existing ADMIN_EMAIL account's password to ADMIN_PASSWORD",
    )
    args = parser.parse_args()

    # Resetting to the published demo password would turn a recovery into a
    # hole: anyone who has read this README could then log in.
    if args.reset_admin_password and settings.admin_password == "ChangeMe123!":
        print("Refusing to reset the admin password to the demo default. Set ADMIN_PASSWORD.")
        return 1

    with SessionLocal() as db:
        created, updated = seed_jobs(db)
        admin_outcome = seed_admin(db, reset_password=args.reset_admin_password)
        demo = 0 if args.no_demo else seed_demo_applications(db)

    print(f"jobs:         {created} created, {updated} refreshed")
    print(f"admin:        {admin_outcome} ({settings.admin_email})")
    print(f"applications: {demo} created")
    if admin_outcome == "created" and settings.admin_password == "ChangeMe123!":
        print("\nWARNING: the bootstrap admin is using the default demo password. "
              "Set ADMIN_PASSWORD before exposing this environment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
