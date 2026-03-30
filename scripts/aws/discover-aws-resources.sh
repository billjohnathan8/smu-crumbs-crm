#!/usr/bin/env bash
#
# AWS Resource Discovery Script
# Discovers and documents all AWS resources in your account
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Detect AWS CLI (Windows compatibility)
# On Windows Git Bash, try aws.exe first
if command -v aws.exe &> /dev/null; then
    AWS_CLI="aws.exe"
    echo -e "${GREEN}Using AWS CLI: aws.exe${NC}"
elif command -v aws &> /dev/null; then
    AWS_CLI="aws"
    echo -e "${GREEN}Using AWS CLI: aws${NC}"
else
    echo -e "${RED}ERROR: AWS CLI not found in PATH${NC}"
    echo ""
    echo -e "${YELLOW}Solutions:${NC}"
    echo -e "  1. Use PowerShell version instead (recommended on Windows):"
    echo -e "     ${BLUE}.\scripts\aws\discover-aws-resources.ps1${NC}"
    echo ""
    echo -e "  2. Add AWS CLI to your PATH and try again"
    echo ""
    echo -e "  3. Install AWS CLI from: ${BLUE}https://aws.amazon.com/cli/${NC}"
    echo ""
    exit 1
fi

# Create aws function wrapper (alias doesn't work in non-interactive bash)
aws() {
    "$AWS_CLI" "$@"
}
export -f aws

echo ""

# Output directory structure
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
AWS_ROOT="aws"
INVENTORY_ROOT="$AWS_ROOT/inventory"
OUTPUT_DIR="$INVENTORY_ROOT/aws-inventory-$TIMESTAMP"

# Create parent directory if it doesn't exist
mkdir -p "$AWS_ROOT"
mkdir -p "$INVENTORY_ROOT"

# Migrate any old-format directories to new structure
echo -e "${YELLOW}Checking for existing inventory directories...${NC}"
shopt -s nullglob  # Make non-matching patterns expand to nothing
for dir in aws-inventory-*/; do
    if [ -d "$dir" ]; then
        parent_dir=$(dirname "$dir")
        # Only migrate if it's in the current directory, not already in INVENTORY_ROOT
        if [ "$parent_dir" = "." ]; then
            dir_name=$(basename "$dir")
            target_path="$INVENTORY_ROOT/$dir_name"
            if [ ! -d "$target_path" ]; then
                echo -e "${BLUE}  Migrating $dir_name to $INVENTORY_ROOT/${NC}"
                mv "$dir" "$target_path"
            fi
        fi
    fi
done
shopt -u nullglob  # Reset nullglob

# Migrate legacy runs from aws-inventory/ root if present
if [ -d "aws-inventory" ]; then
    find "aws-inventory" -maxdepth 1 -mindepth 1 -type d -name "aws-inventory-*" | while IFS= read -r dir; do
        dir_name=$(basename "$dir")
        target_path="$INVENTORY_ROOT/$dir_name"
        if [ ! -d "$target_path" ]; then
            echo -e "${BLUE}  Migrating $dir_name from aws-inventory/ to $INVENTORY_ROOT/${NC}"
            mv "$dir" "$target_path"
        fi
    done
fi

# Prune old runs (keep only latest 3)
KEEP_COUNT=3
mapfile -t all_runs < <(find "$INVENTORY_ROOT" -maxdepth 1 -type d -name "aws-inventory-*" | sort -r)

if [ ${#all_runs[@]} -gt 0 ]; then
    echo -e "${YELLOW}Pruning old inventory runs (keeping latest $KEEP_COUNT)...${NC}"
    count=0
    prune_before_create=$((KEEP_COUNT - 1))
    for run_dir in "${all_runs[@]}"; do
        count=$((count + 1))
        if [ $count -gt $prune_before_create ]; then
            echo -e "${GRAY}  Removing old run: $(basename "$run_dir")${NC}"
            rm -rf "$run_dir"
        fi
    done
fi

# Create new run directory
mkdir -p "$OUTPUT_DIR"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AWS Resource Discovery${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Output: $OUTPUT_DIR${NC}"
echo ""

# Get account info
echo -e "${YELLOW}Getting account information...${NC}"
aws sts get-caller-identity > "$OUTPUT_DIR/account-info.json"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
REGION=$(aws configure get region)

echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"
echo -e "${GREEN}User/Role: $USER_ARN${NC}"
echo -e "${GREEN}Default Region: $REGION${NC}"
echo ""

# Function to check if a command succeeds
check_service() {
    local service=$1
    local command=$2
    local output_file=$3

    echo -e "${YELLOW}Checking $service...${NC}"
    if eval "$command" > "$OUTPUT_DIR/$output_file" 2>&1; then
        local count=$(cat "$OUTPUT_DIR/$output_file" | grep -v "^$" | wc -l)
        echo -e "${GREEN}  Found resources (see $output_file)${NC}"
        return 0
    else
        echo -e "${RED}  Error or no access (see $output_file for details)${NC}"
        return 1
    fi
}

# EC2 Instances
echo ""
echo -e "${BLUE}=== EC2 Instances ===${NC}"
check_service "EC2 Instances" \
    "aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,PublicIpAddress,PrivateIpAddress,Tags[?Key==\`Name\`].Value|[0]]' --output table" \
    "ec2-instances.txt"

# Security Groups
check_service "Security Groups" \
    "aws ec2 describe-security-groups --query 'SecurityGroups[*].[GroupId,GroupName,Description,VpcId]' --output table" \
    "security-groups.txt"

# Key Pairs
check_service "EC2 Key Pairs" \
    "aws ec2 describe-key-pairs --query 'KeyPairs[*].[KeyPairId,KeyName,KeyFingerprint]' --output table" \
    "key-pairs.txt"

# Elastic IPs
check_service "Elastic IPs" \
    "aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,PrivateIpAddress,InstanceId,AllocationId]' --output table" \
    "elastic-ips.txt"

# VPCs
echo ""
echo -e "${BLUE}=== VPC & Networking ===${NC}"
check_service "VPCs" \
    "aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,CidrBlock,IsDefault,Tags[?Key==\`Name\`].Value|[0]]' --output table" \
    "vpcs.txt"

# Subnets
check_service "Subnets" \
    "aws ec2 describe-subnets --query 'Subnets[*].[SubnetId,VpcId,CidrBlock,AvailabilityZone,Tags[?Key==\`Name\`].Value|[0]]' --output table" \
    "subnets.txt"

# Internet Gateways
check_service "Internet Gateways" \
    "aws ec2 describe-internet-gateways --query 'InternetGateways[*].[InternetGatewayId,Attachments[0].VpcId,Tags[?Key==\`Name\`].Value|[0]]' --output table" \
    "internet-gateways.txt"

# Route Tables
check_service "Route Tables" \
    "aws ec2 describe-route-tables --query 'RouteTables[*].[RouteTableId,VpcId,Tags[?Key==\`Name\`].Value|[0]]' --output table" \
    "route-tables.txt"

# NAT Gateways
check_service "NAT Gateways" \
    "aws ec2 describe-nat-gateways --query 'NatGateways[*].[NatGatewayId,VpcId,SubnetId,State]' --output table" \
    "nat-gateways.txt"

# S3 Buckets
echo ""
echo -e "${BLUE}=== S3 Storage ===${NC}"
check_service "S3 Buckets" \
    "aws s3 ls" \
    "s3-buckets.txt"

# Get detailed bucket info
if [ -s "$OUTPUT_DIR/s3-buckets.txt" ]; then
    echo -e "${YELLOW}Getting S3 bucket details...${NC}"
    aws s3 ls | awk '{print $3}' | while IFS= read -r bucket; do
        bucket="${bucket//$'\r'/}"
        [ -z "$bucket" ] && continue
        # Skip invalid parse artifacts so one bad line doesn't break bucket discovery.
        if [[ ! "$bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
            echo "Skipping invalid bucket name parse: $bucket" >> "$OUTPUT_DIR/s3-bucket-details.txt"
            echo "" >> "$OUTPUT_DIR/s3-bucket-details.txt"
            continue
        fi
        echo "Bucket: $bucket" >> "$OUTPUT_DIR/s3-bucket-details.txt"
        aws s3api get-bucket-location --bucket "$bucket" 2>&1 >> "$OUTPUT_DIR/s3-bucket-details.txt" || echo "  (no access)" >> "$OUTPUT_DIR/s3-bucket-details.txt"
        echo "" >> "$OUTPUT_DIR/s3-bucket-details.txt"
    done
fi

# RDS Databases
echo ""
echo -e "${BLUE}=== RDS Databases ===${NC}"
check_service "RDS Instances" \
    "aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceClass,Engine,EngineVersion,DBInstanceStatus,Endpoint.Address]' --output table" \
    "rds-instances.txt"

check_service "RDS Clusters" \
    "aws rds describe-db-clusters --query 'DBClusters[*].[DBClusterIdentifier,Engine,EngineVersion,Status,Endpoint]' --output table" \
    "rds-clusters.txt"

# Lambda Functions
echo ""
echo -e "${BLUE}=== Lambda Functions ===${NC}"
check_service "Lambda Functions" \
    "aws lambda list-functions --query 'Functions[*].[FunctionName,Runtime,Handler,LastModified]' --output table" \
    "lambda-functions.txt"

# ECS Clusters
echo ""
echo -e "${BLUE}=== ECS/EKS ===${NC}"
check_service "ECS Clusters" \
    "aws ecs list-clusters" \
    "ecs-clusters.txt"

# EKS Clusters
check_service "EKS Clusters" \
    "aws eks list-clusters" \
    "eks-clusters.txt"

# CloudFormation Stacks
echo ""
echo -e "${BLUE}=== CloudFormation ===${NC}"
check_service "CloudFormation Stacks" \
    "aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[*].[StackName,StackStatus,CreationTime]' --output table" \
    "cloudformation-stacks.txt"

# IAM Users
echo ""
echo -e "${BLUE}=== IAM ===${NC}"
check_service "IAM Users" \
    "aws iam list-users --query 'Users[*].[UserName,UserId,CreateDate]' --output table" \
    "iam-users.txt"

check_service "IAM Roles" \
    "aws iam list-roles --query 'Roles[*].[RoleName,CreateDate]' --output table" \
    "iam-roles.txt"

check_service "IAM Policies" \
    "aws iam list-policies --scope Local --query 'Policies[*].[PolicyName,CreateDate]' --output table" \
    "iam-policies.txt"

# Load Balancers
echo ""
echo -e "${BLUE}=== Load Balancers ===${NC}"
check_service "Application/Network Load Balancers" \
    "aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,Type,State.Code,DNSName]' --output table" \
    "load-balancers-v2.txt"

check_service "Classic Load Balancers" \
    "aws elb describe-load-balancers --query 'LoadBalancerDescriptions[*].[LoadBalancerName,DNSName,VPCId]' --output table" \
    "load-balancers-classic.txt"

# Auto Scaling Groups
echo ""
echo -e "${BLUE}=== Auto Scaling ===${NC}"
check_service "Auto Scaling Groups" \
    "aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[*].[AutoScalingGroupName,MinSize,MaxSize,DesiredCapacity]' --output table" \
    "auto-scaling-groups.txt"

# ElastiCache
echo ""
echo -e "${BLUE}=== ElastiCache ===${NC}"
check_service "ElastiCache Clusters" \
    "aws elasticache describe-cache-clusters --query 'CacheClusters[*].[CacheClusterId,CacheNodeType,Engine,CacheClusterStatus]' --output table" \
    "elasticache-clusters.txt"

# DynamoDB Tables
echo ""
echo -e "${BLUE}=== DynamoDB ===${NC}"
check_service "DynamoDB Tables" \
    "aws dynamodb list-tables" \
    "dynamodb-tables.txt"

# API Gateway
echo ""
echo -e "${BLUE}=== API Gateway ===${NC}"
check_service "REST APIs" \
    "aws apigateway get-rest-apis --query 'items[*].[id,name,createdDate]' --output table" \
    "api-gateway-rest.txt"

check_service "HTTP APIs" \
    "aws apigatewayv2 get-apis --query 'Items[*].[ApiId,Name,ProtocolType,CreatedDate]' --output table" \
    "api-gateway-http.txt"

# SNS Topics
echo ""
echo -e "${BLUE}=== SNS/SQS ===${NC}"
check_service "SNS Topics" \
    "aws sns list-topics" \
    "sns-topics.txt"

check_service "SQS Queues" \
    "aws sqs list-queues" \
    "sqs-queues.txt"

# CloudWatch Alarms
echo ""
echo -e "${BLUE}=== CloudWatch ===${NC}"
check_service "CloudWatch Alarms" \
    "aws cloudwatch describe-alarms --query 'MetricAlarms[*].[AlarmName,StateValue,MetricName]' --output table" \
    "cloudwatch-alarms.txt"

# Secrets Manager
echo ""
echo -e "${BLUE}=== Secrets Manager ===${NC}"
check_service "Secrets" \
    "aws secretsmanager list-secrets --query 'SecretList[*].[Name,LastChangedDate]' --output table" \
    "secrets-manager.txt"

# Parameter Store
check_service "SSM Parameters" \
    "aws ssm describe-parameters --query 'Parameters[*].[Name,Type,LastModifiedDate]' --output table" \
    "ssm-parameters.txt"

# ECR Repositories
echo ""
echo -e "${BLUE}=== ECR (Container Registry) ===${NC}"
check_service "ECR Repositories" \
    "aws ecr describe-repositories --query 'repositories[*].[repositoryName,repositoryUri,createdAt]' --output table" \
    "ecr-repositories.txt"

# Route53 Hosted Zones
echo ""
echo -e "${BLUE}=== Route53 ===${NC}"
check_service "Hosted Zones" \
    "aws route53 list-hosted-zones --query 'HostedZones[*].[Id,Name,ResourceRecordSetCount]' --output table" \
    "route53-zones.txt"

# ACM Certificates
echo ""
echo -e "${BLUE}=== ACM (SSL Certificates) ===${NC}"
check_service "ACM Certificates" \
    "aws acm list-certificates --query 'CertificateSummaryList[*].[DomainName,CertificateArn]' --output table" \
    "acm-certificates.txt"

# Generate summary report
echo ""
echo -e "${BLUE}=== Generating Summary Report ===${NC}"

# Helper function to format resource section
format_section() {
    local title="$1"
    local filename="$2"
    local filepath="$OUTPUT_DIR/$filename"

    echo ""
    echo "### $title"
    echo ""
    if [ ! -f "$filepath" ] || [ ! -s "$filepath" ]; then
        echo "*No resources found*"
    else
        echo '```'
        cat "$filepath"
        echo '```'
    fi
}

# Helper function to extract ARNs and build summary table
build_resource_table() {
    local temp_table="$OUTPUT_DIR/.temp_table.txt"
    > "$temp_table"  # Clear temp file

    clean_value() {
        local v="$1"
        v="${v//$'\r'/}"
        v="${v%\"}"
        v="${v#\"}"
        v="${v%,}"
        echo "$v"
    }

    add_row() {
        local type="$1"
        local name="$2"
        local arn="$3"
        name="$(clean_value "$name")"
        arn="$(clean_value "$arn")"
        [ -z "$name" ] && return 0
        [ -z "$arn" ] && return 0
        [ "$name" = "None" ] && return 0
        [ "$arn" = "None" ] && return 0
        printf "| %s | \`%s\` | \`%s\` |\n" "$type" "$name" "$arn" >> "$temp_table"
    }

    # Lambda
    while IFS=$'\t' read -r name arn; do
        add_row "Lambda Function" "$name" "$arn"
    done < <(aws lambda list-functions --query 'Functions[*].[FunctionName,FunctionArn]' --output text 2>/dev/null || true)

    # ECS
    while IFS= read -r arn; do
        arn="$(clean_value "$arn")"
        [ -z "$arn" ] && continue
        name="${arn##*/}"
        add_row "ECS Cluster" "$name" "$arn"
    done < <(aws ecs list-clusters --query 'clusterArns[]' --output text 2>/dev/null | tr '\t' '\n' || true)

    # ECR
    while IFS=$'\t' read -r name arn; do
        add_row "ECR Repository" "$name" "$arn"
    done < <(aws ecr describe-repositories --query 'repositories[*].[repositoryName,repositoryArn]' --output text 2>/dev/null || true)

    # RDS
    while IFS=$'\t' read -r name arn; do
        add_row "RDS Instance" "$name" "$arn"
    done < <(aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceArn]' --output text 2>/dev/null || true)

    while IFS=$'\t' read -r name arn; do
        add_row "RDS Cluster" "$name" "$arn"
    done < <(aws rds describe-db-clusters --query 'DBClusters[*].[DBClusterIdentifier,DBClusterArn]' --output text 2>/dev/null || true)

    # EC2/VPC resources (construct ARNs from IDs)
    while IFS= read -r id; do
        id="$(clean_value "$id")"
        [ -z "$id" ] && continue
        add_row "EC2 Instance" "$id" "arn:aws:ec2:$REGION:$ACCOUNT_ID:instance/$id"
    done < <(aws ec2 describe-instances --query 'Reservations[*].Instances[*].InstanceId' --output text 2>/dev/null | tr '\t' '\n' || true)

    while IFS= read -r id; do
        id="$(clean_value "$id")"
        [ -z "$id" ] && continue
        add_row "VPC" "$id" "arn:aws:ec2:$REGION:$ACCOUNT_ID:vpc/$id"
    done < <(aws ec2 describe-vpcs --query 'Vpcs[*].VpcId' --output text 2>/dev/null | tr '\t' '\n' || true)

    while IFS= read -r id; do
        id="$(clean_value "$id")"
        [ -z "$id" ] && continue
        add_row "Subnet" "$id" "arn:aws:ec2:$REGION:$ACCOUNT_ID:subnet/$id"
    done < <(aws ec2 describe-subnets --query 'Subnets[*].SubnetId' --output text 2>/dev/null | tr '\t' '\n' || true)

    while IFS= read -r id; do
        id="$(clean_value "$id")"
        [ -z "$id" ] && continue
        add_row "Security Group" "$id" "arn:aws:ec2:$REGION:$ACCOUNT_ID:security-group/$id"
    done < <(aws ec2 describe-security-groups --query 'SecurityGroups[*].GroupId' --output text 2>/dev/null | tr '\t' '\n' || true)

    # S3
    while IFS= read -r bucket; do
        bucket="$(clean_value "$bucket")"
        [ -z "$bucket" ] && continue
        add_row "S3 Bucket" "$bucket" "arn:aws:s3:::$bucket"
    done < <(aws s3api list-buckets --query 'Buckets[*].Name' --output text 2>/dev/null | tr '\t' '\n' || true)

    # DynamoDB
    while IFS= read -r table; do
        table="$(clean_value "$table")"
        [ -z "$table" ] && continue
        add_row "DynamoDB Table" "$table" "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/$table"
    done < <(aws dynamodb list-tables --query 'TableNames[]' --output text 2>/dev/null | tr '\t' '\n' || true)

    # SNS/SQS
    while IFS= read -r arn; do
        arn="$(clean_value "$arn")"
        [ -z "$arn" ] && continue
        name="${arn##*:}"
        add_row "SNS Topic" "$name" "$arn"
    done < <(aws sns list-topics --query 'Topics[*].TopicArn' --output text 2>/dev/null | tr '\t' '\n' || true)

    while IFS= read -r queue_url; do
        queue_url="$(clean_value "$queue_url")"
        [ -z "$queue_url" ] && continue
        queue_name="${queue_url##*/}"
        add_row "SQS Queue" "$queue_name" "arn:aws:sqs:$REGION:$ACCOUNT_ID:$queue_name"
    done < <(aws sqs list-queues --query 'QueueUrls[]' --output text 2>/dev/null | tr '\t' '\n' || true)

    # IAM
    while IFS=$'\t' read -r name arn; do
        add_row "IAM User" "$name" "$arn"
    done < <(aws iam list-users --query 'Users[*].[UserName,Arn]' --output text 2>/dev/null || true)

    while IFS=$'\t' read -r name arn; do
        add_row "IAM Role" "$name" "$arn"
    done < <(aws iam list-roles --query 'Roles[*].[RoleName,Arn]' --output text 2>/dev/null || true)

    # Secrets/ACM/ELB/CloudFormation
    while IFS=$'\t' read -r name arn; do
        add_row "Secret" "$name" "$arn"
    done < <(aws secretsmanager list-secrets --query 'SecretList[*].[Name,ARN]' --output text 2>/dev/null || true)

    while IFS=$'\t' read -r name arn; do
        add_row "ACM Certificate" "$name" "$arn"
    done < <(aws acm list-certificates --query 'CertificateSummaryList[*].[DomainName,CertificateArn]' --output text 2>/dev/null || true)

    while IFS=$'\t' read -r name arn; do
        add_row "Load Balancer" "$name" "$arn"
    done < <(aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,LoadBalancerArn]' --output text 2>/dev/null || true)

    while IFS=$'\t' read -r name arn; do
        add_row "CloudFormation Stack" "$name" "$arn"
    done < <(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[*].[StackName,StackId]' --output text 2>/dev/null || true)

    # Route53
    while IFS=$'\t' read -r zone_id zone_name; do
        zone_id="$(clean_value "$zone_id")"
        zone_name="$(clean_value "$zone_name")"
        zone_id="${zone_id#/hostedzone/}"
        [ -z "$zone_id" ] && continue
        add_row "Route53 Hosted Zone" "$zone_name" "arn:aws:route53:::hostedzone/$zone_id"
    done < <(aws route53 list-hosted-zones --query 'HostedZones[*].[Id,Name]' --output text 2>/dev/null || true)

    # Generate table if we have entries
    echo ""
    echo "## Resource Summary Table"
    echo ""

    if [ -s "$temp_table" ]; then
        sort -u "$temp_table" -o "$temp_table"
        local count
        count=$(wc -l < "$temp_table" | tr -d ' ')
        echo "Total Resources: **$count**"
        echo ""
        echo "| Resource Type | Resource Name | ARN |"
        echo "|--------------|---------------|-----|"
        sort "$temp_table"
    else
        echo "*No resources with ARNs found*"
    fi

    echo ""
    echo "---"

    rm -f "$temp_table" 2>/dev/null || true
}

# Generate comprehensive summary
{
    echo "# AWS Resource Inventory"
    echo ""
    echo "**Generated:** $(date)"
    echo "**Account ID:** $ACCOUNT_ID"
    echo "**User/Role:** $USER_ARN"
    echo "**Region:** $REGION"

    # Build and insert resource summary table
    build_resource_table

    echo ""
    echo "---"
    echo ""
    echo "## Compute Resources"

    format_section "EC2 Instances" "ec2-instances.txt"
    format_section "Lambda Functions" "lambda-functions.txt"
    format_section "ECS Clusters" "ecs-clusters.txt"
    format_section "EKS Clusters" "eks-clusters.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Networking"

    format_section "VPCs" "vpcs.txt"
    format_section "Subnets" "subnets.txt"
    format_section "Security Groups" "security-groups.txt"
    format_section "Internet Gateways" "internet-gateways.txt"
    format_section "NAT Gateways" "nat-gateways.txt"
    format_section "Route Tables" "route-tables.txt"
    format_section "Elastic IPs" "elastic-ips.txt"
    format_section "Application/Network Load Balancers" "load-balancers-v2.txt"
    format_section "Classic Load Balancers" "load-balancers-classic.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Storage"

    format_section "S3 Buckets" "s3-buckets.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Database"

    format_section "RDS Instances" "rds-instances.txt"
    format_section "RDS Clusters" "rds-clusters.txt"
    format_section "DynamoDB Tables" "dynamodb-tables.txt"
    format_section "ElastiCache Clusters" "elasticache-clusters.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Security & Identity"

    format_section "IAM Users" "iam-users.txt"
    format_section "IAM Roles" "iam-roles.txt"
    format_section "IAM Policies (Custom)" "iam-policies.txt"
    format_section "EC2 Key Pairs" "key-pairs.txt"
    format_section "Secrets Manager" "secrets-manager.txt"
    format_section "SSM Parameters" "ssm-parameters.txt"
    format_section "ACM Certificates" "acm-certificates.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Application Services"

    format_section "API Gateway REST APIs" "api-gateway-rest.txt"
    format_section "API Gateway HTTP APIs" "api-gateway-http.txt"
    format_section "SNS Topics" "sns-topics.txt"
    format_section "SQS Queues" "sqs-queues.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Infrastructure as Code"

    format_section "CloudFormation Stacks" "cloudformation-stacks.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Auto Scaling"

    format_section "Auto Scaling Groups" "auto-scaling-groups.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Monitoring & Observability"

    format_section "CloudWatch Alarms" "cloudwatch-alarms.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Container Registry"

    format_section "ECR Repositories" "ecr-repositories.txt"

    echo ""
    echo "---"
    echo ""
    echo "## DNS"

    format_section "Route53 Hosted Zones" "route53-zones.txt"

    echo ""
    echo "---"
    echo ""
    echo "## Next Steps"
    echo ""
    echo "1. Review resources above to understand what exists in your AWS account"
    echo "2. Identify which resources are still needed vs. can be deleted"
    echo "3. Document the purpose of each resource in your project documentation"
    echo "4. Consider using Infrastructure as Code (Terraform/CloudFormation) to manage these resources"
    echo "5. Review costs in AWS Cost Explorer to understand what's driving your bill"
    echo ""
    echo "## Detailed Files"
    echo ""
    echo "Individual resource details are also saved in separate files in this directory for easier processing:"
    echo ""
    ls -1 "$OUTPUT_DIR"/*.txt 2>/dev/null | while read f; do
        echo "- $(basename "$f")"
    done

} > "$OUTPUT_DIR/SUMMARY.md"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Inventory Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Results saved to: $OUTPUT_DIR${NC}"
echo ""
echo -e "${YELLOW}Quick view:${NC}"
echo -e "  cat $OUTPUT_DIR/SUMMARY.md"
echo ""
echo -e "${YELLOW}All inventories (latest 3 kept):${NC}"
echo -e "  ls -lt $INVENTORY_ROOT"
echo ""
