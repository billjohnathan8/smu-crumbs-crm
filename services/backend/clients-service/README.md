# Clients Service

## OpenAPI contract
- `../../../docs/api-contracts/openapi/client.yaml`

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
