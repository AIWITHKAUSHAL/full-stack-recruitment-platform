# =============================================================================
# RDS PostgreSQL
#
# WHY POSTGRESQL: jobs and applications are relational, the application relies
# on foreign keys, unique constraints, transactions and a partial unique index
# for the duplicate-application rule. That is exactly what a relational database
# is for.
#
# WHY RDS: managed backups, patching and failure replacement, with no server for
# a student to maintain.
#
# COST: db.t4g.micro, single-AZ, 20 GiB gp3 is the cheapest reasonable
# production-shaped PostgreSQL on AWS. Multi-AZ would roughly double it and is
# switched off by design for this demo (RESTRICTIONS.md #21).
# =============================================================================

resource "aws_db_subnet_group" "main" {
  name = "${local.name_prefix}-db-subnets"
  # Private subnets only. This is half of what keeps the database unreachable
  # from the internet; publicly_accessible = false below is the other half.
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-db-subnets" }
}

# Generated, never typed by a human, never committed. It lands in the Terraform
# state file (which is git-ignored) and in SSM Parameter Store, from where the
# ECS task reads it at start-up.
resource "random_password" "db" {
  length = 32
  # RDS rejects '/', '@', '"' and spaces in a master password.
  override_special = "!#$%&*()-_=+[]{}<>:?"
  special          = true
}

resource "aws_db_parameter_group" "main" {
  name   = "${local.name_prefix}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # log statements slower than 1s - useful, not chatty
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 2 # storage autoscaling ceiling
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  # THE most important line in this file: the database gets no public IP and no
  # public DNS name. Combined with the private subnets and the security group,
  # PostgreSQL is reachable only from the ECS tasks (RESTRICTIONS.md #6).
  publicly_accessible = false

  multi_az                = var.db_multi_az
  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"

  auto_minor_version_upgrade = true
  deletion_protection        = false # this environment must stay destroyable
  skip_final_snapshot        = true  # a retained snapshot would survive destroy and keep billing
  delete_automated_backups   = true  # likewise for automated backups (the provider default, made explicit)
  apply_immediately          = true

  # Performance Insights and enhanced monitoring are deliberately off: both add
  # cost, and CloudWatch's free RDS metrics are enough for this demo.
  performance_insights_enabled = false
  monitoring_interval          = 0

  # Ship PostgreSQL's own logs to CloudWatch so slow queries are visible.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # The log group must exist before RDS starts exporting, or RDS creates it
  # itself — outside the Terraform state (see aws_cloudwatch_log_group.rds).
  depends_on = [aws_cloudwatch_log_group.rds]

  tags = { Name = "${local.name_prefix}-postgres" }
}

# RDS writes exported logs to /aws/rds/instance/<identifier>/postgresql. Left
# alone, RDS creates that group on its own: it is then missing from the
# Terraform state, it survives `terraform destroy`, and it keeps its logs
# forever. Declaring it here means Terraform owns it — short retention, and
# deleted together with everything else.
#
# The identifier is spelled out instead of read from aws_db_instance.main,
# because the instance depends on this group and a reference would be a cycle.
#
# COST: CloudWatch Logs ingestion and storage per GB; tiny with a 1s slow-query
# threshold and 7-day retention.
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${local.name_prefix}-postgres/postgresql"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-rds-logs" }
}

# -----------------------------------------------------------------------------
# Connection string in SSM Parameter Store (SecureString).
#
# WHY SSM AND NOT SECRETS MANAGER: Parameter Store's standard tier is free,
# Secrets Manager charges per secret per month. Both integrate with ECS the same
# way — the task definition references the parameter ARN and the *execution
# role* injects the value at start-up, so the password never appears in the task
# definition, in the image, or in any log.
# -----------------------------------------------------------------------------
resource "aws_ssm_parameter" "database_url" {
  name        = "/${local.name_prefix}/database_url"
  description = "SQLAlchemy connection URL for the application database"
  type        = "SecureString"
  value       = "postgresql+psycopg://${var.db_username}:${urlencode(random_password.db.result)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"

  tags = { Name = "${local.name_prefix}-database-url" }
}

# The signing key for admin JWTs. Generated here so no human ever chooses it and
# it is never the insecure development default (app/core/config.py refuses to
# start with that value outside local development).
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/${local.name_prefix}/jwt_secret_key"
  description = "HS256 signing key for administrator access tokens"
  type        = "SecureString"
  value       = random_password.jwt_secret.result

  tags = { Name = "${local.name_prefix}-jwt-secret" }
}
