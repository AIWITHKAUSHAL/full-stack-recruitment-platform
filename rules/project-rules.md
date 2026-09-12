# Project Rules — Mini Job Board Application Tracker

These rules are the short, checkable version of `CLAUDE.md`. If a change breaks
one of them, the change is wrong.

## R1 — Layering

```
route → service → repository → SQLAlchemy → PostgreSQL
```

- A route may not import `sqlalchemy` query constructs.
- A service may not import `sqlalchemy.select`.
- A repository may not raise HTTP errors.
- Only `app/services/` decides whether something is allowed.

## R2 — One source of truth for enums

`EmploymentType` and `ApplicationStatus` live in `app/models/enums.py`, are
re-exported to Pydantic schemas, and are mirrored once in
`frontend/src/types/api.ts`. No string literals like `"interview"` anywhere else.

## R3 — Status transitions live in one place

`ApplicationStatus.can_transition(from, to)` is the only implementation of the
pipeline rules. Routes, admin UI and tests all defer to it.

```
APPLIED → SCREENING → INTERVIEW → SELECTED
APPLIED | SCREENING | INTERVIEW → REJECTED
```

Any other transition raises `InvalidStatusTransitionError`.

## R4 — Public data is minimal

The candidate tracking response contains exactly:
`application_code, job_title, job_code, status, submitted_at, last_updated_at`.
Adding `admin_notes`, `id`, `email` or any other applicant's data to that
response is a security bug.

## R5 — Errors are enveloped

Every 4xx/5xx has `{"success": false, "error": {"code", "message"}, "request_id"}`.
Error codes come from `app/core/exceptions.py`. No stack traces, no SQL, no
credentials reach the client.

## R6 — Validation happens on the server

Frontend validation is a convenience. Every rule (required fields, email format,
URL format, file type, file size, status transition) is enforced again in
Pydantic or the service layer.

## R7 — Alembic is the schema

Model change without a migration = broken change. `alembic upgrade head` runs on
deploy, before the new tasks take traffic.

## R8 — Terraform is the infrastructure

No click-ops. If it exists in AWS for this project, it exists in `terraform/`,
it is tagged, expensive resources carry a `# COST:` comment, and
`terraform destroy` removes it.

## R9 — Cost discipline

Before adding an AWS resource, answer in the PR/commit message:
1. What does it cost at idle?
2. What breaks without it?
3. Can an existing resource do the job?

## R10 — Tests and docs ship with the change

`make test` passes, `make lint` passes, the frontend builds, and the README
section describing the changed behaviour is updated in the same change.
