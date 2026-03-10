# Log Service

## OpenAPI contract
- `../../../docs/api-contracts/openapi/log.yaml`

## Runtime modes

- Local HTTP server: FastAPI + Uvicorn (`app.main:app`)
- AWS Lambda: entrypoint module `lambda_function.py` with handler `lambda_function.lambda_handler`
- Includes AML alert endpoints at `/api/aml/alerts` for Feature 5 persistence/review.

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
- `run-local-test-pipeline.sh` requires a Bash environment (WSL / Git Bash); it won't run in plain Windows PowerShell.

This one-liner runs:
1. Lint (`black --check`, `flake8`)
2. Build check (`python -m compileall`)
3. Tests (`pytest`)
4. Coverage report generation (`pytest-cov`, with branch coverage enabled)

Lambda coverage is included via `tests/test_lambda_handler.py` and `--cov=lambda_function`.

Reports:
- `build/reports/tests/junit.xml`
- `build/reports/coverage/coverage.xml`
- `build/reports/coverage/html/index.html`

## Deploy as AWS Lambda

This service is Lambda-ready using Mangum and a root Lambda entrypoint module.

### Handler

- Lambda handler: `lambda_function.lambda_handler`

### Zip package

Install dependencies into package directory and zip:

```powershell
mkdir package
pip install -r requirements.txt -t package
Copy-Item lambda_function.py package\\
Copy-Item -Recurse app package\\app
cd package
Compress-Archive -Path * -DestinationPath ..\\log-lambda.zip -Force
```

Use Terraform `aws_lambda_function` with:

- `filename = "log-lambda.zip"`
- `handler = "lambda_function.lambda_handler"`
- `runtime = "python3.13"`
