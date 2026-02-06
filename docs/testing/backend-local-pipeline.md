# Backend Local Testing Pipeline (Developer Guide)

This document explains the local backend testing pipeline design, what each stage does, and where outputs are written.

## Purpose

Before opening a PR, developers should run the local backend pipeline to validate service quality consistently across Java and Python backend services.

## Entry Points (repo root)

- PowerShell: `.\scripts\build-and-test\build-and-test-backend.ps1`
- CMD: `.\scripts\build-and-test-backend.cmd`
- Bash: `bash ./scripts/build-and-test-backend/build-and-test-backend.sh`

These scripts discover backend services under `services/backend`, run each service-local pipeline, and produce consolidated artifacts in `build-logs/build-and-test-backend`.

## Pipeline Design (per service)

The local pipeline enforces this sequence:

1. **Lint**
2. **Build**
3. **Run tests**
4. **Generate test and code coverage reports**
5. **Write full run output to `build-logs/build-and-test-backend`**
6. **Generate aggregated cross-service report (`build-logs/build-and-test-backend/index.html`)**

## Runtime-Specific Behavior

### Java services (`agent-service`, `client-service`, `transaction-service`)

Command used from service root:
- Windows: `.\gradlew.bat localTestPipeline`
- macOS/Linux: `./gradlew localTestPipeline`

`localTestPipeline` runs:
- Checkstyle lint (`checkstyleMain`, `checkstyleTest`)
- Build (`assemble`)
- Tests (`test`, JUnit + Mockito)
- Coverage (`jacocoTestReport`)

Reports:
- Checkstyle:
  - `build/reports/checkstyle/main.html`
  - `build/reports/checkstyle/test.html`
- Test report:
  - `build/reports/tests/test/index.html`
- Coverage:
  - HTML: `build/reports/jacoco/test/html/index.html`
  - XML: `build/reports/jacoco/test/jacocoTestReport.xml`

### Python service (`log-service`)

Command used from service root:
- Windows: `python run-local-test-pipeline.py`
- macOS/Linux: `python3 run-local-test-pipeline.py`

Pipeline stages:
- `black --check app tests`
- `flake8 app tests`
- `python -m compileall -q app tests` (build/syntax stage)
- `pytest` with `pytest-cov`

Reports:
- Test report:
  - `build/reports/tests/junit.xml`
- Coverage:
  - HTML: `build/reports/coverage/html/index.html`
  - XML: `build/reports/coverage/coverage.xml`

## `build-logs` Output Design

After each root pipeline run:

- A full terminal log file is written to `build-logs/build-and-test-backend/*.log`
- A cross-service aggregated report is written to `build-logs/build-and-test-backend/index.html`

### Log ordering rule (newest at top in alphabetical sort)

Log filenames use an inverse timestamp prefix:

- Example: `inv79731025-082514__2026-02-06_15-34-45__build-and-test-backend.log`

This naming intentionally makes **newer runs sort first** and older runs sort later when VS Code sorts alphabetically.
The scripts keep only the newest three log files in `build-logs/build-and-test-backend`.

## Aggregated Report (`build-logs/build-and-test-backend/index.html`)

`build-logs/build-and-test-backend/index.html` is generated programmatically by:

- `scripts/build-and-test-backend/generate-coverage-index.py`

It is invoked automatically by both:
- `scripts/build-and-test-backend/build-and-test-backend.ps1`
- `scripts/build-and-test-backend/build-and-test-backend.sh`

The report includes:
- Per-service test summary (pass/fail/skip)
- Per-service line and branch coverage (with progress bars)
- Links to each service's detailed reports (JaCoCo, Checkstyle, pytest/coverage)
- Overall totals across services

### How to open the aggregated report

- Open `build-logs/build-and-test-backend/index.html` directly in a normal browser window (`file:///...`).
- Do **not** use VS Code **Open Preview** for this file.
- From the browser page, click the report-path links (`coverage`, `tests`, `checkstyleMain`, `checkstyleTest`) to open service reports.

## Recommended Developer Workflow

1. Run root backend pipeline script.
2. Open `build-logs/build-and-test-backend/index.html` in a normal browser window (`file:///...`), not VS Code Open Preview.
3. Open service-level detailed reports from links in that page.
4. Add/fix tests and code until lint, tests, and coverage are satisfactory.
5. Re-run pipeline before PR submission.

