# =============================================================================
# Mini Job Board Application Tracker — AWS infrastructure
#
# This file is a map, not a place where resources are defined. Each concern
# lives in its own file so that a reader can open exactly the one they care
# about:
#
#   versions.tf          Terraform and provider version constraints, state notes
#   providers.tf         AWS provider and the project-wide default tags
#   variables.tf         every input, with cost notes on the expensive ones
#   locals.tf            naming prefix, bucket names, AZ selection, CORS origins
#
#   network.tf           VPC, subnets, internet gateway, route tables
#   security_groups.tf   ALB -> ECS -> RDS chain, each referencing the previous
#   s3.tf                private frontend and resume buckets
#   cloudfront.tf        one distribution: S3 for the SPA, ALB for /api/*
#   alb.tf               load balancer, target group, listener
#   ecr.tf               container registry and its lifecycle policy
#   ecs.tf               cluster, task definition, service
#   autoscaling.tf       CPU target tracking, 1-4 tasks
#   rds.tf               PostgreSQL, plus secrets in SSM Parameter Store
#   iam.tf               ECS execution role and task role
#   github_oidc.tf       keyless deployment role for GitHub Actions
#   cloudwatch.tf        log group, dashboard, healthy-target alarm
#   outputs.tf           everything an operator or the deploy script needs
#
# Request path:
#
#   Browser ──► CloudFront ──┬──► S3 (private, OAC)        static React build
#                            └──► ALB ──► ECS Fargate ──► FastAPI ──► RDS
#                                                            └──────► S3 resumes
#
# Deploy order on a clean account:
#
#   1. terraform apply            creates everything; the ECS service has no
#                                 image yet, so its tasks fail until step 2
#   2. scripts/deploy.sh          builds and pushes the image, runs migrations,
#                                 releases the service, uploads the frontend
#
# See README.md for the walkthrough and scripts/destroy.sh for teardown.
# =============================================================================
