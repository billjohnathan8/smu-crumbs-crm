# AWS Infrastructure Cost Estimate

> Generated with [Infracost](https://www.infracost.io/) v0.10.43 against `platform/terraform`  
> Region: `ap-southeast-1` (Singapore)  
> Date: March 9, 2026

---

## Summary

| Metric | Value |
|---|---|
| **Baseline monthly cost** | **$247.36** |
| Usage-based costs | Not included (traffic-dependent) |
| Total resources detected | 175 |
| Estimated (priced) | 51 |
| Free tier / no cost | 120 |
| Not yet supported | 4 |

> Usage costs (data transfer, requests, storage growth) are not included in the baseline. See the [usage-dependent costs](#usage-dependent-costs) section for per-unit rates.

---

## Fixed Monthly Costs

These resources have a predictable, always-on cost regardless of traffic.

| Service | Resource | Qty | Unit | Monthly Cost |
|---|---|---|---|---|
| **ECS Fargate** | `service["agent"]` — memory | 2 GB | GB/hr | $8.07 |
| | `service["agent"]` — compute | 1 CPU | vCPU/hr | $36.91 |
| | `service["client"]` — memory | 2 GB | GB/hr | $8.07 |
| | `service["client"]` — compute | 1 CPU | vCPU/hr | $36.91 |
| | `service["transaction"]` — memory | 2 GB | GB/hr | $8.07 |
| | `service["transaction"]` — compute | 1 CPU | vCPU/hr | $36.91 |
| **NAT Gateway** | `nat_gateway[0]` | 730 hrs | hours | $43.07 |
| **RDS PostgreSQL** | `db.t4g.micro` Multi-AZ instance | 730 hrs | hours | $37.23 |
| | Storage (gp3) | 20 GB | GB | $5.52 |
| **ALB** | Application load balancer | 730 hrs | hours | $18.40 |
| **WAF** | WAFv2 Web ACL | 1 month | months | $5.00 |
| **KMS** | RDS customer master key | 1 month | months | $1.00 |
| **Secrets Manager** | `db_password` | 1 month | months | $0.40 |
| | `db_username` | 1 month | months | $0.40 |
| | `jwt_hmac` | 1 month | months | $0.40 |
| | `root_admin_password` | 1 month | months | $0.40 |
| **CloudWatch Alarms** | ALB 5xx | 1 alarm | standard | $0.10 |
| | ECS CPU high — agent | 1 alarm | standard | $0.10 |
| | ECS CPU high — client | 1 alarm | standard | $0.10 |
| | ECS CPU high — transaction | 1 alarm | standard | $0.10 |
| | RDS CPU high | 1 alarm | standard | $0.10 |
| | RDS free storage | 1 alarm | standard | $0.10 |

**Fixed subtotal: ~$247.36 / month**

---

## Cost by Service Group

| Service Group | Monthly Cost | Notes |
|---|---|---|
| ECS Fargate (3 services × 2 tasks) | $179.88 | 0.5 vCPU, 1 GB RAM per task |
| NAT Gateway | $43.07 | + data transfer charges |
| RDS PostgreSQL (Multi-AZ) | $42.75 | Instance + 20 GB gp3 storage |
| ALB | $18.40 | + LCU charges at $5.84/LCU |
| WAF | $5.00 | + $0.60 per 1M requests |
| Secrets Manager (4 secrets) | $1.60 | + API request charges |
| KMS (1 key) | $1.00 | + per-request charges |
| CloudWatch Alarms (6 alarms) | $0.60 | Standard resolution |
| **Total (baseline)** | **$247.36** | |

> **ECS Fargate is the dominant cost at ~73% of the baseline bill.** NAT Gateway is the second largest at ~17%.

---

## Usage-Dependent Costs

These resources have $0 fixed cost but accrue charges based on usage volume.

### Compute & API

| Resource | Metric | Rate |
|---|---|---|
| API Gateway (HTTP) | Requests (first 300M) | $1.25 per 1M requests |
| Lambda (log, aml, aml_consumer, audit_consumer, verification) | Requests | $0.20 per 1M requests |
| Lambda | Duration | $0.0000166667 per GB-second |
| Lambda | Ephemeral storage | $0.000000037 per GB-second |
| WAF | Requests | $0.60 per 1M requests |
| KMS | API requests | $0.03 per 10k requests |
| SNS (verification topic) | API requests (over 1M) | $0.50 per 1M requests |
| SNS | Email notifications (over 1k) | $2.00 per 100k |
| SNS | HTTP/HTTPS notifications (over 100k) | $0.06 per 100k |
| SQS (audit, aml, DLQs) | Requests | $0.40 per 1M requests |

### Networking & CDN

| Resource | Metric | Rate |
|---|---|---|
| NAT Gateway | Data processed | $0.059 per GB |
| ALB | Load balancer capacity units (LCU) | $5.84 per LCU |
| CloudFront | Data transfer out (first 10 TB) | $0.085 per GB |
| CloudFront | Data transfer to origin | $0.02 per GB |
| CloudFront | HTTPS requests | $0.01 per 10k requests |
| CloudFront | HTTP requests | $0.0075 per 10k requests |

### Storage & Database

| Resource | Metric | Rate |
|---|---|---|
| RDS | Additional backup storage | $0.095 per GB |
| RDS | Performance Insights API | $0.01 per 1000 requests |
| DynamoDB (audit_logs, aml_reports) | Write request unit (WRU) | $0.00000071 per WRU |
| DynamoDB | Read request unit (RRU) | $0.0000001425 per RRU |
| DynamoDB | Data storage | $0.29 per GB |
| DynamoDB | PITR backup storage | $0.23 per GB |
| DynamoDB | On-demand backup | $0.11 per GB |
| S3 (frontend, verification, cloudtrail) | Storage | $0.025 per GB |
| S3 | PUT/COPY/POST/LIST | $0.005 per 1k requests |
| S3 | GET and other requests | $0.0004 per 1k requests |

### Observability

| Resource | Metric | Rate |
|---|---|---|
| CloudWatch Logs (9 log groups) | Data ingested | $0.70 per GB |
| CloudWatch Logs | Archival storage | $0.03 per GB |
| CloudWatch Logs | Insights queries | $0.007 per GB |
| CloudTrail | Management events (additional copies) | $2.00 per 100k events |
| CloudTrail | Data events | $0.10 per 100k events |

### Backup

| Resource | Metric | Rate |
|---|---|---|
| AWS Backup vault | RDS snapshot | $0.095 per GB |
| AWS Backup vault | DynamoDB backup | $0.11 per GB |
| AWS Backup vault | DynamoDB restore | $0.17 per GB |
| AWS Backup vault | EBS snapshot | $0.05 per GB |

---

## Free Resources (120 detected)

The following resource types were detected but have no direct cost:
- VPC, subnets, route tables, internet gateway, security groups
- IAM roles and policies
- ECS cluster, task definitions, service discovery
- ECR repository (storage billed separately, price not available at scan time)
- Cognito user pool
- ACM certificates
- SES sending domain
- EventBridge rules (AML scheduler)
- CloudWatch dashboards

---

## Notes

- Costs shown are for **`ap-southeast-1` (Singapore)** on-demand pricing.
- ECS task counts reflect the **desired count of 2 per service** (agent, client, transaction). Autoscaling can increase this to max 4 per service.
- RDS is configured as **Multi-AZ** — disabling this would roughly halve the RDS instance cost ($37 → ~$18/mo).
- A **second NAT Gateway** would be added if `enable_multi_az_nat = true`, adding another ~$43/mo.

---

## Running Infracost Locally

Infracost reads the Terraform source (no `terraform plan` required) and produces a cost breakdown against live AWS pricing.

### Prerequisites

| Requirement | Notes |
|---|---|
| [Infracost CLI](https://www.infracost.io/docs/#quick-start) | v0.10+ — install via `winget`, `brew`, or download |
| Infracost API key | Free account at [infracost.io](https://www.infracost.io/) |
| Terraform source | `platform/terraform/` in this repository |

#### Install Infracost

```bash
# macOS / Linux
brew install infracost

# Windows (winget)
winget install Infracost.Infracost

# Or download directly
# https://www.infracost.io/docs/#quick-start
```

#### Authenticate

```bash
infracost auth login
```

This opens a browser, creates a free account, and writes your API key to `~/.config/infracost/credentials.yml`. The key starts with `ico-`.

---

### Commands

All commands should be run from `platform/terraform/`.

#### Full breakdown (current branch)

```bash
cd platform/terraform
infracost breakdown --path .
```

Produces a table of every priced resource with monthly estimates and a project total.

#### Breakdown with custom variables

If you pass a tfvars file at apply time, pass it to Infracost too so the resource counts and sizes match:

```bash
infracost breakdown --path . \
  --terraform-var-file terraform.tfvars
```

#### Cost diff between two branches

Shows the delta of adding, changing, or removing resources — useful before opening a PR.

```bash
# From the branch with your changes:
infracost diff --path . \
  --compare-to main

# Or compare against a specific tfvars baseline:
infracost diff --path . \
  --compare-to main \
  --terraform-var-file terraform.tfvars
```

#### JSON output (for scripting or archiving)

```bash
infracost breakdown --path . --format json --out-file infracost.json
```

#### HTML report

```bash
infracost breakdown --path . --format html --out-file infracost-report.html
```

---

### Interpreting the Output

```
Name                                          Monthly Qty  Unit   Monthly Cost
─────────────────────────────────────────────────────────────────────────────
aws_ecs_service.services["agent"]
├─ Per vCPU per hour                                730  vCPU-hours    $36.91
└─ Per GB per hour                                1,460  GB-hours       $8.07
...
OVERALL TOTAL                                                          $247.36
```

- **Resources with `$0`** are free tier or priced only on usage (Lambda requests, S3 storage, etc.).
- **Resources marked `Cost depends on usage`** have a $0 baseline but accrue charges at runtime — see the [usage-dependent costs](#usage-dependent-costs) section.
- **`infracost diff`** prefixes rows with `+`/`-`/`~` to show additions, removals, and changes.

---

### Updating This Document

After making infrastructure changes that affect cost, regenerate the baseline and update the tables above:

```bash
cd platform/terraform
infracost breakdown --path . --format table
```

Then update the [Fixed Monthly Costs](#fixed-monthly-costs) and [Cost by Service Group](#cost-by-service-group) sections to reflect the new numbers.
