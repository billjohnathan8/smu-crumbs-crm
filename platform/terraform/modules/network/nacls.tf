#--------------------------------------------------------------
# Network Module - Network ACLs
# Subnet-level access controls for defense-in-depth segmentation.
# These supplement security groups with stateless packet filtering.
#--------------------------------------------------------------

#--------------------------------------------------------------
# Private Subnet NACL (app tier: ECS tasks, Lambda)
#--------------------------------------------------------------
resource "aws_network_acl" "private" {
  vpc_id     = aws_vpc.this.id
  subnet_ids = [for idx in sort(keys(local.private_subnet_map)) : aws_subnet.private[idx].id]

  # Allow inbound from ALB on app port (8080)
  ingress {
    rule_no    = 100
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 8080
    to_port    = 8080
  }

  # Allow inbound PostgreSQL for fallback topology where RDS uses private subnets
  # (when db_subnet_cidrs is empty in the root module).
  ingress {
    rule_no    = 150
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 5432
    to_port    = 5432
  }

  # Allow inbound ephemeral return traffic (responses from AWS APIs, DB, etc.)
  ingress {
    rule_no    = 200
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }

  # Allow UDP DNS response traffic from the VPC resolver (stateless NACLs).
  ingress {
    rule_no    = 210
    protocol   = "udp"
    action     = "allow"
    cidr_block = "${cidrhost(var.vpc_cidr, 2)}/32"
    from_port  = 1024
    to_port    = 65535
  }

  # Allow outbound to DB port within VPC
  egress {
    rule_no    = 100
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 5432
    to_port    = 5432
  }

  # Allow outbound HTTPS (AWS APIs via NAT Gateway)
  egress {
    rule_no    = 200
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 443
    to_port    = 443
  }

  # Allow outbound SSH to in-VPC SFTP endpoint from AML Lambda.
  egress {
    rule_no    = 250
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 22
    to_port    = 22
  }

  # Allow DNS resolution against the VPC resolver (base CIDR + 2) for
  # private workloads that call Cloud Map, Cognito, and other AWS endpoints.
  egress {
    rule_no    = 210
    protocol   = "udp"
    action     = "allow"
    cidr_block = "${cidrhost(var.vpc_cidr, 2)}/32"
    from_port  = 53
    to_port    = 53
  }

  egress {
    rule_no    = 220
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "${cidrhost(var.vpc_cidr, 2)}/32"
    from_port  = 53
    to_port    = 53
  }

  # Allow outbound ephemeral ports for return traffic to ALB and service-to-service
  egress {
    rule_no    = 300
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 1024
    to_port    = 65535
  }

  # Allow outbound service-to-service on app port
  egress {
    rule_no    = 400
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 8080
    to_port    = 8080
  }

  tags = {
    Name = "${var.name_prefix}-private-nacl"
  }
}

#--------------------------------------------------------------
# Database Subnet NACL (data tier: RDS only)
# Only created when dedicated DB subnets are provisioned.
#--------------------------------------------------------------
resource "aws_network_acl" "db" {
  count = length(var.db_subnet_cidrs) > 0 ? 1 : 0

  vpc_id     = aws_vpc.this.id
  subnet_ids = [for idx in sort(keys(local.db_subnet_map)) : aws_subnet.db[idx].id]

  # Allow inbound PostgreSQL from private (app-tier) subnets only
  dynamic "ingress" {
    for_each = var.private_subnet_cidrs
    content {
      rule_no    = 100 + ingress.key
      protocol   = "tcp"
      action     = "allow"
      cidr_block = ingress.value
      from_port  = 5432
      to_port    = 5432
    }
  }

  # Allow outbound ephemeral return traffic to private subnets only
  dynamic "egress" {
    for_each = var.private_subnet_cidrs
    content {
      rule_no    = 100 + egress.key
      protocol   = "tcp"
      action     = "allow"
      cidr_block = egress.value
      from_port  = 1024
      to_port    = 65535
    }
  }

  tags = {
    Name = "${var.name_prefix}-db-nacl"
  }
}
