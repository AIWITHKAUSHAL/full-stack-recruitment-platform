# RESTRICTIONS.md — Mini Job Board Application Tracker

# ABSOLUTE RESTRICTIONS

These are not preferences. They are hard rules for this repository.

## Claude MUST NOT:

1. Commit AWS access keys.
2. Commit AWS secret keys.
3. Commit database passwords.
4. Store plaintext admin passwords.
5. Hardcode database credentials.
6. Make RDS publicly accessible.
7. Make the resume S3 bucket public.
8. Make the frontend S3 bucket public.
9. Expose ECS directly to the internet.
10. Create unrestricted PostgreSQL security-group access.
11. Create EKS.
12. Create Kubernetes manifests.
13. Add Kafka.
14. Add MSK.
15. Add OpenSearch.
16. Add unnecessary event buses.
17. Add unnecessary queues.
18. Add unnecessary microservices.
19. Add Route 53 unless explicitly requested.
20. Create a NAT Gateway without clear justification.
21. Create Multi-AZ RDS for this demo without explicit approval.
22. Create production-sized AWS infrastructure.
23. Store resume binary data in PostgreSQL.
24. Trust frontend-only validation.
25. Allow unauthenticated access to admin APIs.
26. Log admin passwords.
27. Log JWT access tokens.
28. Log AWS credentials.
29. Log database credentials.
30. Log resume content.
31. Bypass Alembic for database schema changes.
32. Destroy AWS resources unrelated to this project.
33. Run broad AWS delete commands.
34. Hardcode frontend API URLs in many components.
35. Put business logic directly into random route handlers.
36. Duplicate database query logic unnecessarily.
37. Claim the tiny demo infrastructure is enterprise-scale.
38. Claim it handles millions of requests per second.
39. Replace working architecture simply because another technology is fashionable.
40. Leave important implementation as unexplained TODOs.

---

## Enforcement notes

| Restriction | How this repo enforces it |
|---|---|
| No committed secrets | `.gitignore` excludes environment files, Terraform state/variables/plans, cloud credentials, private keys and package-manager auth files; `make secrets-check` scans every file eligible for commit, and CI runs the same check |
| No plaintext admin password | `app/core/security.py` bcrypt-hashes on the way in; `admins.password_hash` is the only stored form |
| RDS private | `terraform/rds.tf`: `publicly_accessible = false`, DB subnet group uses private subnets only |
| No open DB SG | `terraform/security_groups.tf`: RDS ingress `security_groups = [ecs_sg.id]`, never a CIDR |
| S3 private | `terraform/s3.tf`: `aws_s3_bucket_public_access_block` with all four flags `true` on both buckets |
| ECS not internet-facing | ECS SG ingress 8000 only from the ALB SG |
| No secret logging | `app/core/logging.py` logs method/path/status/duration/request_id only; no headers, no bodies |
| Alembic only | `app/db/base.py` exposes metadata; `create_all()` appears only in `tests/conftest.py` |
| Destroy is scoped | `scripts/destroy.sh` reads bucket names from `terraform output` and empties exactly those |

## Honest scale statement

This deployment is **one** Fargate task (256 CPU units / 512 MB) in front of a
**single-AZ `db.t4g.micro`** PostgreSQL instance. It is sized for a classroom
demo and a portfolio walkthrough. It is stateless and can scale horizontally to
4 tasks, but nobody should describe it as enterprise-scale or as handling
millions of requests. Do not write such claims in the README, the UI, or the
video script.
