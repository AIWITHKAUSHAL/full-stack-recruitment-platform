# CLAUDE.md — Mini Job Board Application Tracker

**Read this file before modifying anything in this repository.**

---

## 1. Project objective

**Mini Job Board Application Tracker** is a lightweight careers portal and candidate
application tracking system for a startup that is not yet ready to buy a full
Applicant Tracking System.

Two roles:

| Role | Can do |
|------|--------|
| **Candidate** (public, unauthenticated) | Browse active jobs, search/filter, read a job, apply, optionally upload a resume, receive an application code, track status with `code + email` |
| **Administrator** (authenticated) | Log in, see hiring stats, create/edit/activate/deactivate jobs, list & filter applications, open a candidate, read resume, add notes, move status through the pipeline |

Pipeline: `APPLIED → SCREENING → INTERVIEW → SELECTED`, with `REJECTED` reachable
from `APPLIED`, `SCREENING`, `INTERVIEW`.

This repository is a **teaching / demonstration / portfolio** project. It is
production-*style*, not production-*scale*.

---

## 2. Architecture

```
Browser ──► CloudFront ──┬──► S3 (private, OAC)      static React build
                         └──► ALB ──► ECS Fargate ──► FastAPI ──► RDS PostgreSQL
                                                          └─────► S3 (private) resumes
```

Local:

```
React (Vite :5173) ──► FastAPI (:8000) ──► PostgreSQL (:5432)
```

CI/CD:

```
Git ─► GitHub ─► GitHub Actions ─► tests ─► docker build ─► ECR ─► ECS ─► ALB ─► CloudFront
```

---

## 3. Technology stack

- **Frontend**: React 18, TypeScript, Vite, React Router, Axios, Tailwind CSS, Vitest
- **Backend**: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, Uvicorn,
  psycopg 3, boto3, PyJWT, bcrypt (used directly — no passlib)
- **Database**: PostgreSQL 16 (local Docker) / Amazon RDS PostgreSQL (AWS)
- **Storage**: Amazon S3 (private) for resumes and for the frontend build
- **Infra**: Terraform >= 1.6, AWS provider ~> 5.x, region `us-east-1`
- **Compute**: Docker, Amazon ECR, Amazon ECS on AWS Fargate
- **CI/CD**: GitHub Actions with GitHub OIDC (no long-lived AWS keys)

---

## 4. Directory structure

```
backend/app/api/v1     thin HTTP route handlers
backend/app/core       config, security, logging, middleware, exceptions
backend/app/db         SQLAlchemy engine/session/base
backend/app/models     SQLAlchemy ORM models
backend/app/schemas    Pydantic request/response models
backend/app/repositories  ALL SQLAlchemy query construction
backend/app/services   business rules, orchestration
backend/alembic        migrations (the only way the schema changes)
backend/tests          pytest suite
frontend/src/...       React app (api/ components/ pages/ hooks/ types/ auth/ router/)
docs/screenshots       UI screenshots referenced by the README
terraform/             one .tf file per AWS concern, flat, no needless modules
scripts/               bootstrap / deploy / destroy / seed / verify
seed/jobs.json         seed job catalogue
load-test/test.js      k6 read-heavy smoke load test
```

---

## 5. Backend rules

1. **Routes are thin.** A route receives the request, resolves dependencies,
   calls exactly one service method, returns a Pydantic schema. No business
   logic, no SQLAlchemy queries in routes.
2. **Services own business rules**: status-transition legality, duplicate
   application rules, application-code generation, resume-upload orchestration.
3. **Repositories own SQLAlchemy.** Only files under `app/repositories/` may
   build `select()` / `Session.execute()` queries. Services never import
   `sqlalchemy` query constructs.
4. Enums live in `app/models/enums.py` and are the single source of truth for
   `EmploymentType` and `ApplicationStatus`. Never compare against raw strings.
5. All errors raise `AppError` subclasses from `app/core/exceptions.py`. The
   global handler renders the standard envelope — never `raise HTTPException`
   with an ad-hoc body in a route.
6. Every response body for an error looks like:
   `{"success": false, "error": {"code": "...", "message": "..."}, "request_id": "..."}`
7. Settings come from `app/core/config.py` (pydantic-settings). Never read
   `os.environ` directly elsewhere. List-valued settings are held as
   comma-separated strings, because pydantic-settings JSON-decodes complex
   types straight from the environment before any validator can run — see
   `cors_origins` / `cors_origin_list`.

## 6. API rules

- Everything is under `/api/v1`. Health endpoints (`/health`, `/health/ready`)
  sit at the root because the ALB target group points at `/health`.
- `POST /api/v1/jobs/{id}/applications` takes `multipart/form-data`, not JSON,
  so the optional resume travels with the form in one request.
- Public endpoints must never return inactive jobs or another candidate's data.
- Admin endpoints require `Authorization: Bearer <jwt>` via the
  `get_current_admin` dependency. There is no "admin flag in a query param".
- Pagination envelope is always `{items, page, page_size, total, pages}`.

## 7. Database rules

- **Schema changes go through Alembic only.** `Base.metadata.create_all()` is
  permitted in the test fixture and nowhere else.
- Every FK, unique constraint and index listed in the README schema section must
  exist in the migration.
- Column types stay portable (no `JSONB`, no PG `ARRAY`) so the test suite can
  run on SQLite and the app can run on PostgreSQL with identical code.
- Enums are stored as `VARCHAR` with a CHECK constraint
  (`sa.Enum(..., native_enum=False)`), not as PostgreSQL native enum types —
  this keeps migrations simple and avoids `ALTER TYPE` pain.

## 8. Authentication rules

- Admin passwords are hashed with bcrypt (`app/core/security.py`, the `bcrypt`
  package directly). Plaintext passwords are never stored,
  never logged, never returned.
- JWTs are HS256, carry `sub`, `iat`, `exp`, and expire (default 60 min).
- `JWT_SECRET_KEY` comes from the environment. The insecure development default
  must never be used when `ENVIRONMENT != "local"` — the app refuses to start.
- Never log a JWT, a password, or an `Authorization` header.

## 9. Resume rules

- Allowed: `.pdf`, `.doc`, `.docx`; max 5 MB; MIME type and extension both
  validated server-side; the stored filename is generated, never taken from the
  client.
- Object key: `resumes/<APPLICATION_CODE>/resume.<ext>`. Only that key is stored
  in PostgreSQL — never the binary.
- The bucket is private. Admin access is via a short-lived presigned GET URL
  generated by the backend. In the local fallback the equivalent is a signed,
  single-purpose download token in the query string (`create_download_token`).
- When `S3_RESUME_BUCKET` is unset (pure local dev), the storage service falls
  back to a local directory so the app still runs. It logs a warning; it does
  not silently pretend to have uploaded.

## 10. AWS architecture rules

- RDS is in private subnets, `publicly_accessible = false`, and its security
  group accepts 5432 **only** from the ECS security group.
- ECS tasks accept 8000 **only** from the ALB security group.
- Both S3 buckets have Public Access Block fully on; CloudFront reaches the
  frontend bucket through Origin Access Control.
- No `0.0.0.0/0` rule anywhere except the ALB's :80 ingress.
- No NAT Gateway: ECS tasks run in public subnets with `assign_public_ip = true`
  (documented cost decision — a NAT Gateway is ~$32/month, this demo is not).

## 11. Terraform rules

- Flat files, one AWS concern per file. Modules only where they genuinely help.
- Every resource carries the default tags
  `Project=MiniJobBoardApplicationTracker`, `Environment=dev`, `ManagedBy=Terraform`.
- Name prefix is `mini-job-board-dev` (from `locals.tf`).
- Any resource that costs real money carries a `# COST:` comment.
- `terraform destroy` must always work. No `prevent_destroy`, no retained
  snapshots or automated backups, buckets are `force_destroy = true`, ECR is
  `force_delete = true`.
- Anything AWS would create on the project's behalf (e.g. the RDS log-export
  log group) must be declared in Terraform, so it is in the state and
  `terraform destroy` removes it. `make destroy-check` must come back clean.
- Run `terraform fmt`, `terraform validate` and review `terraform plan` before
  every apply.

## 12. Security requirements

Pydantic validation on every input, strict enums, restricted CORS, bcrypt,
expiring JWTs, validated uploads, parameterised SQL (SQLAlchemy), least-privilege
IAM, private S3, private RDS, secrets outside source control. See `RESTRICTIONS.md`.

## 13. Cost requirements

`db.t4g.micro`, 20 GB gp3, single-AZ, 1 Fargate task at 256 CPU / 512 MB,
7-day log retention, CloudFront `PriceClass_100`, no NAT, no WAF, no Route 53.
Rough idle cost is documented in the README; do not add services that change it
without saying so.

## 14. Testing requirements

- `make test` must pass before any change is considered done.
- Backend: pytest, SQLite-backed fixture, one test per behaviour listed in the
  README testing section.
- Frontend: Vitest + Testing Library for rendering, filtering, form validation,
  submission, tracking, admin login, dashboard, status change, loading, error.

## 15. CI/CD rules

- `ci.yml` runs on PRs and pushes: backend lint+tests, frontend lint+test+build,
  `terraform fmt -check` and `terraform validate`. **Pull requests never deploy.**
- `deploy.yml` runs on push to `main` or `workflow_dispatch`: OIDC → tests →
  build → ECR (tagged with the git SHA, plus `latest`) → migrate → ECS deploy →
  health check → S3 sync → CloudFront invalidation.

## 16. Deployment / destroy process

```
make infra-init && make infra-plan && make infra-apply   # create AWS infra
make deploy                                              # build+push+migrate+release+frontend
make destroy                                             # stop one-off tasks, empty buckets, terraform destroy, verify
make destroy-check                                       # read-only: anything from this project still in AWS?
```

`scripts/destroy.sh` empties **only** the two bucket names emitted by
`terraform output`, stops tasks only in the project cluster, and deregisters
only the project's task definition family. It must never run a broad
`aws s3 rb` across the account. `scripts/check-leftovers.sh` only lists
resources and never deletes anything.

## 17. Teaching requirements

Comments explain *why* a layer or service exists, not what a line of Python
does. Keep the code boring, typed, and explainable in a screen-recording.

---

## 18. Standing instructions

- Always inspect existing files before modifying them.
- Never rewrite a working component unnecessarily.
- Never introduce a new AWS service without justification.
- Never hardcode credentials.
- Never expose PostgreSQL publicly.
- Never make S3 public.
- Never bypass authentication for admin APIs.
- Never create Kubernetes resources.
- Never introduce unnecessary microservices.
- Always use Alembic for schema changes.
- Always run relevant tests after changes.
- Always keep documentation synchronized with implementation.
- Always keep `terraform destroy` working.
