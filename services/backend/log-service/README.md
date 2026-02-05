# Log Service

## Local test pipeline (service root)

Windows:
```powershell
python run-local-test-pipeline.py
```

macOS/Linux:
```bash
python3 run-local-test-pipeline.py
```

Alternative wrappers:
- `run-local-test-pipeline.cmd`
- `run-local-test-pipeline.sh`

This one-liner runs:
1. Lint (`black --check`, `flake8`)
2. Build check (`python -m compileall`)
3. Tests (`pytest`)
4. Coverage report generation (`pytest-cov`)

Reports:
- `build/reports/tests/junit.xml`
- `build/reports/coverage/coverage.xml`
- `build/reports/coverage/html/index.html`
