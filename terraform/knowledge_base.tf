###############################################################################
# AgentCore Chatbot — knowledge_base.tf — Bedrock Knowledge Base + S3 Vectors
###############################################################################

locals {
  enable_kb = var.enable_knowledge_base ? 1 : 0
}

# ---------------------------------------------------------------------------
# S3 — Document upload bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "kb_docs" {
  count = local.enable_kb

  bucket        = "${local.name_prefix}-kb-docs-${local.account_id}"
  force_destroy = true

  tags = {
    Name = "${local.name_prefix}-kb-docs"
  }
}

resource "aws_s3_bucket_versioning" "kb_docs" {
  count = local.enable_kb

  bucket = aws_s3_bucket.kb_docs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

# ---------------------------------------------------------------------------
# S3 Vectors — Vector storage for embeddings
# ---------------------------------------------------------------------------

resource "aws_s3vectors_vector_bucket" "kb" {
  count = local.enable_kb

  vector_bucket_name = "${local.name_prefix}-kb-vectors"
}

resource "aws_s3vectors_index" "kb" {
  count = local.enable_kb

  vector_bucket_name = aws_s3vectors_vector_bucket.kb[0].vector_bucket_name
  index_name         = "${local.name_prefix}-kb-index"
  data_type          = "float32"
  dimension          = 1024
  distance_metric    = "cosine"

  metadata_configuration {
    non_filterable_metadata_keys = [
      "AMAZON_BEDROCK_TEXT",
      "AMAZON_BEDROCK_METADATA",
      "AMAZON_BEDROCK_TEXT_CHUNK",
      "x-amz-bedrock-kb-source-uri",
      "x-amz-bedrock-kb-data-source-id",
      "x-amz-bedrock-kb-chunk-id",
    ]
  }
}

# ---------------------------------------------------------------------------
# IAM Role — Bedrock Knowledge Base service role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "kb_service" {
  count = local.enable_kb

  name = "${local.name_prefix}-kb-service"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-kb-service"
  }
}

resource "aws_iam_role_policy" "kb_service" {
  count = local.enable_kb

  name = "${local.name_prefix}-kb-service"
  role = aws_iam_role.kb_service[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Read"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.kb_docs[0].arn,
          "${aws_s3_bucket.kb_docs[0].arn}/*",
        ]
      },
      {
        Sid    = "S3Vectors"
        Effect = "Allow"
        Action = [
          "s3vectors:CreateIndex",
          "s3vectors:DeleteIndex",
          "s3vectors:GetIndex",
          "s3vectors:ListIndexes",
          "s3vectors:PutVectors",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:ListVectors",
        ]
        Resource = [
          aws_s3vectors_vector_bucket.kb[0].vector_bucket_arn,
          "${aws_s3vectors_vector_bucket.kb[0].vector_bucket_arn}/*",
        ]
      },
      {
        Sid    = "BedrockEmbedding"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
        ]
        Resource = "arn:${local.partition}:bedrock:${var.aws_region}::foundation-model/amazon.titan-embed-text-v2:0"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Bedrock Knowledge Base
# ---------------------------------------------------------------------------

resource "aws_bedrockagent_knowledge_base" "main" {
  count = local.enable_kb

  name     = "${replace(local.name_prefix, "-", "_")}_knowledge_base"
  role_arn = aws_iam_role.kb_service[0].arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = "arn:${local.partition}:bedrock:${var.aws_region}::foundation-model/amazon.titan-embed-text-v2:0"
    }
  }

  storage_configuration {
    type = "S3_VECTORS"

    s3_vectors_configuration {
      index_arn = aws_s3vectors_index.kb[0].index_arn
    }
  }

  tags = {
    Name = "${local.name_prefix}-knowledge-base"
  }

  depends_on = [aws_iam_role_policy.kb_service]
}

# ---------------------------------------------------------------------------
# Data Source — S3 documents bucket
# ---------------------------------------------------------------------------

resource "aws_bedrockagent_data_source" "s3_docs" {
  count = local.enable_kb

  name              = "${replace(local.name_prefix, "-", "_")}_docs"
  knowledge_base_id = aws_bedrockagent_knowledge_base.main[0].id

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn = aws_s3_bucket.kb_docs[0].arn
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "FIXED_SIZE"

      fixed_size_chunking_configuration {
        max_tokens         = 512
        overlap_percentage = 20
      }
    }
  }
}
