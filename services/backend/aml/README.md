# AML Service — Scrooge Global Bank CRM

**Feature 5 (X-Factor)** — Anti-Money Laundering batch engine running as an AWS Lambda function.

---

## Overview

The AML service is a monthly batch pipeline that automatically scans transaction data for suspicious financial behavior and writes flagged alerts back into the CRM for human review. It is triggered once a month by an **AWS EventBridge** scheduled rule and requires no manual intervention under normal operation.

```
EventBridge (monthly)
        │
        ▼
  lambda_handler()
        │
        ├─ 1. Download CSV from SFTP server
        ├─ 2. Parse transactions
        ├─ 3. Run Module A — Statistical Outlier Detection
        ├─ 4. Run Module B — Structuring (Smurfing) Detection
        ├─ 5. Run Module C — Velocity & Profile Anomalies
        └─ 6. Write each alert + audit log entry to the CRM
```

---

## File Layout

```
aml/
├── lambda_function.py   # Self-contained Lambda — all logic, models, and mock clients
├── mock_data.py         # Raw mock data only (CSV string, account rows, history)
├── requirements.txt     # Python dependencies
├── AML.md               # Original requirements document
└── tests/
    ├── conftest.py          # Shared fixtures and helpers
    ├── test_module_a.py     # Statistical outlier detection tests
    ├── test_module_b.py     # Structuring / smurfing detection tests
    ├── test_module_c.py     # Velocity & profile anomaly tests
    └── test_lambda_handler.py  # End-to-end handler and integration tests
```

`lambda_function.py` is intentionally self-contained — AWS Lambda deployments package a single file. The only import outside the standard library is `mock_data.py`, which contains no logic and is swapped out automatically when real clients are wired in.

---

## Detection Modules

### Module A — Statistical Outlier Detection (3-sigma rule)

Flags any transaction whose amount deviates more than **3 standard deviations** from the client's normal behavior.

**Baseline strategy:**
1. If the client has **≥ 5 months** of historical transaction amounts, their personal mean and standard deviation are used.
2. If not, a **peer-group fallback** is used: the mean/std of all other clients' current-month transactions (the evaluated client is excluded to prevent self-contamination).

**Trigger:** `|amount − mean| > 3σ`

---

### Module B — Structuring (Smurfing) Detection

Detects attempts to deliberately stay below the **$10,000 regulatory reporting threshold** by splitting a large sum into several smaller deposits.

**Trigger:** Within any rolling **7-day window** for a single client:
- Each individual deposit is between **$3,000 and $9,999.99**
- The **cumulative total ≥ $10,000**

---

### Module C — Velocity & Profile Anomalies

Detects two high-risk behavioral patterns:

| Pattern | Trigger |
|---|---|
| **Pass-through (mule)** | Monthly outflow / monthly inflow **> 90 %** |
| **Inception spike** | Monthly volume **> initial deposit** for accounts **< 3 months old** |

---

## Alert & Log Integration

Every detected alert:
1. Is written to the CRM as an `AMLAlert` with `review_status = "Pending"`.
2. Generates a **Feature 3 audit log entry** (`action = CREATE`, `agent_id = "SYSTEM_AML"`) with a `correlation_id` linking back to the alert.

**Role-based access (Feature 1):**
- **Agents** see only alerts for their own assigned clients.
- **Admins** have a global view of all flagged activity.

Agents can set `review_status` to `Confirmed` or `Dismissed` after investigation (human-in-the-loop).

---

## Data Models

| Class | Description |
|---|---|
| `Transaction` | ID, client ID, type (D/W), amount, date, status |
| `Account` | ID, client ID, account type, status, opening date, initial deposit |
| `AMLAlert` | Alert ID, client ID, transaction ID, alert type, description, timestamp, review status |
| `LogEntry` | Log ID, action, attribute name, before/after values, agent ID, client ID, timestamp, correlation ID |

**Alert types:** `STATISTICAL_OUTLIER`, `STRUCTURING`, `PASSTHROUGH`, `INCEPTION_SPIKE`

---

## Running Locally

### Prerequisites

```bash
cd services/backend/aml
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Run the Lambda handler directly

```bash
python lambda_function.py
```

Outputs a formatted JSON summary of all detected alerts to stdout.

### Run the test suite

```bash
python -m pytest tests/ -v
```

With coverage:

```bash
python -m pytest tests/ -v --cov=lambda_function --cov-report=term-missing
```

---

## Mock vs Production Clients

In the current state, all external I/O is mocked. The mock data lives in `mock_data.py`.

| Mock class | Replaces in production |
|---|---|
| `MockSFTPClient` | `ParamikoSFTPClient` — downloads CSV from a real SFTP server |
| `MockAccountRepository` | `CRMAccountRepository` — queries the CRM account database |
| `MockHistoricalTransactionRepository` | `CRMHistoricalTransactionRepository` — queries prior-period transaction amounts |
| `MockCRMWriteClient` | `CRMWriteClient` — POSTs alerts and log entries to the CRM REST API |

To wire real clients, replace the four instantiation lines in `lambda_handler()` and set the corresponding environment variables:

| Variable | Purpose |
|---|---|
| `SFTP_HOST` | SFTP server hostname |
| `SFTP_PORT` | SFTP port (default 22) |
| `SFTP_USER` | SFTP username |
| `SFTP_KEY_SECRET` | AWS Secrets Manager ARN for the SSH private key |
| `SFTP_REMOTE_PATH` | Remote path to the monthly CSV (default `/transactions/latest.csv`) |
| `CRM_API_BASE_URL` | Base URL for account/transaction read APIs |
| `CRM_WRITE_API_BASE_URL` | Optional explicit base URL for alert/log write APIs |
| `CRM_LOG_API_URL_PARAM` | Optional SSM parameter name that stores log API base URL |
| `CRM_API_AUTHORIZATION_HEADER` | Full Authorization header value for outbound HTTP calls (for example `Bearer <token>`) |
| `CRM_API_BEARER_TOKEN` | Convenience fallback token when `CRM_API_AUTHORIZATION_HEADER` is not set |
| `CRM_API_JWT_HMAC_SECRET_ARN` | Optional secret ARN used to mint a service JWT when no auth header/token is provided |
| `JWT_HMAC_SECRET_ARN` | Fallback JWT secret ARN used for service JWT minting |
| `CRM_CLIENT_ACCOUNTS_PATH_TEMPLATE` | Account lookup path template (default `/api/clients/{client_id}/accounts`) |
| `CRM_CLIENT_TRANSACTIONS_PATH_TEMPLATE` | Transaction lookup path template (default `/api/clients/{client_id}/transactions`) |
| `CRM_AML_ALERTS_PATH` | AML alert write path (default `/api/aml/alerts`) |
| `CRM_LOGS_PATH` | Audit log write path (default `/api/logs`) |

---

## Non-Functional Notes

- **Data segregation** — deploy one Lambda per legal entity and point each to entity-specific upstream routes/credentials.
- **PII security** — all client PII retrieved for reporting must be encrypted at rest (enforced at the CRM layer).
- **Cloud-native** — the function is designed for containerized Lambda deployment (Docker image–based Lambda or zip deployment).
