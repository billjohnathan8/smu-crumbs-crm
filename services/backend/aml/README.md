# AML Service

## Overview
Python Lambda batch engine for monthly AML detection. It analyzes transaction data and writes alert + audit records to CRM APIs.

## Responsibilities / Scope
- Run scheduled AML detection job (EventBridge-triggered in AWS).
- Detect suspicious behavior using:
  - statistical outliers
  - structuring patterns
  - velocity/profile anomalies
- Write alerts (`/api/aml/alerts`) and audit logs (`/api/logs`).

## Key Endpoints or Interfaces
- OpenAPI (alert target contract): [../../../docs/api-contracts/openapi/aml.yaml](../../../docs/api-contracts/openapi/aml.yaml)
- Lambda entrypoint: `lambda_function.lambda_handler`
- Upstream data interfaces:
  - transaction source (mock/local now, SFTP/S3-backed in deployment wiring)
  - account + historical transaction lookups
- Downstream write interfaces:
  - log-service AML alerts API
  - log-service audit logs API

## Dependencies
- Python 3.12+
- `requirements.txt` dependencies
- Optional external wiring via environment variables (`SFTP_*`, `CRM_*`, `JWT_*`)

## Local Run / Test

From this directory:

```bash
python -m venv .venv
python -m pip install -r requirements.txt
python lambda_function.py
python -m pytest tests/ -v
```

Run service-local pipeline wrapper:

```bash
python run-local-test-pipeline.py
```

## Notes
- Current repo-local behavior uses mocks by default; production wiring is environment-driven.
- Detection modules and thresholds are documented in code/tests and should stay aligned with CS301 requirements.
- For integration context, see [../../../docs/testing/TESTING-GUIDE.md](../../../docs/testing/TESTING-GUIDE.md).
