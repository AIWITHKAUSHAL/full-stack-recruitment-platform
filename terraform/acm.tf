# =============================================================================
# Optional custom domain — TLS certificate for CloudFront
#
# WHY ACM AND NOT ROUTE 53: a custom domain needs two things — a certificate
# CloudFront can present, and DNS records pointing at CloudFront. ACM issues the
# certificate for free. The DNS records stay at the registrar (e.g. Namecheap),
# so there is no Route 53 hosted zone and no extra monthly charge
# (RESTRICTIONS.md #19).
#
# WHY TWO STEPS: ACM only issues a certificate after it sees validation CNAMEs in
# the domain's DNS, and Terraform cannot write those at Namecheap. So:
#
#   1. custom_domain = "example.com"   → certificate requested, records output
#      (add the records at the registrar, wait for "Issued")
#   2. attach_custom_domain = true     → CloudFront serves example.com + www
#
# COST: public ACM certificates and CloudFront SNI custom certificates are free.
# =============================================================================

locals {
  custom_domain_enabled  = var.custom_domain != ""
  custom_domain_attached = local.custom_domain_enabled && var.attach_custom_domain

  custom_domain_names = local.custom_domain_enabled ? [var.custom_domain, "www.${var.custom_domain}"] : []

  # Only the attached names are handed to CloudFront and to CORS.
  cloudfront_aliases = local.custom_domain_attached ? local.custom_domain_names : []
}

resource "aws_acm_certificate" "custom_domain" {
  count = local.custom_domain_enabled ? 1 : 0

  domain_name               = var.custom_domain
  subject_alternative_names = ["www.${var.custom_domain}"]
  validation_method         = "DNS"

  tags = { Name = "${local.name_prefix}-custom-domain" }

  lifecycle {
    # CloudFront only accepts certificates from us-east-1, whatever region the
    # rest of the stack is in.
    precondition {
      condition     = var.aws_region == "us-east-1"
      error_message = "A CloudFront certificate must be in us-east-1. Add a us-east-1 provider alias before using custom_domain in another region."
    }

    # A replacement certificate must exist before CloudFront lets go of the old one.
    create_before_destroy = true
  }
}

# Creates nothing in AWS: it waits until ACM reports the certificate as Issued,
# so CloudFront is never pointed at a certificate that is still pending. It has
# no validation_record_fqdns because the records live at the registrar.
resource "aws_acm_certificate_validation" "custom_domain" {
  count = local.custom_domain_attached ? 1 : 0

  certificate_arn = aws_acm_certificate.custom_domain[0].arn

  timeouts {
    create = "15m"
  }
}
