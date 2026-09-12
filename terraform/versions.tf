terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state is deliberate for this classroom deployment: it keeps `terraform
  # apply` and `terraform destroy` to a single command with no bootstrap
  # chicken-and-egg problem.
  #
  # For a team or a real environment, switch to remote state with locking:
  #
  #   backend "s3" {
  #     bucket       = "my-tfstate-bucket"
  #     key          = "mini-job-board/dev/terraform.tfstate"
  #     region       = "us-east-1"
  #     encrypt      = true
  #     use_lockfile = true   # S3-native locking, no DynamoDB table needed
  #   }
  #
  # terraform.tfstate contains the generated database password, so it is in
  # .gitignore and must never be committed.
}
