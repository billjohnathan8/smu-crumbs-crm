# Safe Cognito Rollout (No Big-Bang Breakage)

This runbook documents how to migrate auth safely from local HS256 tokens to Cognito RS256 tokens in phased steps.

## Scope

- Backend services: `agent`, `client`, `transaction`
- Terraform ECS wiring for auth mode and Cognito settings
- CI/local safety defaults

This rollout does not require a one-shot cutover.

## Current Architecture (Post-Change)

- Backend supports three runtime auth modes via `AUTH_MODE`:
  - `local`: only existing HS256 local tokens
  - `hybrid`: accept both local HS256 and Cognito RS256 tokens
  - `cognito`: only Cognito RS256 tokens
- Backend Cognito verification uses:
  - `COGNITO_ISSUER`
  - `COGNITO_AUDIENCE` (app client ID)
  - `COGNITO_JWKS_URL`
- Terraform now wires these settings into ECS task env vars.
- Integration compose is pinned to `AUTH_MODE=local` to keep existing CI/local E2E stable.
- Frontend supports dual-mode login via `VITE_AUTH_MODE`:
  - `local`: only local email/password login form
  - `hybrid`: both local form and Cognito SSO button visible
  - `cognito`: both visible (Cognito SSO is the primary flow)
- Frontend Cognito configuration uses:
  - `VITE_COGNITO_DOMAIN`: Cognito Hosted UI domain
  - `VITE_COGNITO_CLIENT_ID`: Cognito App Client ID
  - `VITE_COGNITO_REDIRECT_URI`: OAuth2 callback URL (defaults to `{origin}/auth/callback`)

## Prerequisites

1. Cognito User Pool and App Client exist (Terraform `enable_cognito=true`).
2. Cognito groups are configured consistently (`ADMIN`, `AGENT`).
3. Backend services are deployed with the dual-mode code.
4. Frontend migration plan is ready (Hosted UI or Cognito SDK) before final cutover.

## Terraform Inputs For Rollout

Use these root variables in `platform/terraform/variables.tf`:

- `auth_mode` (`local|hybrid|cognito`, default `local`)
- `cognito_issuer_url` (optional override)
- `cognito_jwks_url` (optional override)
- `cognito_audience` (optional override)

If override values are empty, Terraform derives Cognito values from module outputs when `enable_cognito=true`.

Example:

```bash
export TF_VAR_enable_cognito=true
export TF_VAR_auth_mode=hybrid
terraform -chdir=platform/terraform plan
terraform -chdir=platform/terraform apply
```

## Phased Rollout Plan

### Phase 0: Baseline Safety

1. Keep `auth_mode=local` in all environments.
2. Confirm local login (`/api/auth/login`) still works.
3. Confirm CI still passes in local mode.

### Phase 1: Backend Dual Acceptance

1. Set non-prod environment to `auth_mode=hybrid`.
2. Deploy backend services.
3. Validate both token types:
   - Existing local login token still works.
   - Cognito token also works on protected routes.

### Phase 2: Frontend Cutover ✅ Implemented

1. ~~Switch frontend login flow to Cognito (Hosted UI or SDK).~~ **Done** — `LoginPage.tsx` now shows "Sign in with Cognito SSO" when `VITE_AUTH_MODE` is `hybrid` or `cognito`.
2. `CognitoCallback.tsx` handles the `/auth/callback` route, exchanges authorization code for tokens, and stores the Cognito access token.
3. `AuthContext.tsx` exposes `loginWithCognitoCode()` for the callback flow.
4. Keep backend in `hybrid` during burn-in period.
5. Run smoke and E2E tests with Cognito users in non-prod.

### Phase 3: Final Cutover

1. Set `auth_mode=cognito` in non-prod, then prod.
2. Remove dependence on local `/api/auth/login` for user sign-in.
3. Keep rollback path documented and tested (below).

## Rollback Plan

If Cognito path fails in runtime:

1. Set `auth_mode=local`.
2. Re-deploy ECS services.
3. Re-run smoke tests for local login + protected APIs.

If partial outage only affects frontend Cognito login:

1. Keep backend in `hybrid`.
2. Revert frontend to previous local-login build.

## CI/CD Strategy

Use two lanes:

1. Fast lane (`local`):
   - default PR checks
   - no AWS dependency for auth
2. Real-auth lane (`hybrid`/`cognito` in AWS non-prod):
   - runs on schedule or protected branches
   - validates Cognito token path

Keep `scripts/ci/fullstack-integration.compose.yml` in `AUTH_MODE=local` unless intentionally testing Cognito in an AWS-backed pipeline.

## Validation Checklist

Before moving to `cognito` mode, confirm all are true:

1. `hybrid` works with both token types in non-prod.
2. Role mapping is correct (`ADMIN` -> `admin`, `AGENT` -> `agent`).
3. Frontend refresh/session behavior works with Cognito.
4. E2E tests cover protected routes with Cognito users.
5. Rollback to `local` is tested and documented.

## Notes

- Do not store admin credentials in Git.
- Keep using Secrets Manager / GitHub secrets for runtime secrets.
- Keep local/dev auth mode unless intentionally testing Cognito path.
