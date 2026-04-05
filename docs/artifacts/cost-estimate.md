# Infrastructure Cost Estimate and Baseline (Production)

Generated: 2026-04-05
Account: 699089610166
Primary region: ap-southeast-1

## Scope and data sources

This document separates three different cost views that are often conflated:

1. Terraform intended monthly cost (model)
2. Live provisioned footprint (what is deployed)
3. Incurred and forecast billing cost (what Cost Explorer reports)

Evidence used:

- Terraform model cost baseline: `platform/terraform/.infracost/infracost-report.txt` (generated 2026-03-30)
- Cost Explorer summary: `aws/costs/cost-analysis-20260405-095339/SUMMARY.md`
- Direct AWS cost capture: `build-logs/infra-audit-20260405/direct-findings.json`
- Live runtime footprint for burn-rate sanity checks: `build-logs/infra-audit-20260405/direct-findings.json`

## 1) Terraform intended monthly cost (Infracost model)

Infracost baseline for current Terraform configuration:

- Overall modeled monthly total: 275.15 USD
- Baseline portion: 233 USD
- Usage-estimated portion: 42 USD (from usage assumptions)

Top modeled cost drivers (monthly):

- ECS Fargate service `client`: 44.98 USD
- ECS Fargate service `transaction`: 44.98 USD
- ECS Fargate service `user`: 44.98 USD
- NAT Gateway `module.network.aws_nat_gateway.this[0]`: 43.07 USD plus variable data processing
- ALB `module.alb.aws_lb.crm`: 22.40 USD
- RDS `module.rds.aws_db_instance.postgres`: 21.96 USD in model assumptions

Important model caveat:

- Infracost report models RDS as Single-AZ `db.t4g.micro` with 20 GB storage in that snapshot.
- Live production inventory currently shows RDS `db.t4g.small` and `multiAz: true`.
- This means the current Terraform cost baseline is useful directionally, but may understate current live RDS cost profile.

## 2) Live incurred billing (Cost Explorer)

30-day window (2026-03-06 to 2026-04-05), from Cost Explorer summary:

- Gross usage cost: 24.0919 USD
- Credits/discounts: -24.0919 USD
- Net cost: ~0.00 USD

Current MTD direct capture (window start 2026-04-01, end 2026-04-06):

- Usage: 22.3720163277 USD
- Credits: -22.372016334 USD
- Tax: 0 USD
- Net MTD: effectively 0 USD after credits

Implication:

- Net-billed near-zero does not mean near-zero infrastructure usage.
- Usage exists, but credits currently offset it.

## 3) Live point-in-time burn estimate (runtime)

From runtime estimator output:

- Estimated live burn: 0.0924 USD/hour
- Estimated monthly equivalent: 67.47 USD/month

Breakdown included in that estimator:

- Three running ECS services (client, transaction, user), one task each.
- This is a partial runtime estimate and excludes many non-ECS cost components (for example NAT, ALB, CloudFront transfer, logs, backups).

## 4) Reconciliation: intended vs live billed

Summary comparison:

- Terraform intended (modeled): ~275.15 USD/month
- Runtime point estimate (partial): ~67.47 USD/month
- Forecast from direct Cost Explorer capture: ~67.01 USD for current month
- Net billed currently near 0 due active credits

Interpretation:

- Forecast and runtime estimate are close (both near 67 USD), which is a good sanity signal.
- Terraform model is materially higher because it includes broader baseline assumptions and explicit usage estimates.
- Credits currently mask true operating cost signal in net billing views.

## 5) Cost risk areas and follow-ups

Primary cost drivers to monitor:

- ECS Fargate steady-state compute (three always-on services)
- NAT Gateway hourly + data processing
- ALB hourly + LCU usage
- RDS class/Multi-AZ footprint
- CloudWatch log ingestion and retention

Recommended actions:

1. Refresh Infracost with current Terraform inputs and valid API key to remove stale assumptions.
2. Add a gross-usage dashboard (Usage only, excluding Credit) for operations and budgeting.
3. Track RDS class/Multi-AZ changes explicitly in release notes and cost diffs.
4. Add FinOps guardrails for NAT data processing and CloudWatch ingestion growth.
