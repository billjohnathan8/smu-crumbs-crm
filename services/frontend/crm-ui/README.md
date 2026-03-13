# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

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

## Vite Plugins

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
