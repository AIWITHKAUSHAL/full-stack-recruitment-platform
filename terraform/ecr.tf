# =============================================================================
# Elastic Container Registry
#
# WHY ECR: ECS Fargate pulls the backend image from a registry at task start.
# ECR is that registry, inside the same account and region, so the pull needs no
# credentials beyond the task execution role and never leaves AWS.
# =============================================================================

resource "aws_ecr_repository" "backend" {
  name = "${local.name_prefix}-backend"

  # Mutable so the CI pipeline can also move a `latest` tag alongside the
  # immutable git-SHA tag it actually deploys.
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true # basic scanning is free
  }

  # Without this, `terraform destroy` fails on a repository that still holds
  # images — and this environment must always be destroyable.
  force_delete = true

  tags = { Name = "${local.name_prefix}-backend" }
}

# Every deploy pushes a new image. Without a lifecycle policy the repository
# grows forever and storage is billed per GB-month.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the 10 most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
