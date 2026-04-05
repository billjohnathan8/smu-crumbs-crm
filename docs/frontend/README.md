# Frontend Guide (`crm-ui`)

Path: `services/frontend/crm-ui`

## Stack

- React + TypeScript + Vite
- TailwindCSS
- Vitest + React Testing Library
- Playwright

## Local Development

```bash
cd services/frontend/crm-ui
npm ci
npm run dev
```

Default URL: `http://localhost:5173`

## Core Commands

```bash
npm run build
npm run preview
npm run lint
npm run lint:fix
npm run format              # Auto-format all files with Prettier
npm run format:check        # Check formatting without modifying files
npm run typecheck
npm run test:run
npm run test:coverage
npm run e2e
npm run test:e2e:latency
```

## App Structure (High Level)

- `src/app` - app wiring, role guards, route registration
- `src/features` - shared auth/theme logic
- `src/pages` - route pages
- `src/api` - shared API client and feature API modules

## Route and Role Matrix

Role naming in code:
- `user` = agent
- `admin` = standard admin
- `super_admin` + root-admin marker = root admin

Public routes:

| Route | Access | Notes |
| --- | --- | --- |
| `/login` | Public | Sign in page |
| `/verify-client` | Public | KYC verification upload |
| `/auth/callback` | Public | Cognito OAuth callback |
| `/forgot-password` | Public | Password recovery request |
| `/reset-password` | Public | Password reset via token |
| `/unauthorized` | Public | Deterministic access-denied page |

Protected routes (core evaluator paths first):

| Route | Access | Feature |
| --- | --- | --- |
| `/admin/users` | Admin + Root Admin | F2 |
| `/admin/users/new` | Admin + Root Admin | F2 |
| `/admin/logs` | Admin + Root Admin | F4 |
| `/admin/settings` | Admin + Root Admin | F1 support |
| `/admin/clients` | Root Admin only | F3 |
| `/admin/client-archives` | Root Admin only | F3 |
| `/admin/clients/new` | Root Admin only | F3 |
| `/admin/clients/:clientId` | Root Admin only | F3 |
| `/admin/clients/:clientId/edit` | Root Admin only | F3 |
| `/admin/clients/:clientId/accounts` | Root Admin only | F3 |
| `/user` | Agent only | F3/F4 overview |
| `/user/clients` | Agent only | F3 |
| `/user/clients/new` | Agent only | F3 |
| `/user/clients/:clientId` | Agent only | F3 |
| `/user/clients/:clientId/edit` | Agent only | F3 |
| `/user/clients/:clientId/accounts` | Agent only | F3 |
| `/user/transactions` | Agent only | F4 |
| `/user/logs` | Agent only | F4 |
| `/user/settings` | Agent only | F1 support |

Optional / X-factor routes:

| Route | Access | Category |
| --- | --- | --- |
| `/admin/communications` | Root Admin only | X-factor |
| `/admin/transactions` | Root Admin only | X-factor |
| `/admin/aml-alerts` | Root Admin only | X-factor |
| `/admin/users/archives/admins` | Root Admin only | X-factor |
| `/admin/users/archives/agents` | Root Admin only | X-factor |
| `/user/aml-alerts` | Agent only | X-factor |

Alias transition routes (explicit transition UX, not silent redirect):

| Alias | Destination |
| --- | --- |
| `/admin/accounts` | `/admin/users` |
| `/admin/users/archives` | `/admin/users` |

## F1-F4 Evaluator Walkthrough

1. F1 (Auth): `/login` -> `/forgot-password` and `/reset-password` are publicly reachable.
2. F2 (User Management): sign in as admin/root admin -> `/admin/users` and `/admin/users/new`.
3. F3 (Client Management): sign in as root admin -> `/admin/clients`, then detail/edit/accounts routes.
4. F4 (Transactions/Logs):
	- admin/root admin -> `/admin/logs`
	- agent -> `/user/transactions` and `/user/logs`

## Session and API Consistency

- Shared API client handles auth token propagation and centralized session-expiry handling for 401 responses.
- Auth context registers the session-expiry callback and clears user session consistently.
- Root-admin gating prefers backend `isRootAdmin` from `/api/users/me` over frontend identity heuristics.
- Forgot/reset password flows use shared auth API module methods (no direct page-level `fetch` calls).

## API Routing

The app calls relative `/api/*` paths.

- Local Vite dev: `/api/*` is proxied by Vite.
- Integration stack: `/api/*` is routed by `integration-gateway`.

## Test Credentials

Integration defaults (set `E2E_ADMIN_PASSWORD` and `E2E_USER_PASSWORD` if fixed values are needed; otherwise see `scripts/dev/stack-up.sh`):
- Admin: `admin@crm.com`
- User: `agent1@crm.com`

Frontend latency tests (E2E with mocked backend) may use fixture credentials (`admin@example.com`, `user@example.com`).