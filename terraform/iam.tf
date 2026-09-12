# =============================================================================
# IAM roles
#
# Two distinct ECS roles, because they are used by two different things at two
# different times:
#
#   execution role – used by the ECS *agent* before the container starts: pull
#                    the image from ECR, read the SSM parameters, create the log
#                    stream. The application code never sees these permissions.
#
#   task role      – used by the *application* while it runs: put and get resume
#                    objects in the resume bucket. Nothing else.
#
# Both are scoped to the specific resources this project creates — no wildcard
# S3 access, no wildcard SSM access.
# =============================================================================

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------- execution role ---
resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = { Name = "${local.name_prefix}-ecs-execution-role" }
}

# AWS-managed policy covering the ECR pull and CloudWatch Logs writes.
resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Reading the two SSM parameters is NOT in the managed policy, so it is granted
# here — narrowed to exactly those two parameter ARNs.
data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    sid     = "ReadApplicationSecrets"
    effect  = "Allow"
    actions = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.database_url.arn,
      aws_ssm_parameter.jwt_secret.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "${local.name_prefix}-ecs-execution-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

# --------------------------------------------------------------- task role ---
resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = { Name = "${local.name_prefix}-ecs-task-role" }
}

# The application's entire AWS surface: put a resume, read a resume, presign a
# resume URL. It cannot list buckets, cannot touch the frontend bucket, and
# cannot delete anything.
data "aws_iam_policy_document" "ecs_task_s3" {
  statement {
    sid     = "ResumeObjectAccess"
    effect  = "Allow"
    actions = ["s3:PutObject", "s3:GetObject"]
    # Only under the resumes/ prefix of the resume bucket.
    resources = ["${aws_s3_bucket.resumes.arn}/resumes/*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name   = "${local.name_prefix}-ecs-task-s3"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_s3.json
}
