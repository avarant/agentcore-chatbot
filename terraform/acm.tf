###############################################################################
# Agent77 — acm.tf — ACM certificate for custom domain
###############################################################################

resource "aws_acm_certificate" "main" {
  count = var.domain != "" ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-cert"
  }
}

output "acm_dns_validation_records" {
  description = "DNS validation records to add in your DNS provider (e.g. Cloudflare)"
  value = var.domain != "" ? [
    for dvo in aws_acm_certificate.main[0].domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ] : []
}
