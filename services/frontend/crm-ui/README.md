# CRM UI

## Overview
React 19 + TypeScript + Vite frontend for the Scrooge Bank CRM.

## Responsibilities / Scope
- Provide UI for user, client, transaction, AML, and admin workflows.
- Integrate with backend APIs through `/api/*` routes.
- Support unit/component tests and Playwright E2E/latency checks.

## Key Endpoints or Interfaces
- Browser interface served by Vite (dev) or nginx container (runtime).
- API interface: frontend uses relative `/api/*` paths.
- Local dev proxy: `/api/* -> VITE_API_PROXY_TARGET` (default `http://localhost:8080`).

## Dependencies
- Node.js 22+
- npm
- Frontend dependencies from `package.json`

## Local Run / Test

From this directory:

```bash
npm install
npm run dev
```

Quality/test commands:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:coverage
npm run test:e2e:latency
```

Repo-level wrappers:

```bash
python scripts/pipelines/test_frontend.py
python scripts/pipelines/test_all.py --skip-fullstack
```

## Notes
- Coverage output: `services/frontend/crm-ui/coverage/index.html`.
- Dist output: `services/frontend/crm-ui/dist/`.
- For end-to-end/full-stack contexts, use root stack scripts and [../../../docs/testing/TESTING-GUIDE.md](../../../docs/testing/TESTING-GUIDE.md).
