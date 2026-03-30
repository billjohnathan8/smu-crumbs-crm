#
# AWS Resource Discovery Script (PowerShell) - Interactive Version
# Discovers and documents all AWS resources in your account
# Supports multiple authentication methods
#

param(
    [switch]$PromptForCredentials,
    [string]$Profile = "",
    [switch]$Help
)

if ($Help) {
    Write-Host @"
AWS Resource Discovery Script

USAGE:
  .\discover-aws-resources-interactive.ps1 [OPTIONS]

AUTHENTICATION OPTIONS:
  (No options)              Use existing AWS CLI config (recommended)
  -Profile <name>           Use a specific AWS CLI profile
  -PromptForCredentials     Prompt for AWS credentials (not recommended)

EXAMPLES:
  # Use existing AWS CLI config (what you've already set up)
  .\discover-aws-resources-interactive.ps1

  # Use a specific AWS profile
  .\discover-aws-resources-interactive.ps1 -Profile production

  # Prompt for credentials (enters them temporarily)
  .\discover-aws-resources-interactive.ps1 -PromptForCredentials

OPTIONS:
  -Help                     Show this help message

SECURITY NOTES:
  - Using existing AWS CLI config is most secure (credentials encrypted)
  - Prompting for credentials stores them in memory only (not on disk)
  - Environment variables are cleared after script completes
  - NEVER commit credentials to git or store in plain text files
"@ -ForegroundColor Cyan
    exit 0
}

$ErrorActionPreference = "Continue"

# Output directory structure
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$awsRoot = "aws"
$inventoryRoot = Join-Path $awsRoot "inventory"
$outputDir = Join-Path $inventoryRoot "aws-inventory-$timestamp"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AWS Resource Discovery (Interactive)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Handle authentication
$envVarsSet = $false

if ($PromptForCredentials) {
    Write-Host "SECURITY WARNING: Prompting for credentials" -ForegroundColor Red
    Write-Host "Credentials will be stored in memory only and cleared after script completes" -ForegroundColor Yellow
    Write-Host ""

    $accessKey = Read-Host "Enter AWS Access Key ID"
    $secretKeySecure = Read-Host "Enter AWS Secret Access Key" -AsSecureString
    $region = Read-Host "Enter AWS Region (e.g., ap-southeast-1, us-east-1)"

    # Convert SecureString to plain text (needed for AWS CLI)
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretKeySecure)
    $secretKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

    # Set environment variables
    $env:AWS_ACCESS_KEY_ID = $accessKey
    $env:AWS_SECRET_ACCESS_KEY = $secretKey
    $env:AWS_DEFAULT_REGION = $region
    $envVarsSet = $true

    Write-Host ""
    Write-Host "Credentials set temporarily in environment" -ForegroundColor Green
    Write-Host ""

    # Clear sensitive variables
    Clear-Variable -Name secretKey, BSTR
} elseif ($Profile -ne "") {
    Write-Host "Using AWS profile: $Profile" -ForegroundColor Cyan
    $env:AWS_PROFILE = $Profile
    $envVarsSet = $true
} else {
    Write-Host "Using existing AWS CLI configuration" -ForegroundColor Cyan
    Write-Host ""
}

# Verify authentication
Write-Host "Verifying AWS authentication..." -ForegroundColor Yellow
try {
    $identity = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to authenticate with AWS" -ForegroundColor Red
        Write-Host $identity -ForegroundColor Red
        Write-Host ""
        Write-Host "Please check your credentials and try again." -ForegroundColor Yellow
        Write-Host "Run with -Help for usage information." -ForegroundColor Yellow

        # Clear environment variables if we set them
        if ($envVarsSet) {
            Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
            Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
            Remove-Item Env:\AWS_DEFAULT_REGION -ErrorAction SilentlyContinue
            Remove-Item Env:\AWS_PROFILE -ErrorAction SilentlyContinue
        }
        exit 1
    }

    $accountInfo = $identity | ConvertFrom-Json
    $accountId = $accountInfo.Account
    $userArn = $accountInfo.Arn

    Write-Host "Successfully authenticated!" -ForegroundColor Green
    Write-Host "Account ID: $accountId" -ForegroundColor Green
    Write-Host "User/Role: $userArn" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: Failed to verify AWS credentials" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    # Clear environment variables if we set them
    if ($envVarsSet) {
        Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
        Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
        Remove-Item Env:\AWS_DEFAULT_REGION -ErrorAction SilentlyContinue
        Remove-Item Env:\AWS_PROFILE -ErrorAction SilentlyContinue
    }
    exit 1
}

# Get region
$region = aws configure get region
if ([string]::IsNullOrEmpty($region)) {
    $region = $env:AWS_DEFAULT_REGION
}
if ([string]::IsNullOrEmpty($region)) {
    $region = "us-east-1"
}

Write-Host "Region: $region" -ForegroundColor Green
Write-Host ""

# Create parent directory if it doesn't exist
New-Item -ItemType Directory -Force -Path $awsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $inventoryRoot | Out-Null

# Migrate any old-format directories to new structure
Write-Host "Checking for existing inventory directories..." -ForegroundColor Yellow
Get-ChildItem -Directory -Filter "aws-inventory-*" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Parent.Name -ne $inventoryRoot) {
        $targetPath = Join-Path $inventoryRoot $_.Name
        if (-not (Test-Path $targetPath)) {
            Write-Host "  Migrating $($_.Name) to $inventoryRoot/" -ForegroundColor Cyan
            Move-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }
}

# Migrate legacy runs from aws-inventory/ root if present
$legacyInventoryRoot = "aws-inventory"
if (Test-Path $legacyInventoryRoot) {
    Get-ChildItem -Path $legacyInventoryRoot -Directory -Filter "aws-inventory-*" -ErrorAction SilentlyContinue | ForEach-Object {
        $targetPath = Join-Path $inventoryRoot $_.Name
        if (-not (Test-Path $targetPath)) {
            Write-Host "  Migrating $($_.Name) from $legacyInventoryRoot/ to $inventoryRoot/" -ForegroundColor Cyan
            Move-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }
}

# Prune old runs (keep only latest 3)
$keepCount = 3
$pruneBeforeCreate = $keepCount - 1
$allRuns = Get-ChildItem -Path $inventoryRoot -Directory -Filter "aws-inventory-*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending

if ($allRuns.Count -gt $pruneBeforeCreate) {
    Write-Host "Pruning old inventory runs (keeping latest $keepCount)..." -ForegroundColor Yellow
    $allRuns | Select-Object -Skip $pruneBeforeCreate | ForEach-Object {
        Write-Host "  Removing old run: $($_.Name)" -ForegroundColor Gray
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Create new run directory
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Host ""
Write-Host "Creating inventory in: $outputDir" -ForegroundColor Cyan
Write-Host ""

# Function to run AWS command and save output
function Invoke-AWSDiscovery {
    param(
        [string]$ServiceName,
        [string]$Command,
        [string]$OutputFile
    )

    Write-Host "Checking $ServiceName..." -ForegroundColor Yellow
    try {
        Invoke-Expression $Command | Out-File -FilePath "$outputDir\$OutputFile" -Encoding UTF8
        Write-Host "  Found resources (see $OutputFile)" -ForegroundColor Green
    } catch {
        Write-Host "  Error or no access" -ForegroundColor Red
        $_.Exception.Message | Out-File -FilePath "$outputDir\$OutputFile" -Encoding UTF8
    }
}

# EC2 Instances
Write-Host ""
Write-Host "=== EC2 Instances ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "EC2 Instances" `
    -Command "aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,PublicIpAddress,PrivateIpAddress,Tags[?Key==``Name``].Value|[0]]' --output table" `
    -OutputFile "ec2-instances.txt"

Invoke-AWSDiscovery -ServiceName "Security Groups" `
    -Command "aws ec2 describe-security-groups --query 'SecurityGroups[*].[GroupId,GroupName,Description,VpcId]' --output table" `
    -OutputFile "security-groups.txt"

Invoke-AWSDiscovery -ServiceName "EC2 Key Pairs" `
    -Command "aws ec2 describe-key-pairs --query 'KeyPairs[*].[KeyPairId,KeyName,KeyFingerprint]' --output table" `
    -OutputFile "key-pairs.txt"

Invoke-AWSDiscovery -ServiceName "Elastic IPs" `
    -Command "aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,PrivateIpAddress,InstanceId,AllocationId]' --output table" `
    -OutputFile "elastic-ips.txt"

# VPC & Networking
Write-Host ""
Write-Host "=== VPC & Networking ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "VPCs" `
    -Command "aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,CidrBlock,IsDefault,Tags[?Key==``Name``].Value|[0]]' --output table" `
    -OutputFile "vpcs.txt"

Invoke-AWSDiscovery -ServiceName "Subnets" `
    -Command "aws ec2 describe-subnets --query 'Subnets[*].[SubnetId,VpcId,CidrBlock,AvailabilityZone,Tags[?Key==``Name``].Value|[0]]' --output table" `
    -OutputFile "subnets.txt"

Invoke-AWSDiscovery -ServiceName "Internet Gateways" `
    -Command "aws ec2 describe-internet-gateways --query 'InternetGateways[*].[InternetGatewayId,Attachments[0].VpcId,Tags[?Key==``Name``].Value|[0]]' --output table" `
    -OutputFile "internet-gateways.txt"

Invoke-AWSDiscovery -ServiceName "Route Tables" `
    -Command "aws ec2 describe-route-tables --query 'RouteTables[*].[RouteTableId,VpcId,Tags[?Key==``Name``].Value|[0]]' --output table" `
    -OutputFile "route-tables.txt"

Invoke-AWSDiscovery -ServiceName "NAT Gateways" `
    -Command "aws ec2 describe-nat-gateways --query 'NatGateways[*].[NatGatewayId,VpcId,SubnetId,State]' --output table" `
    -OutputFile "nat-gateways.txt"

# S3 Storage
Write-Host ""
Write-Host "=== S3 Storage ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "S3 Buckets" `
    -Command "aws s3 ls" `
    -OutputFile "s3-buckets.txt"

# RDS Databases
Write-Host ""
Write-Host "=== RDS Databases ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "RDS Instances" `
    -Command "aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceClass,Engine,EngineVersion,DBInstanceStatus,Endpoint.Address]' --output table" `
    -OutputFile "rds-instances.txt"

Invoke-AWSDiscovery -ServiceName "RDS Clusters" `
    -Command "aws rds describe-db-clusters --query 'DBClusters[*].[DBClusterIdentifier,Engine,EngineVersion,Status,Endpoint]' --output table" `
    -OutputFile "rds-clusters.txt"

# Lambda Functions
Write-Host ""
Write-Host "=== Lambda Functions ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "Lambda Functions" `
    -Command "aws lambda list-functions --query 'Functions[*].[FunctionName,Runtime,Handler,LastModified]' --output table" `
    -OutputFile "lambda-functions.txt"

# ECS/EKS
Write-Host ""
Write-Host "=== ECS/EKS ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "ECS Clusters" `
    -Command "aws ecs list-clusters" `
    -OutputFile "ecs-clusters.txt"

Invoke-AWSDiscovery -ServiceName "EKS Clusters" `
    -Command "aws eks list-clusters" `
    -OutputFile "eks-clusters.txt"

# CloudFormation
Write-Host ""
Write-Host "=== CloudFormation ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "CloudFormation Stacks" `
    -Command "aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[*].[StackName,StackStatus,CreationTime]' --output table" `
    -OutputFile "cloudformation-stacks.txt"

# IAM
Write-Host ""
Write-Host "=== IAM ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "IAM Users" `
    -Command "aws iam list-users --query 'Users[*].[UserName,UserId,CreateDate]' --output table" `
    -OutputFile "iam-users.txt"

Invoke-AWSDiscovery -ServiceName "IAM Roles" `
    -Command "aws iam list-roles --query 'Roles[*].[RoleName,CreateDate]' --output table" `
    -OutputFile "iam-roles.txt"

Invoke-AWSDiscovery -ServiceName "IAM Policies (Custom)" `
    -Command "aws iam list-policies --scope Local --query 'Policies[*].[PolicyName,CreateDate]' --output table" `
    -OutputFile "iam-policies.txt"

# Load Balancers
Write-Host ""
Write-Host "=== Load Balancers ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "Application/Network Load Balancers" `
    -Command "aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,Type,State.Code,DNSName]' --output table" `
    -OutputFile "load-balancers-v2.txt"

Invoke-AWSDiscovery -ServiceName "Classic Load Balancers" `
    -Command "aws elb describe-load-balancers --query 'LoadBalancerDescriptions[*].[LoadBalancerName,DNSName,VPCId]' --output table" `
    -OutputFile "load-balancers-classic.txt"

# Auto Scaling
Write-Host ""
Write-Host "=== Auto Scaling ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "Auto Scaling Groups" `
    -Command "aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[*].[AutoScalingGroupName,MinSize,MaxSize,DesiredCapacity]' --output table" `
    -OutputFile "auto-scaling-groups.txt"

# ElastiCache
Write-Host ""
Write-Host "=== ElastiCache ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "ElastiCache Clusters" `
    -Command "aws elasticache describe-cache-clusters --query 'CacheClusters[*].[CacheClusterId,CacheNodeType,Engine,CacheClusterStatus]' --output table" `
    -OutputFile "elasticache-clusters.txt"

# DynamoDB
Write-Host ""
Write-Host "=== DynamoDB ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "DynamoDB Tables" `
    -Command "aws dynamodb list-tables" `
    -OutputFile "dynamodb-tables.txt"

# API Gateway
Write-Host ""
Write-Host "=== API Gateway ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "REST APIs" `
    -Command "aws apigateway get-rest-apis --query 'items[*].[id,name,createdDate]' --output table" `
    -OutputFile "api-gateway-rest.txt"

Invoke-AWSDiscovery -ServiceName "HTTP APIs" `
    -Command "aws apigatewayv2 get-apis --query 'Items[*].[ApiId,Name,ProtocolType,CreatedDate]' --output table" `
    -OutputFile "api-gateway-http.txt"

# SNS/SQS
Write-Host ""
Write-Host "=== SNS/SQS ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "SNS Topics" `
    -Command "aws sns list-topics" `
    -OutputFile "sns-topics.txt"

Invoke-AWSDiscovery -ServiceName "SQS Queues" `
    -Command "aws sqs list-queues" `
    -OutputFile "sqs-queues.txt"

# CloudWatch
Write-Host ""
Write-Host "=== CloudWatch ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "CloudWatch Alarms" `
    -Command "aws cloudwatch describe-alarms --query 'MetricAlarms[*].[AlarmName,StateValue,MetricName]' --output table" `
    -OutputFile "cloudwatch-alarms.txt"

# Secrets Manager
Write-Host ""
Write-Host "=== Secrets Manager ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "Secrets" `
    -Command "aws secretsmanager list-secrets --query 'SecretList[*].[Name,LastChangedDate]' --output table" `
    -OutputFile "secrets-manager.txt"

Invoke-AWSDiscovery -ServiceName "SSM Parameters" `
    -Command "aws ssm describe-parameters --query 'Parameters[*].[Name,Type,LastModifiedDate]' --output table" `
    -OutputFile "ssm-parameters.txt"

# ECR
Write-Host ""
Write-Host "=== ECR (Container Registry) ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "ECR Repositories" `
    -Command "aws ecr describe-repositories --query 'repositories[*].[repositoryName,repositoryUri,createdAt]' --output table" `
    -OutputFile "ecr-repositories.txt"

# Route53
Write-Host ""
Write-Host "=== Route53 ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "Hosted Zones" `
    -Command "aws route53 list-hosted-zones --query 'HostedZones[*].[Id,Name,ResourceRecordSetCount]' --output table" `
    -OutputFile "route53-zones.txt"

# ACM
Write-Host ""
Write-Host "=== ACM (SSL Certificates) ===" -ForegroundColor Cyan
Invoke-AWSDiscovery -ServiceName "ACM Certificates" `
    -Command "aws acm list-certificates --query 'CertificateSummaryList[*].[DomainName,CertificateArn]' --output table" `
    -OutputFile "acm-certificates.txt"

# Generate summary report
Write-Host ""
Write-Host "=== Generating Summary Report ===" -ForegroundColor Cyan

# Helper function to format resource section
function Get-ResourceSection {
    param([string]$Title, [string]$FileName)

    $content = Get-Content "$outputDir\$FileName" -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($content)) {
        return "### $Title`n`n*No resources found*`n"
    }
    # Use a here-string to avoid backtick escaping issues
    $codeFence = '```'
    return "### $Title`n$codeFence`n$content`n$codeFence`n"
}

# Helper function to extract resources with ARNs for summary table
function Get-ResourceTableEntries {
    $entries = @()

    # Extract from various resource files
    $resourceMappings = @{
        "lambda-functions.txt" = "Lambda Function"
        "ecs-clusters.txt" = "ECS Cluster"
        "rds-instances.txt" = "RDS Instance"
        "rds-clusters.txt" = "RDS Cluster"
        "dynamodb-tables.txt" = "DynamoDB Table"
        "s3-buckets.txt" = "S3 Bucket"
        "ecr-repositories.txt" = "ECR Repository"
        "sns-topics.txt" = "SNS Topic"
        "sqs-queues.txt" = "SQS Queue"
        "secrets-manager.txt" = "Secrets Manager Secret"
        "cloudformation-stacks.txt" = "CloudFormation Stack"
        "iam-roles.txt" = "IAM Role"
        "iam-users.txt" = "IAM User"
        "load-balancers-v2.txt" = "Load Balancer"
        "api-gateway-rest.txt" = "API Gateway REST"
        "api-gateway-http.txt" = "API Gateway HTTP"
        "ec2-instances.txt" = "EC2 Instance"
        "vpcs.txt" = "VPC"
        "security-groups.txt" = "Security Group"
        "route53-zones.txt" = "Route53 Hosted Zone"
        "acm-certificates.txt" = "ACM Certificate"
    }

    foreach ($file in $resourceMappings.Keys) {
        $filePath = "$outputDir\$file"
        if (Test-Path $filePath) {
            $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
            if (![string]::IsNullOrWhiteSpace($content)) {
                $resourceType = $resourceMappings[$file]

                # Extract ARNs
                $arns = [regex]::Matches($content, 'arn:aws:[^:\s]+:[^:\s]*:[^:\s]*:[^\s|]+') | ForEach-Object { $_.Value }

                foreach ($arn in $arns) {
                    # Extract resource name from ARN (last part after /)
                    $name = ($arn -split '/')[-1]
                    if ([string]::IsNullOrEmpty($name) -or $name -eq $arn) {
                        # Try splitting by : instead
                        $name = ($arn -split ':')[-1]
                    }

                    $entries += [PSCustomObject]@{
                        ARN = $arn
                        Type = $resourceType
                        Name = $name
                    }
                }
            }
        }
    }

    # Also extract resources without ARNs but with identifiers
    # S3 buckets (listed by name)
    $s3Content = Get-Content "$outputDir\s3-buckets.txt" -Raw -ErrorAction SilentlyContinue
    if (![string]::IsNullOrWhiteSpace($s3Content)) {
        $s3Lines = $s3Content -split "`n" | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}' }
        foreach ($line in $s3Lines) {
            $bucketName = ($line -split '\s+')[-1]
            if (![string]::IsNullOrWhiteSpace($bucketName) -and $bucketName -notmatch '^\d{4}-\d{2}-\d{2}') {
                $arn = "arn:aws:s3:::$bucketName"
                if ($entries.ARN -notcontains $arn) {
                    $entries += [PSCustomObject]@{
                        ARN = $arn
                        Type = "S3 Bucket"
                        Name = $bucketName
                    }
                }
            }
        }
    }

    return $entries | Sort-Object -Property Type, Name
}

# Build resource summary table
$tableEntries = Get-ResourceTableEntries
$resourceTable = ""
if ($tableEntries.Count -gt 0) {
    $resourceTable = @"

## Resource Summary Table

Total Resources: **$($tableEntries.Count)**

| Resource Type | Resource Name | ARN |
|--------------|---------------|-----|
$(($tableEntries | ForEach-Object { "| $($_.Type) | ``$($_.Name)`` | ``$($_.ARN)`` |" }) -join "`n")

---

"@
} else {
    $resourceTable = "`n## Resource Summary Table`n`n*No resources with ARNs found*`n`n---`n"
}

$summary = @"
# AWS Resource Inventory

**Generated:** $(Get-Date)
**Account ID:** $accountId
**User/Role:** $userArn
**Region:** $region
$resourceTable

---

## Compute Resources

$(Get-ResourceSection "EC2 Instances" "ec2-instances.txt")

$(Get-ResourceSection "Lambda Functions" "lambda-functions.txt")

$(Get-ResourceSection "ECS Clusters" "ecs-clusters.txt")

$(Get-ResourceSection "EKS Clusters" "eks-clusters.txt")

---

## Networking

$(Get-ResourceSection "VPCs" "vpcs.txt")

$(Get-ResourceSection "Subnets" "subnets.txt")

$(Get-ResourceSection "Security Groups" "security-groups.txt")

$(Get-ResourceSection "Internet Gateways" "internet-gateways.txt")

$(Get-ResourceSection "NAT Gateways" "nat-gateways.txt")

$(Get-ResourceSection "Route Tables" "route-tables.txt")

$(Get-ResourceSection "Elastic IPs" "elastic-ips.txt")

$(Get-ResourceSection "Application/Network Load Balancers" "load-balancers-v2.txt")

$(Get-ResourceSection "Classic Load Balancers" "load-balancers-classic.txt")

---

## Storage

$(Get-ResourceSection "S3 Buckets" "s3-buckets.txt")

---

## Database

$(Get-ResourceSection "RDS Instances" "rds-instances.txt")

$(Get-ResourceSection "RDS Clusters" "rds-clusters.txt")

$(Get-ResourceSection "DynamoDB Tables" "dynamodb-tables.txt")

$(Get-ResourceSection "ElastiCache Clusters" "elasticache-clusters.txt")

---

## Security & Identity

$(Get-ResourceSection "IAM Users" "iam-users.txt")

$(Get-ResourceSection "IAM Roles" "iam-roles.txt")

$(Get-ResourceSection "IAM Policies (Custom)" "iam-policies.txt")

$(Get-ResourceSection "EC2 Key Pairs" "key-pairs.txt")

$(Get-ResourceSection "Secrets Manager" "secrets-manager.txt")

$(Get-ResourceSection "SSM Parameters" "ssm-parameters.txt")

$(Get-ResourceSection "ACM Certificates" "acm-certificates.txt")

---

## Application Services

$(Get-ResourceSection "API Gateway REST APIs" "api-gateway-rest.txt")

$(Get-ResourceSection "API Gateway HTTP APIs" "api-gateway-http.txt")

$(Get-ResourceSection "SNS Topics" "sns-topics.txt")

$(Get-ResourceSection "SQS Queues" "sqs-queues.txt")

---

## Infrastructure as Code

$(Get-ResourceSection "CloudFormation Stacks" "cloudformation-stacks.txt")

---

## Auto Scaling

$(Get-ResourceSection "Auto Scaling Groups" "auto-scaling-groups.txt")

---

## Monitoring & Observability

$(Get-ResourceSection "CloudWatch Alarms" "cloudwatch-alarms.txt")

---

## Container Registry

$(Get-ResourceSection "ECR Repositories" "ecr-repositories.txt")

---

## DNS

$(Get-ResourceSection "Route53 Hosted Zones" "route53-zones.txt")

---

## Next Steps

1. Review resources above to understand what exists in your AWS account
2. Identify which resources are still needed vs. can be deleted
3. Document the purpose of each resource in your project documentation
4. Consider using Infrastructure as Code (Terraform/CloudFormation) to manage these resources
5. Review costs in AWS Cost Explorer to understand what's driving your bill

## Detailed Files

Individual resource details are also saved in separate files in this directory for easier processing:

$(Get-ChildItem -Path $outputDir -Filter "*.txt" | ForEach-Object { "- $($_.Name)" } | Out-String)
"@

$summary | Out-File -FilePath "$outputDir\SUMMARY.md" -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Inventory Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Results saved to: $outputDir" -ForegroundColor Green
Write-Host ""
Write-Host "Quick view:" -ForegroundColor Yellow
Write-Host "  Get-Content $outputDir\SUMMARY.md" -ForegroundColor White
Write-Host ""
Write-Host "All inventories (latest 3 kept):" -ForegroundColor Yellow
Write-Host "  Get-ChildItem $inventoryRoot" -ForegroundColor White
Write-Host ""

# Clear environment variables if we set them
if ($envVarsSet) {
    Write-Host "Clearing temporary credentials from environment..." -ForegroundColor Yellow
    Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\AWS_DEFAULT_REGION -ErrorAction SilentlyContinue
    Remove-Item Env:\AWS_PROFILE -ErrorAction SilentlyContinue
    Write-Host "Credentials cleared." -ForegroundColor Green
}
