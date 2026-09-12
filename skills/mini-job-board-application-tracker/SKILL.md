---
name: mini-job-board-application-tracker
description: Workflows for extending, deploying and destroying the Mini Job Board Application Tracker. Use when adding a backend feature, a frontend feature, a Terraform resource, or when deploying to / destroying AWS.
---

# Skill: Mini Job Board Application Tracker

Read `CLAUDE.md` and `RESTRICTIONS.md` first. Every workflow below assumes the
layering rule: **route → service → repository → SQLAlchemy → PostgreSQL**.

---

## Skill: Add Backend Feature

```
inspect route structure      backend/app/api/v1/*.py
inspect schema               backend/app/schemas/*.py
inspect model                backend/app/models/*.py
inspect repository           backend/app/repositories/*.py
inspect service              backend/app/services/*.py
design change                which layer owns the new rule?
implement                    smallest change that respects the layering
add tests                    backend/tests/test_*.py
run tests                    make test-backend
update docs                  README API summary + CLAUDE.md if a rule changed
```

Checklist:
- [ ] New DB column? → new Alembic migration, never `create_all`.
- [ ] New enum value? → `app/models/enums.py` **and** `frontend/src/types/api.ts`.
- [ ] New error case? → new code in `app/core/exceptions.py`, documented in README.
- [ ] Admin-only? → depends on `get_current_admin`.

## Skill: Add Frontend Feature

```
inspect current components   frontend/src/components/**
inspect API types            frontend/src/types/api.ts
reuse existing UI            Button, Card, FormField, StatusBadge, EmptyState, ...
implement                    typed props, no fetch calls inside components
validate loading/error       every async view needs loading + empty + error states
run lint                     npm run lint
run build                    npm run build
run tests                    npm run test
update docs                  README screenshots/feature list
```

Checklist:
- [ ] All HTTP goes through `src/api/client.ts` (single axios instance, single base URL).
- [ ] No hardcoded `http://localhost:8000` outside `src/api/client.ts`.
- [ ] Admin pages sit behind `<ProtectedRoute>`.
- [ ] Mobile layout checked at 375 px — no horizontal overflow.

## Skill: Add Terraform Resource

```
verify requirement     what user-visible behaviour needs it?
check cost             idle $/month; add a "# COST:" comment if non-zero
check dependency       does it force a NAT Gateway / VPC endpoint / new AZ?
check security impact   does it widen an SG, or make a bucket reachable?
implement              correct file in terraform/, flat, tagged
tag resource           inherited from provider default_tags; add Name
terraform fmt
terraform validate
terraform plan         read it; no surprise replacements of RDS/ECR
update outputs         terraform/outputs.tf if operators need the value
update docs            README Terraform section + cost table
```

Forbidden without an explicit request: EKS, Kafka/MSK, OpenSearch, Route 53,
WAF, NAT Gateway, Multi-AZ RDS, ElastiCache, API Gateway.

## Skill: Deploy

```
test backend           make test-backend
test frontend          make test-frontend
terraform validate     make infra-validate
build image            docker build backend/ (linux/amd64 — Fargate is x86_64)
push ECR               aws ecr get-login-password | docker login; docker push <sha>
migrate database       ECS run-task with command: alembic upgrade head
deploy ECS             aws ecs update-service --force-new-deployment; wait services-stable
health check           curl -f $ALB/health   → 200
build frontend         VITE_API_BASE_URL=https://<cloudfront>/api/v1 npm run build
S3 sync                aws s3 sync dist/ s3://<frontend-bucket> --delete
CloudFront invalidate  aws cloudfront create-invalidation --paths "/*"
print URL              https://<distribution>.cloudfront.net
```

Migration runs **before** the new task set serves traffic. Migrations must be
backward compatible with the running image for the seconds both versions overlap.

## Skill: Destroy

```
make destroy                 runs every step below
identify project resources   terraform output -json  (never `aws s3 ls | xargs`)
stop one-off ECS tasks       run-task migrations/seed in ecs_cluster_name only
empty project-owned buckets  only frontend_bucket_name and resume_bucket_name
run terraform destroy        terraform destroy -auto-approve  (one retry)
deregister task defs         ecs_task_definition_family revisions only
verify removal               terraform state list  → empty
verify nothing billable      scripts/check-leftovers.sh  (read-only; make destroy-check)
never touch unrelated resources
```

Destroy order matters: one-off tasks must be stopped (the cluster cannot be
deleted while one runs), and S3 buckets must be emptied (Terraform cannot delete
a non-empty bucket even with `force_destroy` if versions linger). ECR images go
with `force_delete`, and the rest unwinds automatically.

When adding a Terraform resource, check whether AWS creates anything alongside
it that Terraform does not track (log groups, snapshots). If it does, declare it
too — otherwise it survives `terraform destroy` and keeps billing.

## Skill: Debug a failing ECS task

```
aws ecs describe-services   --cluster <c> --services <s>   → events
aws ecs describe-tasks      --cluster <c> --tasks <t>      → stoppedReason
aws logs tail /ecs/mini-job-board-dev --follow             → application traceback
aws elbv2 describe-target-health --target-group-arn <tg>   → why unhealthy
```

Usual causes, in order of frequency: wrong `DATABASE_URL`, security group not
allowing 5432 from the ECS SG, image built for arm64 instead of amd64, migration
not run so a table is missing, health check path/port mismatch.
