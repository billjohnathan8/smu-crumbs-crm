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

Notes:
- PowerShell does not run scripts from the current directory unless you prefix with `.\` (e.g. `.\run-local-test-pipeline.cmd`).
- `run-local-test-pipeline.sh` requires a Bash environment (WSL / Git Bash); it won’t run in plain Windows PowerShell.

This one-liner runs:
1. Lint (`black --check`, `flake8`)
2. Build check (`python -m compileall`)
3. Tests (`pytest`)
4. Coverage report generation (`pytest-cov`, with branch coverage enabled)

Reports:
- `build/reports/tests/junit.xml`
- `build/reports/coverage/coverage.xml`
- `build/reports/coverage/html/index.html`
