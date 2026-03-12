# Transaction Service

## Overview
- Provides transaction import and listing APIs used by the backend.
- Local mock SFTP data lives at `mock-sftp/transactions.csv`.

## Mock SFTP
- The service reads mock CSV files from `/app/mock-sftp` via the `MOCK_SFTP_ROOT` environment variable.
- Local mock SFTP data lives at `mock-sftp/transactions.csv`.

## Running Locally

Use the explicit dev profile for local convenience defaults:

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Security note:
- `application.yaml` no longer contains hardcoded fallback secrets/passwords for runtime safety.
- Dev-only fallback secrets now live in `application-dev.yaml`.
- Production must provide `JWT_HMAC_SECRET` via environment/secrets.

## OpenAPI contract
- `../../../docs/api-contracts/openapi/transaction.yaml`

## Local test pipeline (service root)

Windows:
```powershell
.\gradlew.bat localTestPipeline
```

macOS/Linux:
```bash
./gradlew localTestPipeline
```

This one-liner runs:
1. Checkstyle lint (`checkstyleMain`, `checkstyleTest`)
2. Build (`assemble`)
3. Tests (JUnit + Mockito via `test`)
4. Coverage report generation (`jacocoTestReport`)

Reports:
- `build/reports/checkstyle/main.html`
- `build/reports/checkstyle/test.html`
- `build/reports/tests/test/index.html`
- `build/reports/jacoco/test/html/index.html`


