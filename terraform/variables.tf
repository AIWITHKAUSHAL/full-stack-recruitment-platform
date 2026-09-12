# =============================================================================
# Input variables
#
# Defaults are sized for a low-cost development / classroom environment.
# Anything that changes the monthly bill is called out in its description.
# =============================================================================

# ------------------------------------------------------------------ general --
variable "aws_region" {
  description = "AWS region for every resource in this configuration."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short slug used as the prefix for every resource name."
  type        = string
  default     = "mini-job-board"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "project_name must be lowercase letters, digits and hyphens (3-31 chars)."
  }
}

variable "project_display_name" {
  description = "Human-readable project name used in tags and CloudWatch."
  type        = string
  default     = "MiniJobBoardApplicationTracker"
}

variable "environment" {
  description = "Environment name (dev, staging, prod). Part of every resource name."
  type        = string
  default     = "dev"
}

variable "github_repository" {
  description = "owner/repo of the GitHub repository, used for the OIDC trust policy."
  type        = string
  default     = "your-github-username/mini-job-board-application-tracker"
}

variable "custom_domain" {
  description = "Optional apex domain (e.g. example.com) served by CloudFront alongside www.<domain>. Empty = use only the *.cloudfront.net URL. DNS stays at your registrar; no Route 53."
  type        = string
  default     = ""

  validation {
    condition     = var.custom_domain == "" || can(regex("^([a-z0-9-]+\\.)+[a-z]{2,}$", var.custom_domain))
    error_message = "custom_domain must be a bare lowercase domain like example.com — no https://, no www., no trailing dot."
  }
}

variable "attach_custom_domain" {
  description = "Second step of the custom-domain setup: set true only after the ACM validation CNAMEs are at your registrar. Attaches the certificate and domain to CloudFront."
  type        = bool
  default     = false
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub OIDC provider. Set false when the account already has one (another project made it); this stack then references it and never destroys it."
  type        = bool
  default     = true
}

# ----------------------------------------------------------------- network ---
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnets: the ALB and the ECS tasks live here. Two AZs, because an ALB requires at least two."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnets: RDS only. No internet route, no NAT Gateway."
  type        = list(string)
  default     = ["10.20.11.0/24", "10.20.12.0/24"]
}

# --------------------------------------------------------------------- ecs ---
variable "ecs_task_cpu" {
  description = "Fargate CPU units (256 = 0.25 vCPU). COST: doubling this doubles the compute bill."
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Fargate memory in MiB. Must be a valid pairing with ecs_task_cpu."
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Number of Fargate tasks to run normally. COST: this is a per-task hourly charge."
  type        = number
  default     = 1
}

variable "ecs_min_capacity" {
  description = "Minimum tasks the autoscaler may scale down to."
  type        = number
  default     = 1
}

variable "ecs_max_capacity" {
  description = "Maximum tasks the autoscaler may scale up to. COST: the worst-case compute bill."
  type        = number
  default     = 4
}

variable "ecs_scaling_cpu_target" {
  description = "Average CPU percentage the autoscaler aims to hold."
  type        = number
  default     = 60
}

variable "container_image_tag" {
  description = "Image tag the ECS service runs. CI overrides this with the git SHA; 'latest' is only the first-apply bootstrap value."
  type        = string
  default     = "latest"
}

# --------------------------------------------------------------------- rds ---
variable "db_instance_class" {
  description = "RDS instance class. COST: db.t4g.micro is the cheapest Graviton option and is the intended default."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage in GiB. 20 is the minimum for gp3."
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "16"
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "jobboard"
}

variable "db_username" {
  description = "Master username. The password is generated by Terraform and stored in SSM Parameter Store."
  type        = string
  default     = "jobboard_admin"
}

variable "db_backup_retention_days" {
  description = "Automated backup retention. COST: 0 disables backups entirely; 1 is a cheap, honest minimum for a demo."
  type        = number
  default     = 1
}

variable "db_multi_az" {
  description = "Multi-AZ RDS. COST: roughly doubles the database bill. Off for this demo by design (RESTRICTIONS.md #21)."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------- frontend ---
variable "cloudfront_price_class" {
  description = "CloudFront price class. COST: PriceClass_100 (US/EU only) is the cheapest."
  type        = string
  default     = "PriceClass_100"
}

variable "allowed_frontend_origins" {
  description = "Extra CORS origins for the API, beyond the CloudFront URL that Terraform adds automatically. Local dev origins by default."
  type        = list(string)
  default     = ["http://localhost:5173", "http://127.0.0.1:5173"]
}

# --------------------------------------------------------------- observability
variable "log_retention_days" {
  description = "CloudWatch Logs retention. COST: storage is charged per GB-month; 7 days is plenty for a demo."
  type        = number
  default     = 7
}

# -------------------------------------------------------------------- auth ---
variable "jwt_expire_minutes" {
  description = "Admin access-token lifetime in minutes."
  type        = number
  default     = 60
}

variable "resume_retention_days" {
  description = "Days before an uploaded resume is expired by the S3 lifecycle rule. 0 disables expiry."
  type        = number
  default     = 180
}
