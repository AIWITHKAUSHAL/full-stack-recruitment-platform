# =============================================================================
# CloudFront distribution
#
# ONE distribution, TWO origins:
#
#   default behaviour        ──► private S3 bucket   (the React bundle)
#   /api/*, /health*, /docs  ──► ALB                 (the FastAPI backend)
#
# WHY ROUTE THE API THROUGH CLOUDFRONT TOO: the browser then only ever talks to
# one origin, so there is no cross-origin preflight on every API call, no mixed
# content (the page is HTTPS, a bare ALB is HTTP), and the frontend can be built
# with the relative base URL "/api/v1".
#
# WHY NOT ROUTE 53: by default this deployment uses the generated
# *.cloudfront.net domain. A hosted zone costs $0.50/month, which a classroom
# demo does not need (RESTRICTIONS.md #19). An optional custom domain is
# supported without Route 53: the certificate comes from ACM (acm.tf) and the
# DNS records stay at the registrar.
# =============================================================================

# Origin Access Control is what lets CloudFront read a *private* bucket. The
# bucket policy in s3.tf trusts this distribution and nothing else, so the S3
# objects are never publicly readable.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC for the private frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------- managed policies --
# AWS-managed policies, used instead of hand-rolled ones so the intent is obvious.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

# ---------------------------------------------------------- SPA fallback ---
# React Router owns /jobs/12 and /track; those keys do not exist in S3. This
# function rewrites any extension-less path to /index.html *before* the request
# reaches S3, so a refresh on a deep link works.
#
# WHY NOT custom_error_response: error pages are distribution-wide. Mapping
# 403/404 → index.html with a 200 also swallowed every API 404 ("unknown job",
# "wrong tracking email") and returned the React page with a 200 instead. This
# function is attached to the S3 behaviour only, so API errors pass through
# untouched, and a genuinely missing asset (/assets/missing.js) still fails.
#
# COST: CloudFront Functions are $0.10 per million invocations after the first
# 2 million/month free — effectively $0 for this demo.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name_prefix}-spa-rewrite"
  comment = "Rewrite client-side routes to /index.html"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      var lastSegment = request.uri.split('/').pop();
      if (lastSegment.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_display_name} (${var.environment})"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class

  # Empty unless custom_domain is set and attached (acm.tf).
  aliases = local.cloudfront_aliases

  # ------------------------------------------------------------- origins ---
  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "alb-backend"
    domain_name = aws_lb.main.dns_name

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # The ALB has no TLS certificate (no custom domain), so this hop is HTTP
      # inside AWS. With a domain you would add ACM + an HTTPS listener and set
      # this to https-only.
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 30
    }
  }

  # ------------------------------------------------ default: the SPA files ---
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # ------------------------------------------------------ API: never cache ---
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"
    # POST/PATCH are required: this is how applications are submitted and
    # statuses are changed.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    # Caching an authenticated API response would be a security bug, not just a
    # correctness one. AllViewerExceptHostHeader forwards the Authorization
    # header and the query string to the ALB.
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  ordered_cache_behavior {
    path_pattern             = "/health*"
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # Swagger UI, served over HTTPS through the same domain.
  ordered_cache_behavior {
    path_pattern             = "/docs*"
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  ordered_cache_behavior {
    path_pattern             = "/openapi.json"
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # No custom_error_response: the SPA fallback is aws_cloudfront_function.spa_rewrite
  # above, scoped to the S3 behaviour so API status codes are never rewritten.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # Without a custom domain: the default *.cloudfront.net certificate, which
    # only accepts minimum_protocol_version "TLSv1". With one: the ACM
    # certificate, served via SNI (free; a dedicated-IP certificate costs
    # $600/month) and TLS 1.2+.
    cloudfront_default_certificate = !local.custom_domain_attached
    acm_certificate_arn            = local.custom_domain_attached ? aws_acm_certificate_validation.custom_domain[0].certificate_arn : null
    ssl_support_method             = local.custom_domain_attached ? "sni-only" : null
    minimum_protocol_version       = local.custom_domain_attached ? "TLSv1.2_2021" : "TLSv1"
  }

  # No WAF: it carries a monthly charge per web ACL plus per-request fees, and
  # this is a demo (RESTRICTIONS.md, cost section).

  tags = { Name = "${local.name_prefix}-cloudfront" }
}
