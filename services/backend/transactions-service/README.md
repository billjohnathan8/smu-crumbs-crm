# Transactions Service

## Overview
- Provides transaction import and listing APIs used by the backend.
- Local mock SFTP data lives at `mock-sftp/transactions.csv`.

## Mock SFTP (local + k8s)
- Local k8s mounts the mock CSV from `../../../platform/k8s/apps/base/transactions-service-mock-sftp-configmap.yaml`.
- The service reads the mounted files from `/app/mock-sftp` via the `MOCK_SFTP_ROOT` environment variable.

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

