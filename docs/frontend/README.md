# CRM Frontend (crm-ui)

React + TypeScript + TailwindCSS frontend for the CRM system with role-based access control.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: TailwindCSS 4 (dark theme)
- **Routing**: React Router DOM 7
- **Testing**: Vitest + React Testing Library + Playwright
- **Linting**: ESLint + Prettier

## Project Structure

```
services/frontend/crm-ui/
├── src/
│   ├── api/              # API client layer (typed)
│   │   ├── client.ts     # Base HTTP client with timeout, auth, error handling
│   │   ├── types.ts      # Shared TypeScript types
│   │   ├── auth.ts       # Auth endpoints
│   │   ├── users.ts      # User management endpoints
│   │   ├── clients.ts    # Client management endpoints
│   │   ├── transactions.ts # Transaction endpoints
│   │   └── logs.ts       # Audit log endpoints
│   ├── features/
│   │   └── auth/
│   │       └── AuthContext.tsx  # Auth state + hooks
│   ├── app/
│   │   ├── App.tsx       # Router + AuthProvider wrapper
│   │   └── ProtectedRoute.tsx  # Route guards (role-based)
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── AdminManageAccounts.tsx
│   │   ├── AgentDashboard.tsx
│   │   ├── AgentCreateClient.tsx
│   │   └── AgentViewTransactions.tsx
│   ├── test/
│   │   └── setup.ts      # Vitest setup
│   └── main.tsx
├── e2e/                  # Playwright E2E tests
│   ├── admin.spec.ts
│   └── agent.spec.ts
├── Dockerfile            # Multi-stage build
├── nginx.conf            # SPA routing config
├── playwright.config.ts
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Install Dependencies

```bash
cd services/frontend/crm-ui
npm install
```

### Run Dev Server

```bash
npm run dev
```

App runs at http://localhost:5173

### Build for Production

```bash
npm run build
```

Output in `dist/`

### Preview Production Build

```bash
npm run preview
```

## Testing

### Unit Tests

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run with coverage:
```bash
npm run test:coverage
```

Coverage report in `coverage/`

**Coverage Thresholds (enforced):**
- Lines: 80%
- Branches: 70%
- Functions: 75%
- Statements: 80%

### E2E Tests (Playwright)

Install browsers:
```bash
npx playwright install
```

Run E2E tests:
```bash
npm run e2e
```

Run with UI:
```bash
npm run e2e:ui
```

View report:
```bash
npm run e2e:report
```

**Performance Requirements:**
- Admin dashboard load: <= 5s
- Agent dashboard load: <= 5s
- Page navigation: <= 5s

## Linting & Formatting

Run ESLint:
```bash
npm run lint
```

Auto-fix:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

Check formatting:
```bash
npm run format:check
```

## Docker

### Build Image

```bash
cd services/frontend/crm-ui
docker build -t crm-frontend:latest .
```

### Run Container

```bash
docker run -p 8080:80 crm-frontend:latest
```

App runs at http://localhost:8080

### Health Check

```bash
curl http://localhost:8080/health
```

## Kubernetes Deployment

### Manifests

Located in `platform/k8s/apps/base/`:
- `frontend-deployment.yaml` - 2 replicas, resource limits, health probes
- `frontend-service.yaml` - ClusterIP on port 80
- `frontend-configmap.yaml` - Environment config
- `ingress.yaml` - Routes `/` to frontend, `/api/*` to backend services

### Deploy

```bash
cd platform/k8s/apps/base
kubectl apply -k .
```

### Verify

```bash
kubectl get pods -n crm -l app=frontend
kubectl get svc -n crm frontend-service
kubectl describe ingress backend-ingress -n crm
```

### Access

Via ingress: http://localhost/ (or configured domain)

## API Client

All API calls use the typed client in `src/api/`:

- **Timeout**: 5s max (configurable)
- **Auth**: Automatic Bearer token injection (from localStorage)
- **Error Handling**: Custom `ApiError` with status, message, requestId
- **401 Handling**: Auto-logout on unauthorized

### Usage Example

```typescript
import { listClients } from '@/api/clients'

const response = await listClients({ limit: 10, offset: 0 })
// response.data: Client[]
// response.pagination: { limit, offset, total }
```

## Authentication Flow

1. User submits login credentials
2. API returns access token + refresh token
3. Tokens stored in localStorage
4. User data fetched and stored in AuthContext
5. AuthProvider wraps app, provides `useAuth()` hook
6. ProtectedRoute checks auth + role before rendering

## Role-Based Access

- **Admin Routes**: `/admin`, `/admin/accounts` (role: `admin`)
- **Agent Routes**: `/agent`, `/agent/clients/new`, `/agent/transactions` (role: `agent`)
- Unauthenticated users redirected to `/login`
- Wrong role shows 403 Access Denied

## Form Validation

All forms validate:
- Required fields
- Email format
- Phone format (min 8 digits)
- Date of birth (18-100 years)
- Real-time error clearing on field change

## UI Design

- **Theme**: Dark mode only
- **Layout**: Boxed card layouts
- **Colors**: Defined in `tailwind.config.js`
  - Background: slate-900, slate-800
  - Primary: blue-500
  - Success: green-500
  - Danger: red-500
  - Warning: amber-500
- **Loading States**: Spinner + "Loading..." text
- **Error States**: Red banner with clear message

## Environment Variables

None required (API accessed via same-origin ingress).

For local dev with backend on different port, configure Vite proxy in `vite.config.ts`.

## Troubleshooting

### Build Fails

Check Node.js version:
```bash
node --version  # Should be 20+
```

Clear cache:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Tests Fail

Ensure test setup runs:
```bash
npm test -- --reporter=verbose
```

### E2E Fails

Check dev server is running:
```bash
npm run dev
```

Playwright config expects `http://localhost:5173`.

### Docker Build Slow

Use Docker BuildKit:
```bash
DOCKER_BUILDKIT=1 docker build -t crm-frontend:latest .
```

### K8s Pods Not Ready

Check logs:
```bash
kubectl logs -n crm -l app=frontend
```

Check ingress:
```bash
kubectl describe ingress backend-ingress -n crm
```

## Contributing

Follow coding standards in `/docs/coding-standards/coding-standards.md`:
- Use functional components + hooks
- No `any` types (use `unknown` + narrowing)
- Tests required for new features
- Coverage thresholds enforced
- ESLint + Prettier must pass

## References

- [React Docs](https://react.dev)
- [Vite Docs](https://vitejs.dev)
- [TailwindCSS Docs](https://tailwindcss.com)
- [Vitest Docs](https://vitest.dev)
- [Playwright Docs](https://playwright.dev)
- [OpenAPI Specs](../../docs/api-contracts/openapi/)
