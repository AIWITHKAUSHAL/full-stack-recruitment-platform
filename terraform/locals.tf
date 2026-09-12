locals {
  # Every resource name starts with this, so the whole project is identifiable
  # at a glance in the console: mini-job-board-dev-alb, mini-job-board-dev-ecs…
  name_prefix = "${var.project_name}-${var.environment}"

  # Bucket names must be globally unique, so the account id is appended.
  account_id = data.aws_caller_identity.current.account_id

  frontend_bucket_name = "${local.name_prefix}-frontend-${local.account_id}"
  resume_bucket_name   = "${local.name_prefix}-resumes-${local.account_id}"

  # Two AZs: the minimum an Application Load Balancer and an RDS subnet group
  # both require. Not three — that would add subnets for no benefit here.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # CloudFront serves the SPA *and* proxies /api/* to the ALB, so the browser
  # only ever talks to one origin. That is why the CloudFront URL is the only
  # CORS origin the API needs in addition to local development.
  cloudfront_url = "https://${aws_cloudfront_distribution.frontend.domain_name}"

  # With a custom domain attached, the page may be loaded from it while a
  # frontend built by CI still calls the absolute *.cloudfront.net API URL, so
  # both hostnames of the custom domain are allowed too.
  cors_origins = join(",", concat(
    [local.cloudfront_url],
    [for name in local.cloudfront_aliases : "https://${name}"],
    var.allowed_frontend_origins,
  ))
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_region" "current" {}
