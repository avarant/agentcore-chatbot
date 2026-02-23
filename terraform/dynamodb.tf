###############################################################################
# Agent77 — dynamodb.tf — Single-table design
###############################################################################

resource "aws_dynamodb_table" "config" {
  name         = "${local.name_prefix}-config"
  billing_mode = var.dynamodb_billing_mode

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # GSI for reverse lookups (e.g. query by SK)
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "SK"
    range_key       = "PK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  # Uses default AWS-owned key (no custom KMS key needed)


  tags = {
    Name = "${local.name_prefix}-config"
  }
}
