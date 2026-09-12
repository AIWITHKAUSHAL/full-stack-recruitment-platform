# =============================================================================
# Outputs
#
# These are the contract between Terraform and the deployment scripts:
# scripts/deploy.sh, verify.sh and destroy.sh read them with `terraform output`
# so no bucket name, cluster name or URL is ever hardcoded in a script.
# =============================================================================

output "application_url" {
  description = "Public URL of the deployed application. Open this one."
  value       = local.cloudfront_url
}

output "cloudfront_url" {
  description = "CloudFront distribution URL (same as application_url)."
  value       = local.cloudfront_url
}

output "cloudfront_distribution_id" {
  description = "Distribution id, used for cache invalidation after a frontend deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "api_url" {
  description = "Base URL of the versioned API, served through CloudFront."
  value       = "${local.cloudfront_url}/api/v1"
}

output "swagger_url" {
  description = "Interactive API documentation."
  value       = "${local.cloudfront_url}/docs"
}

output "alb_dns_name" {
  description = "Load balancer hostname. Useful for debugging CloudFront out of the path."
  value       = aws_lb.main.dns_name
}

output "frontend_bucket_name" {
  description = "Private S3 bucket holding the compiled React app."
  value       = aws_s3_bucket.frontend.id
}

output "resume_bucket_name" {
  description = "Private S3 bucket holding candidate resumes."
  value       = aws_s3_bucket.resumes.id
}

output "ecr_repository_url" {
  description = "Push the backend image here."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.backend.name
}

output "ecs_task_definition_family" {
  description = "Task definition family the deploy script creates new revisions of."
  value       = aws_ecs_task_definition.backend.family
}

output "ecs_task_security_group_id" {
  description = "Security group used when running one-off migration tasks."
  value       = aws_security_group.ecs.id
}

output "ecs_task_subnet_ids" {
  description = "Subnets used when running one-off migration tasks."
  value       = aws_subnet.public[*].id
}

output "rds_endpoint" {
  description = "PostgreSQL endpoint. Reachable only from inside the VPC."
  value       = aws_db_instance.main.address
}

output "database_url_parameter" {
  description = "SSM parameter holding the connection string. The value itself is never output."
  value       = aws_ssm_parameter.database_url.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group receiving the FastAPI structured logs."
  value       = aws_cloudwatch_log_group.ecs.name
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name."
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "cloudwatch_dashboard_url" {
  description = "Direct link to the dashboard."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "github_actions_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_ARN secret (or variable) in GitHub."
  value       = aws_iam_role.github_actions.arn
}

output "aws_region" {
  description = "Region everything was created in."
  value       = var.aws_region
}

# destroy.sh reads these two before destroying and hands them to
# check-leftovers.sh, which has to work after the state (and its outputs) is gone.
output "name_prefix" {
  description = "Prefix on every resource name."
  value       = local.name_prefix
}

output "project_tag" {
  description = "Value of the Project tag carried by every resource."
  value       = var.project_display_name
}

# ----------------------------------------------------------------- sensitive --
# The database password is deliberately NOT an output, not even a sensitive one.
# It exists in the Terraform state (git-ignored) and in SSM, and the application
# reads it from SSM. Nobody needs to see it (RESTRICTIONS.md #3).

output "db_username" {
  description = "Master username. The password lives only in SSM Parameter Store."
  value       = var.db_username
  sensitive   = true
}
