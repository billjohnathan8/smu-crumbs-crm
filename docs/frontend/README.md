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
npm run test:e2e:latency
```

## App Structure (High Level)

- `src/app` - app wiring and route guards
- `src/features` - feature-specific state/logic
- `src/pages` - route pages (admin/user/login flows)
- `src/api` - API client layer

## API Routing

The app calls relative `/api/*` paths.

- Local Vite dev: `/api/*` is proxied by Vite.
- Integration stack: `/api/*` is routed by `integration-gateway`.

## Test Credentials

Integration defaults:
- Admin: `admin@crm.com` / `Scrooge@Bank2026!`
- User: `agent1@crm.com` / `UserPass123!`

Frontend latency tests (E2E with mocked backend) may use different fixture credentials (`admin@example.com`, `user@example.com`).