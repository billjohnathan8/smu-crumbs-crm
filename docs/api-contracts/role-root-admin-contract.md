# Role and Root-Admin Contract

This note defines the contract aligned across backend behavior, OpenAPI, frontend authorization, and tests.

## Roles

- `admin`: administrator role for privileged CRM operations.
- `user`: non-admin CRM role (requirement wording equivalent: "agent").
- `super_admin`: legacy role alias retained for compatibility in some JWT/test paths.

## Root Admin Identity

- Canonical root-admin identity is `usr_1` (database id `1`).
- Runtime bootstrap is the source of truth for root-admin creation (`PersistentUserStore.seedRootAdminIfMissing`).
- Legacy SQL bootstrap row (`user_id = 0`, `superAdmin@crm.com`, `super_admin`) is removed by migration `V2__remove_legacy_super_admin_seed.sql`.

## Root Admin Claim (Frontend Contract)

- `GET /api/users/me` returns an explicit boolean field: `isRootAdmin`.
- Frontend authorization must treat `isRootAdmin` as the primary source of truth for root-admin gating.
- Frontend fallback derivation (if needed during mixed-version rollout) is compatibility-only and must not rely on email matching.

## Root Admin Protection Rules

- Root admin (`usr_1`) cannot be updated, disabled, deleted, or admin-reset via `/api/users/{userId}/reset-password`.
- Root admin can perform privileged admin-on-admin operations that non-root admins cannot.
- Self reset on admin reset endpoint is forbidden; password recovery must use:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`

## User Listing Rules

- Root admin may list all users without a role filter.
- Non-root admins must use `role=user` when listing users.
- Non-admin users cannot perform admin listing operations.

## Verification Review Contract (Client Service)

- `POST /api/clients/{clientId}/upload-verify` is the public tokenized upload endpoint and sets status to `pending`.
- `PATCH /api/clients/{clientId}/verify/review` is admin-only and accepts:
  - `action=approve` -> status `verified`
  - `action=reject` -> status `rejected`
- Review is valid only from `pending`; other states return conflict semantics.
