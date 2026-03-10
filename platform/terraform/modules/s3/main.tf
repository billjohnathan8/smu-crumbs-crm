#--------------------------------------------------------------
# S3 Module
# S3 buckets for frontend static hosting, AML/SFTP ingestion,
# and their associated policies and CORS rules.
#--------------------------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket        = var.frontend_bucket_name
  force_destroy = var.frontend_bucket_force_destroy
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
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
    object_ownership = "BucketOwnerPreferred"
  }
}

# --- Verification documents bucket (optional) ---

resource "aws_s3_bucket" "verification" {
  count = var.enable_verification_bucket ? 1 : 0

  bucket        = var.verification_bucket_name
  force_destroy = false

  tags = {
    Name = var.verification_bucket_name
  }
}

resource "aws_s3_bucket_versioning" "verification" {
  count = var.enable_verification_bucket ? 1 : 0

  bucket = aws_s3_bucket.verification[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "verification" {
  count = var.enable_verification_bucket ? 1 : 0

  bucket = aws_s3_bucket.verification[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "verification" {
  count = var.enable_verification_bucket ? 1 : 0

  bucket = aws_s3_bucket.verification[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
