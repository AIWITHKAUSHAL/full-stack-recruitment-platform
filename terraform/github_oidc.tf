# =============================================================================
# GitHub Actions OIDC
#
# WHY OIDC INSTEAD OF ACCESS KEYS: a long-lived AWS_SECRET_ACCESS_KEY stored in
# GitHub secrets is a credential that never expires, can be exfiltrated by any
# workflow, and has to be rotated by hand. With OIDC, GitHub presents a signed
# token that proves "this run is for repo X on branch Y", AWS exchanges it for
# credentials that expire in an hour, and there is no secret to leak
# (RESTRICTIONS.md #1, #2).
#
#   GitHub workflow ──► OIDC token ──► sts:AssumeRoleWithWebIdentity ──► temp creds
# =============================================================================

# AWS allows exactly one provider per URL per account. If another project already
# created it, set create_github_oidc_provider = false and this stack only *looks
# it up*. We deliberately do not `terraform import` it: an imported provider
# lands in this state, and `terraform destroy` would then delete it out from
# under the other project.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = { Name = "${local.name_prefix}-github-oidc" }
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

data "aws_iam_policy_document" "github_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The critical restriction: only workflows from THIS repository may assume
    # the role. Without the `sub` condition, any GitHub repository in the world
    # could. Limited further to the main branch and to tags — a pull request
    # from a fork cannot deploy.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:ref:refs/tags/*",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name                 = "${local.name_prefix}-github-actions-role"
  description          = "Assumed by GitHub Actions to deploy this project"
  assume_role_policy   = data.aws_iam_policy_document.github_assume_role.json
  max_session_duration = 3600

  tags = { Name = "${local.name_prefix}-github-actions-role" }
}

# Deployment permissions, scoped to this project's resources wherever the API
# supports it. ECR and ECS describe/list calls require "*" because they are not
# resource-scoped.
data "aws_iam_policy_document" "github_actions" {
  statement {
    sid     = "EcrLogin"
    effect  = "Allow"
    actions = ["ecr:GetAuthorizationToken"]
    # Not resource-scopable: this call has no resource.
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:DescribeImages",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeServices",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "ecs:UpdateService",
      "ecs:RunTask",
    ]
    resources = ["*"]
  }

  # RegisterTaskDefinition and RunTask embed the ECS roles, so the pipeline must
  # be allowed to pass exactly those two roles and nothing else.
  statement {
    sid       = "PassEcsRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "FrontendUpload"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"]
    resources = [aws_s3_bucket.frontend.arn, "${aws_s3_bucket.frontend.arn}/*"]
  }

  statement {
    sid       = "CloudFrontInvalidate"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }

  # Lets the deploy script discover the ALB URL and the log group without the
  # operator hardcoding them.
  statement {
    sid       = "ReadDeploymentTargets"
    effect    = "Allow"
    actions   = ["elasticloadbalancing:DescribeLoadBalancers", "logs:DescribeLogGroups"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "${local.name_prefix}-github-actions-policy"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions.json
}
