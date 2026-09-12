# =============================================================================
# S3 buckets
#
#   frontend  – the compiled React bundle. Private; only CloudFront can read it.
#   resumes   – candidate resumes. Private; only the ECS task role can touch it,
#               and admins receive short-lived presigned URLs.
#
# Both buckets have Public Access Block fully enabled. There is no code path in
# this repository that makes either of them public (RESTRICTIONS.md #7, #8).
#
# force_destroy = true is intentional: this is a teaching environment that must
# be destroyable with one command. Do NOT carry that setting into production.
# =============================================================================

# ---------------------------------------------------------------- frontend ---
resource "aws_s3_bucket" "frontend" {
  bucket        = local.frontend_bucket_name
  force_destroy = true

  tags = { Name = local.frontend_bucket_name }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced" # ACLs disabled entirely
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    # Off by design: every version would be billed storage, and the source of
    # truth for the bundle is the git commit, not the bucket.
    status = "Disabled"
  }
}

# The ONLY principal allowed to read this bucket is this CloudFront
# distribution, proven by the SourceArn condition.
data "aws_iam_policy_document" "frontend_oac" {
  statement {
    sid       = "AllowCloudFrontOriginAccessControlRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_oac.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ----------------------------------------------------------------- resumes ---
resource "aws_s3_bucket" "resumes" {
  bucket        = local.resume_bucket_name
  force_destroy = true

  tags = { Name = local.resume_bucket_name }
}

resource "aws_s3_bucket_public_access_block" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Candidate personal data should not sit in a demo bucket forever. This also
# keeps storage cost at effectively zero.
resource "aws_s3_bucket_lifecycle_configuration" "resumes" {
  count  = var.resume_retention_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.resumes.id

  rule {
    id     = "expire-demo-resumes"
    status = "Enabled"

    filter {
      prefix = "resumes/"
    }

    expiration {
      days = var.resume_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# Belt and braces: even if a bucket policy were added later, this denies any
# request that did not arrive over TLS.
data "aws_iam_policy_document" "resumes_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.resumes.arn, "${aws_s3_bucket.resumes.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "resumes" {
  bucket = aws_s3_bucket.resumes.id
  policy = data.aws_iam_policy_document.resumes_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.resumes]
}
