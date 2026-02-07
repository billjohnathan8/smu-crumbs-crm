# Frontend Local Testing Pipeline (Developer Guide)

This document explains the local frontend testing pipeline design, what each stage does, and where outputs are written.

## Developer Tools Recommendation

**For manual development:** Install [React DevTools](https://react.dev/learn/react-developer-tools) browser extension (Chrome/Firefox/Edge) for a significantly better development experience:
- Interactive component tree inspection with props and state
- Hooks debugging and performance profiling  
- Real-time component updates and re-render tracking
- Context value inspection

Note: Automated E2E tests (Playwright) run against production builds and don't require React DevTools.

## Purpose

Before opening a PR, developers should run the local frontend pipeline to validate code quality, type safety, and test coverage for the React/TypeScript frontend application.

## Entry Points (repo root)

- PowerShell: `.\scripts\build-and-test-frontend\build-and-test-frontend.ps1`
- CMD: `.\scripts\build-and-test-frontend.cmd`
- Bash: `bash ./scripts/build-and-test-frontend/build-and-test-frontend.sh`

These scripts run the complete frontend testing pipeline for `services/frontend/crm-ui` and produce consolidated artifacts in `build-logs/build-and-test-frontend`.

## Pipeline Design

The local pipeline enforces this sequence:

1. **Install dependencies** (`npm install`)
2. **Type checking** (`npm run typecheck`)
3. **Lint** (`npm run lint`)
4. **Format check** (`npm run format:check`)
5. **Build** (`npm run build`)
6. **Run unit tests with coverage** (`npm run test:coverage`)
7. **Run end-to-end tests** (`npm run e2e`)
8. **Generate aggregated report index** (Python script)
9. **Write full run output to `build-logs/build-and-test-frontend`**

## Technology Stack

### Frontend Framework
- **React 19.0.0** with TypeScript 5.9.3
- **Vite 7.2.4** for build tooling and dev server
- **TailwindCSS 4.1.1** for styling

### Testing Tools
- **Vitest 4.0.18** for unit testing
- **Testing Library** (@testing-library/react 16.3.2) for component testing
- **Playwright 1.58.1** for E2E testing (not run by default in this pipeline)
- **jsdom** for DOM simulation in tests

### Code Quality
- **ESLint 9.39.1** for linting
- **Prettier 3.8.1** for code formatting
- **TypeScript strict mode** for type safety

## Pipeline Stages Explained

### 1. Install dependencies (`npm install`)
- Installs all npm packages defined in `package.json`
- Updates `package-lock.json` if needed
- Ensures all dependencies are available for subsequent steps

### 2. Type checking (`npm run typecheck`)
- Command: `tsc -b --noEmit`
- Runs TypeScript compiler in type-checking mode
- Does not emit any output files (--noEmit)
- Catches type errors across the entire codebase
- Uses strict TypeScript configuration

### 3. Lint (`npm run lint`)
- Command: `eslint .`
- Checks code for:
  - React best practices
  - React Hooks rules
  - Code style consistency
  - Potential bugs and anti-patterns
- Configuration: `eslint.config.js`

### 4. Format check (`npm run format:check`)
- Command: `prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"`
- Verifies code formatting without modifying files
- Ensures consistent code style across the project
- Configuration: `.prettierrc`

### 5. Build (`npm run build`)
- Command: `tsc -b && vite build`
- Compiles TypeScript to JavaScript
- Bundles application for production
- Outputs to `dist/` directory
- Performs tree-shaking and code optimization
- Validates that the application can be built successfully

### 6. Run unit tests with coverage (`npm run test:coverage`)
- Command: `vitest run --coverage`
- Runs all unit tests (files ending in `.test.ts` or `.test.tsx`)
- Generates code coverage reports
- Uses v8 coverage provider
- Enforces coverage thresholds:
  - Lines: 55%
  - Branches: 56%
  - Functions: 33%
  - Statements: 54%

### 7. Run end-to-end tests (`npm run e2e`)
- Command: `playwright test`
- Runs all E2E tests in `e2e/` directory
- Tests user flows across the entire application
- Uses Playwright to automate browser interactions
- Automatically starts Vite dev server on port 5173
- Runs tests in headless Chromium
- Generates HTML test report
- Takes screenshots on failures
- Configuration: `playwright.config.ts`

### 8. Generate aggregated report index
- Python script: `scripts/build-and-test-frontend/generate-frontend-index.py`
- Creates a single HTML page linking to all test reports
- Output: `build-logs/build-and-test-frontend/index.html`
- Provides unified access to both unit test coverage and E2E test reports

## Test Reports and Artifacts

### Aggregated Report Index

**Primary entry point:** `build-logs/build-and-test-frontend/index.html`

This aggregated index provides a centralized dashboard with links to all test reports:
- Unit test coverage (Vitest)
- E2E test results (Playwright)

Open this file in your browser to access all reports from one location.

### Log Files

After each pipeline run:
- Full terminal log is written to `build-logs/build-and-test-frontend/*.log`
- Log filenames use inverse timestamp prefix (newer runs sort first)
- Example: `inv79731025-082514__2026-02-06_15-34-45__build-and-test-frontend.log`
- Scripts keep only the newest three log files

### Unit Test Coverage Reports

Coverage reports are generated at: `services/frontend/crm-ui/coverage/`

**Available formats:**
- **HTML report**: `coverage/index.html` (interactive, drill-down view)
- **LCOV report**: `coverage/lcov.info` (machine-readable)
- **Text summary**: Displayed in terminal output

**How to open the coverage report:**
1. Navigate to `services/frontend/crm-ui/coverage/index.html`
2. Open in a normal browser window (`file:///...`)
3. Browse through files and see line-by-line coverage
4. Red lines = not covered, green lines = covered

### E2E Test Reports

Playwright test reports are generated at: `services/frontend/crm-ui/playwright-report/`

**Available formats:**
- **HTML report**: `playwright-report/index.html` (interactive test results)
- **Screenshots**: Captured on test failures
- **Traces**: Available for retry attempts

**How to view the E2E report:**
1. Navigate to `services/frontend/crm-ui/playwright-report/index.html`
2. Open in a browser to see test results
3. Or run `npm run e2e:report` from `services/frontend/crm-ui/` to open automatically
4. View test status, timing, and any failure screenshots

### Build Artifacts

Build output is generated at: `services/frontend/crm-ui/dist/`
- Optimized JavaScript bundles
- Minified CSS
- Static assets (images, fonts, etc.)
- `index.html` entry point

## Test Structure

### Unit Tests Location
Tests are co-located with source files in `__tests__` directories:
- `src/app/__tests__/` - App-level tests (routing, protected routes)
- `src/features/auth/__tests__/` - Authentication context tests
- `src/pages/__tests__/` - Page component tests

### Test Naming Convention
- Test files: `ComponentName.test.tsx` or `moduleName.test.ts`
- Test suites: `describe('ComponentName', ...)`
- Test cases: `it('should do something', ...)` or `test('should do something', ...)`

### Test Utilities
- Test setup: `src/test/setup.ts`
- Mocks: `src/mocks/` directory
- Testing helpers: Testing Library utilities (`render`, `screen`, `userEvent`, etc.)

## E2E Tests (Included in Pipeline)

E2E tests are now part of the standard local pipeline:
- Location: `e2e/` directory
- Framework: Playwright 1.58.1
- Run automatically after unit tests pass
- To run manually: `npm run e2e` (from `services/frontend/crm-ui`)
- To run with UI: `npm run e2e:ui` (for interactive debugging)

E2E tests validate:
- Complete user workflows (login, navigation, form submission)
- Integration between frontend and backend APIs
- Critical paths for admin and agent roles
- Page load performance
- Form validation
- Navigation flows

## Recommended Developer Workflow

1. Make code changes in `services/frontend/crm-ui/src/`
2. Run the pipeline from repo root:
   ```bash
   # Windows PowerShell
   .\scripts\build-and-test-frontend.cmd

   # macOS/Linux
   bash ./scripts/build-and-test-frontend/build-and-test-frontend.sh
   ```
3. Review pipeline output in terminal
4. Open aggregated report: `build-logs/build-and-test-frontend/index.html`
5. If tests fail:
   - Check error messages in terminal output
   - Open coverage report to see uncovered code
   - Open Playwright report to see E2E test failures
   - Review log file in `build-logs/build-and-test-frontend/`
6. Fix issues and re-run pipeline
6. Once all checks pass, commit and create PR

## Common Issues and Solutions

### Issue: npm install fails
**Cause:** Node.js or npm not installed, or wrong version
**Solution:**
- Install Node.js 18+ and npm 9+
- Verify: `node --version` and `npm --version`

### Issue: Type checking fails
**Cause:** TypeScript type errors in code
**Solution:**
- Read error messages carefully
- Fix type annotations in your code
- Use proper TypeScript types instead of `any`

### Issue: Linting fails
**Cause:** ESLint rule violations
**Solution:**
- Run `npm run lint:fix` to auto-fix some issues
- Review ESLint errors and fix manually
- Check `eslint.config.js` for rule configuration

### Issue: Format check fails
**Cause:** Code formatting doesn't match Prettier rules
**Solution:**
- Run `npm run format` to auto-format all files
- Configure your editor to format on save

### Issue: Build fails
**Cause:** Compilation errors or import issues
**Solution:**
- Check for syntax errors
- Verify all imports are correct
- Ensure all dependencies are installed

### Issue: Tests fail
**Cause:** Test logic errors or component changes
**Solution:**
- Read test failure messages
- Update tests if component behavior changed intentionally
- Fix bugs if tests are catching real issues
- Run individual tests: `npm test -- ComponentName.test.tsx`

### Issue: Coverage below threshold
**Cause:** Not enough tests for new code
**Solution:**
- Add unit tests for new components and functions
- Focus on testing business logic and user interactions
- Aim for meaningful coverage, not just numbers

## Performance Tips

- **Incremental builds**: Vite caches build artifacts for faster rebuilds
- **Parallel tests**: Vitest runs tests in parallel by default
- **Watch mode**: During development, use `npm run test:watch` for instant feedback
- **Selective testing**: Run specific tests with `npm test -- <pattern>`

## Prerequisites

Before running the pipeline, ensure you have:
- Node.js 18+ installed
- npm 9+ installed
- At least 2GB free disk space (for node_modules and build artifacts)
- Internet connection (for first-time dependency installation)

## Integration with CI/CD

These local pipeline scripts serve as the foundation for CI/CD workflows:
- GitHub Actions can use the same npm commands
- Coverage reports can be uploaded to coverage tracking services
- Build artifacts can be deployed to staging/production
- E2E tests can run in headless mode in CI

## Next Steps

After the local pipeline passes:
1. Review code changes one final time
2. Commit changes with a meaningful message
3. Push to your feature branch
4. Create a Pull Request
5. Wait for CI checks to pass
6. Request code review from team members
