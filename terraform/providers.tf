provider "aws" {
  region = var.aws_region

  # Every resource this configuration creates carries these tags. That is what
  # makes "which AWS resources belong to this project?" answerable — and it is
  # what scripts/destroy.sh relies on to stay scoped.
  default_tags {
    tags = {
      Project     = var.project_display_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Repository  = var.github_repository
    }
  }
}
