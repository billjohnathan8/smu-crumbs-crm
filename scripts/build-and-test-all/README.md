# Full Pipeline: Build and Test All Services

> **⚠️ DEPRECATED - Legacy Scripts**
>
> This directory contains legacy PowerShell/Bash scripts that have been superseded by
> unified cross-platform Python pipelines.
>
> **Use Instead:** `python scripts/pipelines/test_all.py`
>
> **Migration Guide:** [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)
>
> **Removal Date:** August 8, 2026
>
> ---
>
> **Historical Documentation Below** (for reference only)

This directory contains scripts to run a complete integration of both frontend and backend test pipelines, generating comprehensive coverage reports for all services.

## Overview

The full pipeline script:
1. **Runs backend pipeline** - Compiles, tests, and generates coverage for all backend services (Gradle Java and Python)
2. **Runs frontend pipeline** - Runs type checking, linting, builds, and tests the React/TypeScript frontend
3. **Generates aggregated coverage report** - Creates a unified HTML report combining all service coverage metrics

## Usage

### Windows (PowerShell)

```powershell
.\scripts\build-and-test-all.cmd
```

or

```powershell
.\scripts\build-and-test-all\build-and-test-all.ps1
```

### Linux/macOS (Bash)

```bash
./scripts/build-and-test-all/build-and-test-all.sh
```

## Prerequisites

### Backend Services
- **Java Services (Gradle)**: JDK 11 or higher
- **Python Services**: Python 3.8+
- All dependencies managed by Gradle wrapper or Python virtual environments

### Frontend Services
- **Node.js**: v16+ 
- **npm**: v8+

### Report Generation
- **Python 3.8+** required for aggregated coverage report generation

## Output

### Logs
Build logs are saved to `build-logs/build-and-test-all/` with timestamped filenames. The most recent 3 logs are retained.

### Coverage Reports

After successful execution, coverage reports are available at:

#### Aggregated Report (All Services)
- **Location**: `build-logs/build-and-test-all/index.html`
- **Contains**: Combined coverage from all backend and frontend services
- **Sections**: 
  - Overall test summary (total tests, pass/fail)
  - Aggregate line and branch coverage across all services
  - Per-service breakdowns with links to detailed reports

#### Backend Report (Backend Services Only)
- **Location**: `build-logs/build-and-test-backend/index.html`
- **Contains**: Coverage for all backend services (Gradle Java + Python)

#### Frontend Report (crm-ui)
- **Location**: `services/frontend/crm-ui/coverage/index.html`
- **Contains**: Detailed Vitest coverage for React/TypeScript frontend

### Per-Service Reports

Each service generates its own detailed reports:

**Gradle Services** (e.g., agent, client):
- JaCoCo HTML: `services/backend/<service>/build/reports/jacoco/test/html/index.html`
- Test results: `services/backend/<service>/build/reports/tests/test/index.html`
- Checkstyle: `services/backend/<service>/build/reports/checkstyle/main.html`

**Python Services** (e.g., log):
- Coverage HTML: `services/backend/<service>/build/reports/coverage/html/index.html`
- JUnit XML: `services/backend/<service>/build/reports/tests/junit.xml`

**Frontend (crm-ui)**:
- Coverage: `services/frontend/crm-ui/coverage/index.html`
- Coverage JSON: `services/frontend/crm-ui/coverage/coverage-summary.json`

## What Gets Tested

### Backend Services
- ✅ Code compilation
- ✅ Static analysis (Checkstyle for Java)
- ✅ Unit tests
- ✅ Integration tests
- ✅ Code coverage (JaCoCo for Java, coverage.py for Python)

### Frontend Service
- ✅ TypeScript type checking
- ✅ ESLint linting
- ✅ Code formatting (Prettier)
- ✅ Production build
- ✅ Unit/component/integration tests (Vitest)
- ✅ Code coverage (Vitest/Istanbul)

## Exit Codes

- `0`: All pipelines passed successfully
- `1`: One or more pipelines failed

## Continuous Integration

This script is designed to be run in CI/CD pipelines to ensure all services across the full stack are properly tested before deployment.

Example CI usage:
```bash
# Run full pipeline
./scripts/build-and-test-all/build-and-test-all.sh

# Check exit code
if [ $? -eq 0 ]; then
  echo "All tests passed, ready to deploy"
else
  echo "Tests failed, blocking deployment"
  exit 1
fi
```

## Troubleshooting

### Python not found
Ensure Python 3.8+ is installed and available in PATH. The script looks for `python`, `python3`, or `py` commands.

### Backend tests failing
Check individual service logs in `build-logs/build-and-test-backend/` for specific errors.

### Frontend tests failing
Check frontend logs in `build-logs/build-and-test-frontend/` and ensure Node.js and npm dependencies are installed.

### Coverage report not generated
Ensure Python is available and the corresponding pipeline (backend/frontend) completed successfully. Coverage reports are generated from the test artifacts, so tests must pass first.

## Files

- `build-and-test-all.ps1` - PowerShell implementation (Windows)
- `build-and-test-all.sh` - Bash implementation (Linux/macOS)
- `generate-aggregated-coverage-index.py` - Python script to aggregate coverage reports
- `README.md` - This file

## Dependencies

This script delegates to:
- `scripts/build-and-test-backend/build-and-test-backend.ps1` (or `.sh`)
- `scripts/build-and-test-frontend/build-and-test-frontend.ps1` (or `.sh`)

Ensure those scripts are in place and functional.
