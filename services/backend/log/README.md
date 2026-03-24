# Log Service

## OpenAPI contract
- `../../../docs/api-contracts/openapi/log.yaml`

## Runtime modes

- Canonical runtime: AWS Lambda via entrypoint module `lambda_function.py` and handler
  `lambda_function.lambda_handler`
- Request handling is implemented directly in Lambda (`app.lambda_router.LambdaRouter`)
  with explicit API Gateway event routing (HTTP API v2 + REST proxy shapes).
- Includes AML alert endpoints at `/api/aml/alerts` for Feature 5 persistence/review.

## Configuration safety

- Dev/local/test convenience defaults are available when `APP_ENV` (or `ENVIRONMENT`) is `dev`, `local`, or `test`.
- For `APP_ENV=prod`, the service requires explicit DB and JWT secrets via direct env vars or `*_SECRET_ARN` inputs.
- Use `services/backend/log/.env.example` as the baseline local/dev template.
- Cross-environment contract is documented in [Configuration Guide](../../../docs/configuration.md).

Local DB defaults used by the Lambda runtime:
- `DB_HOST=localhost` (or `postgres` in compose network)
- `DB_PORT=5432`
- `DB_NAME=crm`
- `DB_USER=crm_app`
- `DB_PASSWORD=devpassword`

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

This service is a direct API Gateway-proxy Lambda.

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

## Local/CI topology note

The repository's local/CI integration topology does not run this service as a dedicated
long-running HTTP container. Instead, tests provision and invoke this service through a
Lambda-compatible HTTP integration path in LocalStack (see
`scripts/ci/run-fullstack-integration-e2e.sh`).
