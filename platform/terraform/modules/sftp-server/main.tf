#--------------------------------------------------------------
# SFTP Ingestion Module
# EC2-hosted OpenSSH SFTP with S3-backed upload path.
#--------------------------------------------------------------

locals {
  ec2_enabled = var.enable_ec2_sftp_server

  normalized_prefix = trim(var.transaction_bucket_prefix, "/")
  object_arn_prefix = local.normalized_prefix == "" ? "${var.transaction_bucket_arn}/*" : "${var.transaction_bucket_arn}/${local.normalized_prefix}/*"

  ec2_subnet_id = trimspace(var.sftp_server_subnet_id) != "" ? trimspace(var.sftp_server_subnet_id) : var.public_subnet_ids[0]
  ingress_cidrs = length(var.sftp_ingress_cidr_blocks) > 0 ? var.sftp_ingress_cidr_blocks : ["0.0.0.0/0"]
}

data "aws_ami" "amazon_linux_2023_arm64" {
  count = local.ec2_enabled && trimspace(var.sftp_server_ami_id) == "" ? 1 : 0

  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "sftp_ec2" {
  count = local.ec2_enabled ? 1 : 0

  name        = "${var.name_prefix}-sftp-ec2-sg"
  description = "Allow inbound SFTP for partner CIDR allowlist"
  vpc_id      = var.vpc_id

  ingress {
    description = "SFTP from partner allowlist"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = local.ingress_cidrs
  }

  egress {
    description = "Outbound internet access for S3 and package install"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.name_prefix}-sftp-ec2-sg"
    Environment = var.environment
  }
}

resource "aws_security_group_rule" "sftp_ec2_ingress_from_security_groups" {
  for_each = local.ec2_enabled ? toset(var.sftp_ingress_source_security_group_ids) : toset([])

  type                     = "ingress"
  from_port                = 22
  to_port                  = 22
  protocol                 = "tcp"
  security_group_id        = aws_security_group.sftp_ec2[0].id
  source_security_group_id = each.value
  description              = "SFTP from trusted in-VPC security group"
}

data "aws_iam_policy_document" "sftp_ec2_assume" {
  count = local.ec2_enabled ? 1 : 0

  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "sftp_ec2" {
  count = local.ec2_enabled ? 1 : 0

  name               = "${var.name_prefix}-sftp-ec2"
  assume_role_policy = data.aws_iam_policy_document.sftp_ec2_assume[0].json

  tags = {
    Name        = "${var.name_prefix}-sftp-ec2"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "sftp_ec2_s3" {
  count = local.ec2_enabled ? 1 : 0

  statement {
    sid    = "ListTransactionPrefix"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [var.transaction_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = local.normalized_prefix == "" ? ["*"] : [
        local.normalized_prefix,
        "${local.normalized_prefix}/*",
      ]
    }
  }

  statement {
    sid    = "ReadWriteTransactionPrefixObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = [local.object_arn_prefix]
  }
}

resource "aws_iam_role_policy" "sftp_ec2_s3" {
  count = local.ec2_enabled ? 1 : 0

  name   = "${var.name_prefix}-sftp-ec2-s3"
  role   = aws_iam_role.sftp_ec2[0].id
  policy = data.aws_iam_policy_document.sftp_ec2_s3[0].json
}

resource "aws_iam_instance_profile" "sftp_ec2" {
  count = local.ec2_enabled ? 1 : 0

  name = "${var.name_prefix}-sftp-ec2"
  role = aws_iam_role.sftp_ec2[0].name
}

resource "aws_instance" "sftp_ec2" {
  count = local.ec2_enabled ? 1 : 0

  ami                         = trimspace(var.sftp_server_ami_id) != "" ? trimspace(var.sftp_server_ami_id) : data.aws_ami.amazon_linux_2023_arm64[0].id
  instance_type               = var.sftp_instance_type
  subnet_id                   = local.ec2_subnet_id
  vpc_security_group_ids      = [aws_security_group.sftp_ec2[0].id]
  iam_instance_profile        = aws_iam_instance_profile.sftp_ec2[0].name
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    aws_region          = var.aws_region
    bucket_name         = var.transaction_bucket_id
    bucket_prefix       = local.normalized_prefix == "" ? "" : "${local.normalized_prefix}/"
    sftp_username       = var.sftp_username
    sftp_ssh_public_key = trimspace(var.sftp_user_ssh_public_key)
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.sftp_root_volume_size_gb
    delete_on_termination = true
    encrypted             = true
  }

  tags = {
    Name        = "${var.name_prefix}-sftp-ec2"
    Environment = var.environment
    Purpose     = "Self-hosted SFTP to S3 ingestion bridge"
  }
}

resource "aws_eip" "sftp_ec2" {
  count = local.ec2_enabled && var.sftp_allocate_eip ? 1 : 0

  domain   = "vpc"
  instance = aws_instance.sftp_ec2[0].id

  tags = {
    Name        = "${var.name_prefix}-sftp-ec2-eip"
    Environment = var.environment
  }
}
