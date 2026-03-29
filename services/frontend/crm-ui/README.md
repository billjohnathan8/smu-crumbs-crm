# Scrooge Bank CRM UI

React 19 + TypeScript + Vite frontend for the Scrooge Bank CRM system. Provides the browser interface for client management, transaction review, AML alert handling, and user administration.

## Running the Local Testing Pipeline

Before opening a PR, run the local frontend pipeline to validate code quality, type safety, and test coverage.

### Quick Start

From the **repository root** directory, run:

```bash
# Windows (CMD or PowerShell)
.\scripts\build-and-test-frontend.cmd

# macOS/Linux (Bash)
bash ./scripts/build-and-test-frontend/build-and-test-frontend.sh
```

### What the Pipeline Does

The pipeline runs these stages in sequence:

1. **Install dependencies** - `npm install`
2. **Type checking** - `npm run typecheck` (TypeScript strict mode)
3. **Lint** - `npm run lint` (ESLint)
4. **Format check** - `npm run format:check` (Prettier)
5. **Build** - `npm run build` (TypeScript compilation + Vite bundling)
6. **Run tests with coverage** - `npm run test:coverage` (Vitest)

### Pipeline Outputs

- **Log files**: `build-logs/build-and-test-frontend/*.log` (last 3 runs kept)
- **Coverage reports**: `services/frontend/crm-ui/coverage/index.html` (open in browser)
- **Build artifacts**: `services/frontend/crm-ui/dist/`

### Coverage Thresholds

The pipeline enforces minimum coverage requirements:

- Lines: 55%
- Branches: 56%
- Functions: 33%
- Statements: 54%

### Quick Fixes

If the pipeline fails:

- **Type errors**: Fix TypeScript annotations in your code
- **Lint errors**: Run `npm run lint:fix` to auto-fix, then fix remaining issues manually
- **Format errors**: Run `npm run format` to auto-format all files
- **Test failures**: Check error messages, update or fix tests as needed
- **Coverage below threshold**: Add unit tests for new code

### Development Commands

From `services/frontend/crm-ui/`:

- `npm run dev` - Start dev server with hot reload
- `npm run format` - Auto-format all files with Prettier
- `npm run format:check` - Check formatting without modifying files
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run test:watch` - Run tests in watch mode
- `npm run test -- <pattern>` - Run specific tests
- `npm run e2e` - Run E2E tests with Playwright (manual only)

### API Routing Configuration

Frontend code keeps relative API paths (`/api/...`), and routing is environment-driven:

- Local Vite dev: `/api/*` proxies to `VITE_API_PROXY_TARGET` (default `http://localhost:8080`) when `VITE_API_PROXY_ENABLED` is not `false`.
- Container runtime: nginx proxies `/api/*` only when `FRONTEND_API_UPSTREAM` is set. Default is empty, so external gateway/ingress owns `/api/*`.

### Prerequisites

- Node.js 18+
- npm 9+
- At least 2GB free disk space

For detailed pipeline documentation, see [docs/testing/frontend-local-pipeline.md](../../../docs/testing/frontend-local-pipeline.md).

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
