## Cognito Rollout and Auth Modes

Safe migration path from local HS256 tokens to Cognito RS256 tokens.

Runtime auth modes:
- `local`: local HS256 tokens only
- `hybrid`: local HS256 + Cognito RS256
- `cognito`: Cognito RS256 only

Backend Cognito settings:
- `COGNITO_ISSUER`
- `COGNITO_AUDIENCE`
- `COGNITO_JWKS_URL`

Terraform rollout inputs:
- `auth_mode` (`local|hybrid|cognito`)
- `cognito_issuer_url` (optional override)
- `cognito_jwks_url` (optional override)
- `cognito_audience` (optional override)
- `cognito_mfa_configuration` (`OFF|OPTIONAL|ON`)

Example:

```bash
export TF_VAR_enable_cognito=true
export TF_VAR_auth_mode=hybrid
export TF_VAR_cognito_mfa_configuration=OPTIONAL
terraform -chdir=platform/terraform plan
terraform -chdir=platform/terraform apply
```

Phased rollout:
1. `local` baseline everywhere
2. non-prod to `hybrid` and validate both token paths
3. frontend Cognito cutover in `hybrid`
4. move to `cognito` after validation and rollback readiness

Rollback:
1. set `auth_mode=local`
2. redeploy ECS services
3. rerun smoke tests for login + protected APIs

## Operational Safety Notes

- Production-like environments keep stronger Cognito MFA posture:
  - `integration`: `cognito_mfa_configuration="OPTIONAL"`
  - `prod`: `cognito_mfa_configuration="ON"`
- CloudWatch alarms in production-like environments are wired to SNS actions.
- Set `alarm_notification_email` or `alarm_notification_topic_arn` before apply.