"""
AML (Anti-Money Laundering) Lambda Function
Scrooge Global Bank CRM - Feature 5

AWS Lambda entry point — invoked monthly by EventBridge.

Architecture Flow:
    Trigger:  EventBridge triggers the Lambda monthly.
    Fetch:    Lambda connects to the SFTP server and downloads the transaction CSV.
    Process:  The AML engine runs Module A (3-sigma), Module B (structuring),
              and Module C (velocity/profile anomalies).
    Populate: Results are written back into the CRM Transaction Table.
    Log:      A Log (Feature 3) entry is created for every flagged interaction.

This file is self-contained for AWS Lambda deployment.
All external dependencies (SFTP, CRM DB, historical data) are mocked for local
development and testing; replace the Mock* classes with real clients via the
environment-variable-driven wiring in lambda_handler().

Environment variables (production):
    SFTP_HOST           - SFTP server hostname
    SFTP_PORT           - SFTP port (default 22)
    SFTP_USER           - SFTP username
    SFTP_KEY_SECRET     - AWS Secrets Manager ARN for the SSH private key
    SFTP_REMOTE_PATH    - Remote path to the monthly transaction CSV
    CRM_API_BASE_URL    - Base URL for account/transaction read APIs
    CRM_WRITE_API_BASE_URL - Optional explicit base URL for alert/log write APIs
    CRM_LOG_API_URL_PARAM - Optional SSM parameter name that stores log API base URL
    CRM_API_AUTHORIZATION_HEADER - Optional full Authorization header for outbound calls
    CRM_API_BEARER_TOKEN - Optional bearer token fallback for outbound calls
    CRM_API_JWT_HMAC_SECRET_ARN - Optional Secrets Manager ARN used to mint service JWTs
    JWT_HMAC_SECRET_ARN - Fallback secret ARN for service JWT minting
    CRM_CLIENT_ACCOUNTS_PATH_TEMPLATE - Optional path template for
        client accounts lookup
    CRM_CLIENT_TRANSACTIONS_PATH_TEMPLATE - Optional path template
        for client transactions lookup
    CRM_AML_ALERTS_PATH - Optional override for AML alert write endpoint
    CRM_LOGS_PATH       - Optional override for audit log write endpoint

Environment variables (local smoke support):
    AML_SFTP_MODE       - "mock" to use embedded CSV test data instead of
                          opening a real SFTP connection. Any other value
                          keeps the production SFTP client behavior.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import statistics
import base64
import hashlib
import hmac
import uuid
from dataclasses import dataclass, field  # noqa: F401
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Protocol

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STRUCTURING_THRESHOLD: float = 10_000.0  # Regulatory reporting threshold (SGD)
STRUCTURING_MIN_AMOUNT: float = 3_000.0  # Lower bound for individual suspicious deposit
STRUCTURING_WINDOW_DAYS: int = 7  # Rolling window for structuring detection
SIGMA_THRESHOLD: float = 3.0  # Z-score threshold (Module A)
MIN_HISTORY_TRANSACTIONS: int = 5  # Minimum samples for per-client baseline
PASSTHROUGH_RATIO: float = 0.9  # Outflow / Inflow ratio for pass-through flag
INCEPTION_MONTHS: int = 3  # Account age threshold for inception-spike flag
DEFAULT_HTTP_TIMEOUT_SECONDS: int = 10
MAX_LIST_PAGE_SIZE: int = 200
DEFAULT_CLIENT_ACCOUNTS_PATH_TEMPLATE = "/api/clients/{client_id}/accounts"
DEFAULT_CLIENT_TRANSACTIONS_PATH_TEMPLATE = "/api/clients/{client_id}/transactions"
DEFAULT_AML_ALERTS_PATH = "/api/aml/alerts"
DEFAULT_LOGS_PATH = "/api/logs"
SERVICE_JWT_SUBJECT = "SYSTEM_AML"
SERVICE_JWT_ROLE = "service"
SERVICE_JWT_TTL_SECONDS = 300

_JWT_HMAC_SECRET_CACHE: str | None = None
_LOG_WRITE_BASE_URL_CACHE: str | None = None
MOCK_SFTP_CSV = """transaction_id,client_id,transaction_type,amount,date,status
AML-MOCK-001,clt_999999,D,3500.00,2026-01-01,Completed
AML-MOCK-002,clt_999999,D,3400.00,2026-01-03,Completed
AML-MOCK-003,clt_999999,D,3300.00,2026-01-05,Completed
AML-MOCK-004,clt_999999,D,3200.00,2026-01-06,Completed
"""


def _b64url_encode(data: bytes) -> str:
    """Encode bytes as base64url without padding."""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _load_service_jwt_secret() -> str | None:
    """Load and cache a JWT HMAC secret for service-to-service calls."""
    global _JWT_HMAC_SECRET_CACHE
    if _JWT_HMAC_SECRET_CACHE:
        return _JWT_HMAC_SECRET_CACHE

    inline_secret = os.environ.get("CRM_API_JWT_HMAC_SECRET", "").strip()
    if inline_secret:
        _JWT_HMAC_SECRET_CACHE = inline_secret
        return _JWT_HMAC_SECRET_CACHE

    secret_arn = os.environ.get("CRM_API_JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        secret_arn = os.environ.get("JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        return None

    import boto3  # noqa: PLC0415

    try:
        secret_value = boto3.client("secretsmanager").get_secret_value(
            SecretId=secret_arn
        )["SecretString"]
    except Exception:
        logger.exception("Failed to load service JWT secret from Secrets Manager")
        return None

    if isinstance(secret_value, str) and secret_value.strip():
        _JWT_HMAC_SECRET_CACHE = secret_value.strip()
    return _JWT_HMAC_SECRET_CACHE


def _mint_service_jwt() -> str | None:
    """Mint an internal HS256 JWT for log API authorization."""
    secret = _load_service_jwt_secret()
    if not secret:
        return None

    now_epoch = int(datetime.now(timezone.utc).timestamp())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": SERVICE_JWT_SUBJECT,
        "role": SERVICE_JWT_ROLE,
        "iat": now_epoch,
        "exp": now_epoch + SERVICE_JWT_TTL_SECONDS,
    }
    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}"
    signature = hmac.new(
        secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def _authorization_header() -> str | None:
    """Resolve outbound Authorization header from environment variables."""
    explicit_header = os.environ.get("CRM_API_AUTHORIZATION_HEADER", "").strip()
    if explicit_header:
        return explicit_header
    bearer_token = os.environ.get("CRM_API_BEARER_TOKEN", "").strip()
    if bearer_token:
        return f"Bearer {bearer_token}"
    service_token = _mint_service_jwt()
    if service_token:
        return f"Bearer {service_token}"
    return None


def _auth_headers() -> dict[str, str]:
    """Build optional auth headers for service-to-service HTTP calls."""
    authorization = _authorization_header()
    if authorization:
        return {"Authorization": authorization}
    return {}


def _resolve_log_write_base_url(default_base_url: str) -> str:
    """Resolve base URL for AML alert/log writes with safe fallback order."""
    global _LOG_WRITE_BASE_URL_CACHE

    explicit_base_url = os.environ.get("CRM_WRITE_API_BASE_URL", "").strip()
    if explicit_base_url:
        return explicit_base_url.rstrip("/")

    if _LOG_WRITE_BASE_URL_CACHE:
        return _LOG_WRITE_BASE_URL_CACHE

    parameter_name = os.environ.get("CRM_LOG_API_URL_PARAM", "").strip()
    if parameter_name:
        import boto3  # noqa: PLC0415

        try:
            param_value = (
                boto3.client("ssm")
                .get_parameter(Name=parameter_name)["Parameter"]["Value"]
                .strip()
            )
            if param_value:
                _LOG_WRITE_BASE_URL_CACHE = param_value.rstrip("/")
                return _LOG_WRITE_BASE_URL_CACHE
        except Exception:
            logger.exception(
                "Failed to resolve log API URL from SSM parameter '%s'",
                parameter_name,
            )

    return default_base_url


# ---------------------------------------------------------------------------
# Enums & Data Models
# ---------------------------------------------------------------------------


class TransactionType(str, Enum):
    DEPOSIT = "D"
    WITHDRAWAL = "W"


class TransactionStatus(str, Enum):
    COMPLETED = "Completed"
    PENDING = "Pending"
    FAILED = "Failed"


class AccountType(str, Enum):
    SAVINGS = "Savings"
    CHECKING = "Checking"
    BUSINESS = "Business"


class AccountStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"
    PENDING = "Pending"


class AlertType(str, Enum):
    STATISTICAL_OUTLIER = "STATISTICAL_OUTLIER"
    STRUCTURING = "STRUCTURING"
    PASSTHROUGH = "PASSTHROUGH"
    INCEPTION_SPIKE = "INCEPTION_SPIKE"


class LogAction(str, Enum):
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


@dataclass
class Transaction:
    """Feature 4 - Transaction record."""

    transaction_id: str
    client_id: str
    transaction_type: TransactionType
    amount: float
    date: date
    status: TransactionStatus


@dataclass
class Account:
    """Feature 2 - Account record."""

    account_id: str
    client_id: str
    account_type: AccountType
    account_status: AccountStatus
    opening_date: date
    initial_deposit: float
    currency: str = "SGD"
    branch_id: str = ""


@dataclass
class AMLAlert:
    """An AML detection event, persisted to the CRM and logged."""

    alert_id: str
    client_id: str
    transaction_id: str | None
    alert_type: AlertType
    description: str
    detected_at: datetime
    review_status: str = "Pending"  # Pending | Confirmed | Dismissed


@dataclass
class LogEntry:
    """Feature 3 - Audit log entry."""

    log_id: str
    action: LogAction
    attribute_name: str
    before_value: str | None
    after_value: str | None
    user_id: str
    client_id: str
    date_time: datetime
    correlation_id: str | None = None


# ---------------------------------------------------------------------------
# Protocols — structural interfaces for all external dependencies.
# Production clients and test mocks each implement these independently,
# ensuring the main code never depends on test infrastructure.
# ---------------------------------------------------------------------------


class SFTPClientProtocol(Protocol):
    """Downloads the monthly transaction CSV from the SFTP server."""

    def download_transactions_csv(self, remote_path: str) -> str: ...


class AccountRepositoryProtocol(Protocol):
    """Reads account records for the current legal-entity instance."""

    def get_accounts(self) -> list[Account]: ...

    def get_account_by_client_id(self, client_id: str) -> Account | None: ...


class HistoricalTransactionRepositoryProtocol(Protocol):
    """Returns prior-period transaction amounts per client."""

    def get_historical_amounts(self, client_id: str) -> list[float]: ...


class CRMWriteClientProtocol(Protocol):
    """Persists AML alerts and audit log entries to the CRM."""

    def write_alert(self, alert: AMLAlert) -> None: ...

    def write_log(self, log: LogEntry) -> None: ...


# ---------------------------------------------------------------------------
# Production clients
# Instantiated by _create_clients() which is called from lambda_handler().
# Set the environment variables documented at the top of this file before use.
# ---------------------------------------------------------------------------


class SFTPClient:
    """Production SFTP client backed by paramiko.

    Authenticates using the SSH private key fetched from AWS Secrets Manager
    (SFTP_KEY_SECRET) and downloads the monthly transaction CSV.
    """

    def __init__(self) -> None:
        self._host = os.environ["SFTP_HOST"]
        self._port = int(os.environ.get("SFTP_PORT", "22"))
        self._user = os.environ["SFTP_USER"]
        self._key_secret_arn = os.environ["SFTP_KEY_SECRET"]

    # SFTPClientProtocol
    def download_transactions_csv(self, remote_path: str) -> str:
        import paramiko  # noqa: PLC0415

        pkey = paramiko.RSAKey.from_private_key(io.StringIO(self._fetch_key()))
        with paramiko.SSHClient() as ssh:
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh.connect(
                hostname=self._host,
                port=self._port,
                username=self._user,
                pkey=pkey,
            )
            with ssh.open_sftp() as sftp_session:
                with sftp_session.file(remote_path, "r") as fh:
                    return fh.read().decode("utf-8")

    def _fetch_key(self) -> str:
        """Retrieve the SSH private key string from AWS Secrets Manager."""
        import boto3  # noqa: PLC0415

        sm = boto3.client("secretsmanager")
        return sm.get_secret_value(SecretId=self._key_secret_arn)["SecretString"]


class MockSFTPClient:
    """Local smoke client that returns deterministic embedded CSV content."""

    # SFTPClientProtocol
    def download_transactions_csv(self, remote_path: str) -> str:
        logger.info(
            "MockSFTPClient enabled via AML_SFTP_MODE=mock (remote_path=%s)",
            remote_path,
        )
        return MOCK_SFTP_CSV


class AccountRepository:
    """Production account repository — queries the CRM accounts REST endpoint."""

    def __init__(self) -> None:
        self._base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")

    # AccountRepositoryProtocol
    def get_accounts(self) -> list[Account]:
        """Deprecated bulk fetch. Prefer get_account_by_client_id for active clients."""
        import urllib.request  # noqa: PLC0415

        path = os.environ.get("CRM_ACCOUNTS_PATH", "/api/accounts")
        req = urllib.request.Request(
            url=self._base_url + path,
            headers=_auth_headers(),
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode())
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return []
        return [self._deserialise(row) for row in rows]

    def get_account_by_client_id(self, client_id: str) -> Account | None:
        import urllib.error  # noqa: PLC0415
        import urllib.parse  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        path_template = os.environ.get(
            "CRM_CLIENT_ACCOUNTS_PATH_TEMPLATE",
            DEFAULT_CLIENT_ACCOUNTS_PATH_TEMPLATE,
        )
        path = path_template.format(client_id=urllib.parse.quote(client_id, safe=""))
        query = urllib.parse.urlencode({"limit": 1, "offset": 0})
        url = f"{self._base_url}{path}?{query}"
        req = urllib.request.Request(url=url, headers=_auth_headers(), method="GET")
        try:
            with urllib.request.urlopen(
                req, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS
            ) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list) or not rows:
            return None
        return self._deserialise(rows[0])

    @staticmethod
    def _deserialise(row: dict[str, Any]) -> Account:
        def pick(*keys: str) -> Any:
            for key in keys:
                if key in row and row[key] is not None:
                    return row[key]
            raise KeyError(keys[0])

        return Account(
            account_id=str(pick("accountId", "account_id")),
            client_id=str(pick("clientId", "client_id")),
            account_type=AccountType(pick("accountType", "account_type")),
            account_status=AccountStatus(pick("accountStatus", "account_status")),
            opening_date=date.fromisoformat(str(pick("openingDate", "opening_date"))),
            initial_deposit=float(pick("initialDeposit", "initial_deposit")),
            currency=row.get("currency", "SGD"),
            branch_id=str(row.get("branchId", row.get("branch_id", ""))),
        )


class HistoricalTransactionRepository:
    """Production historical transaction repository.

    Queries the CRM history endpoint.
    """

    def __init__(self) -> None:
        self._base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")

    # HistoricalTransactionRepositoryProtocol
    def get_historical_amounts(self, client_id: str) -> list[float]:
        import urllib.error  # noqa: PLC0415
        import urllib.parse  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        path_template = os.environ.get(
            "CRM_CLIENT_TRANSACTIONS_PATH_TEMPLATE",
            DEFAULT_CLIENT_TRANSACTIONS_PATH_TEMPLATE,
        )
        path = path_template.format(client_id=urllib.parse.quote(client_id, safe=""))
        query = urllib.parse.urlencode({"limit": MAX_LIST_PAGE_SIZE, "offset": 0})
        url = f"{self._base_url}{path}?{query}"
        req = urllib.request.Request(url=url, headers=_auth_headers(), method="GET")
        try:
            with urllib.request.urlopen(
                req, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS
            ) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return []
            raise

        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return []

        month_start = date.today().replace(day=1)
        historical_amounts: list[float] = []
        for row in rows:
            row_date = _parse_date_value(row.get("date"))
            if row_date is not None and row_date < month_start:
                historical_amounts.append(float(row["amount"]))

        if historical_amounts:
            return historical_amounts
        return [float(row["amount"]) for row in rows if "amount" in row]


class CRMWriteClient:
    """Production CRM write client — POSTs alerts and log entries via REST."""

    def __init__(self) -> None:
        read_base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")
        self._base_url = _resolve_log_write_base_url(read_base_url)

    # CRMWriteClientProtocol
    def write_alert(self, alert: AMLAlert) -> None:
        alerts_path = os.environ.get("CRM_AML_ALERTS_PATH", DEFAULT_AML_ALERTS_PATH)
        self._post(
            alerts_path,
            {
                "alertId": alert.alert_id,
                "clientId": alert.client_id,
                "transactionId": alert.transaction_id,
                "alertType": alert.alert_type.value,
                "description": alert.description,
                "detectedAt": alert.detected_at.isoformat(),
                "reviewStatus": alert.review_status,
            },
        )

    def write_log(self, log: LogEntry) -> None:
        logs_path = os.environ.get("CRM_LOGS_PATH", DEFAULT_LOGS_PATH)
        self._post(
            logs_path,
            {
                "action": log.action.value,
                "attributeName": log.attribute_name,
                "beforeValue": log.before_value,
                "afterValue": log.after_value,
                "userId": log.user_id,
                "clientId": log.client_id,
                "dateTime": log.date_time.isoformat(),
                "correlationId": log.correlation_id,
            },
        )

    def _post(self, path: str, payload: dict[str, Any]) -> None:
        import urllib.error  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        body = json.dumps(payload, default=str).encode()
        headers = {"Content-Type": "application/json", **_auth_headers()}
        url = (
            path if path.startswith(("http://", "https://")) else self._base_url + path
        )
        req = urllib.request.Request(
            url=url,
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS):
                pass
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            logger.error(
                "CRM API POST failed. path=%s status=%s body=%s",
                path,
                exc.code,
                error_body,
            )
            raise RuntimeError(f"CRM API POST failed for path={path}") from exc


# ---------------------------------------------------------------------------
# Data Ingestion
# ---------------------------------------------------------------------------


def _parse_date_value(value: Any) -> date | None:
    """Parse ISO date strings safely; return None for missing/invalid values."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def parse_transactions_csv(csv_content: str) -> list[Transaction]:
    """Parse a CSV string into a list of Transaction dataclass instances.

    Rows that cannot be parsed (missing/invalid fields) are skipped with a
    WARNING log rather than raising an exception; this prevents a single
    malformed row from aborting the entire monthly batch.

    Expected CSV columns (order-independent via DictReader):
        transaction_id, client_id, transaction_type, amount, date, status
    """
    transactions: list[Transaction] = []
    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    for row in reader:
        try:
            txn = Transaction(
                transaction_id=row["transaction_id"].strip(),
                client_id=row["client_id"].strip(),
                transaction_type=TransactionType(row["transaction_type"].strip()),
                amount=float(row["amount"]),
                date=date.fromisoformat(row["date"].strip()),
                status=TransactionStatus(row["status"].strip()),
            )
            transactions.append(txn)
        except (KeyError, ValueError) as exc:
            logger.warning("Skipping malformed transaction row %s: %s", row, exc)
    return transactions


# ---------------------------------------------------------------------------
# Module A: Statistical Outlier Detection (3-sigma rule)
# ---------------------------------------------------------------------------


def detect_statistical_outliers(
    transactions: list[Transaction],
    historical_repo: HistoricalTransactionRepositoryProtocol,
) -> list[AMLAlert]:
    """Flag transactions that deviate more than 3σ from a client's baseline.

    Baseline strategy:
      1. Use the client's historical amounts (prior months) as the baseline.
         If the client has >= MIN_HISTORY_TRANSACTIONS historical data points,
         compute their own mean and standard deviation.
      2. Otherwise fall back to a peer-group baseline: the current batch amounts
         from all OTHER clients (excluding the client under evaluation).
         This prevents the outlier transaction itself from inflating the std dev
         and masking its own anomaly.

    A transaction is flagged when:
        |amount - mean| > SIGMA_THRESHOLD * std_dev   (std_dev > 0)

    Optimisation: peer mean and std are derived from precomputed total sum and
    sum-of-squares, so each client's fallback baseline costs O(1) rather than
    rebuilding the peer list from scratch on every iteration.
    """
    alerts: list[AMLAlert] = []
    now = datetime.now(tz=timezone.utc)

    # Group current transactions by client
    by_client: dict[str, list[Transaction]] = {}
    for txn in transactions:
        by_client.setdefault(txn.client_id, []).append(txn)

    # Precompute per-client amount lists and global aggregates (single pass).
    # These allow O(1) peer mean/std by subtracting the current client's
    # contribution from the global totals instead of rebuilding the peer list.
    client_amounts: dict[str, list[float]] = {
        cid: [t.amount for t in ts] for cid, ts in by_client.items()
    }
    total_sum = sum(a for amounts in client_amounts.values() for a in amounts)
    total_sq = sum(a * a for amounts in client_amounts.values() for a in amounts)
    total_n = sum(len(amounts) for amounts in client_amounts.values())

    for client_id, txns in by_client.items():
        historical = historical_repo.get_historical_amounts(client_id)

        if len(historical) >= MIN_HISTORY_TRANSACTIONS:
            # Client has enough history: use their personal baseline.
            mean = statistics.mean(historical)
            std = statistics.pstdev(historical) if len(historical) > 1 else 0.0
        else:
            # Fallback: peer-group baseline — subtract this client's contribution
            # from the precomputed global totals (O(1) per client).
            own_amounts = client_amounts[client_id]
            own_n = len(own_amounts)
            peer_n = total_n - own_n
            if peer_n < 2:
                continue  # Not enough peer data to form a meaningful baseline
            own_sum = sum(own_amounts)
            own_sq = sum(a * a for a in own_amounts)
            peer_sum = total_sum - own_sum
            peer_sq = total_sq - own_sq
            mean = peer_sum / peer_n
            # Population variance via E[X²] − E[X]²
            variance = (peer_sq / peer_n) - (mean**2)
            std = variance**0.5 if variance > 0 else 0.0

        if std == 0:
            continue  # Cannot compute z-score with zero variance

        for txn in txns:
            if abs(txn.amount - mean) > SIGMA_THRESHOLD * std:
                alert = AMLAlert(
                    alert_id=str(uuid.uuid4()),
                    client_id=client_id,
                    transaction_id=txn.transaction_id,
                    alert_type=AlertType.STATISTICAL_OUTLIER,
                    description=(
                        f"Transaction {txn.transaction_id} amount {txn.amount:.2f} "
                        f"deviates by more than {SIGMA_THRESHOLD}σ from client "
                        f"baseline (mean={mean:.2f}, std={std:.2f})."
                    ),
                    detected_at=now,
                )
                alerts.append(alert)

    return alerts


# ---------------------------------------------------------------------------
# Module B: Structuring (Smurfing) Detection
# ---------------------------------------------------------------------------


def detect_structuring(transactions: list[Transaction]) -> list[AMLAlert]:
    """Detect attempts to avoid the $10,000 reporting threshold.

    Logic:
      For each client, scan their deposits for windows of STRUCTURING_WINDOW_DAYS
      days where:
        - Each individual deposit is within
          [STRUCTURING_MIN_AMOUNT, STRUCTURING_THRESHOLD)
        - The cumulative total for the window >= STRUCTURING_THRESHOLD

    A sliding-window approach is used: for each deposit (anchor), all
    subsequent deposits within the window are assessed. Once a set of
    transactions has been flagged, they are excluded from future windows to
    avoid duplicate alerts.

    Optimisation: a prefix-sum array and a monotonically advancing right
    pointer reduce the per-client window scan from O(n²) to O(n log n)
    (dominated by the sort).  Window sums are computed in O(1) via index
    subtraction rather than re-summing on each iteration.
    """
    alerts: list[AMLAlert] = []
    now = datetime.now(tz=timezone.utc)

    # Collect only deposits that fall within the suspicious individual-amount range
    candidate_deposits: dict[str, list[Transaction]] = {}
    for txn in transactions:
        if (
            txn.transaction_type == TransactionType.DEPOSIT
            and STRUCTURING_MIN_AMOUNT <= txn.amount < STRUCTURING_THRESHOLD
        ):
            candidate_deposits.setdefault(txn.client_id, []).append(txn)

    for client_id, deposits in candidate_deposits.items():
        deposits_sorted = sorted(deposits, key=lambda t: t.date)
        n = len(deposits_sorted)

        # Build prefix-sum so window totals are O(1): prefix[j] - prefix[i]
        prefix = [0.0] * (n + 1)
        for k, t in enumerate(deposits_sorted):
            prefix[k + 1] = prefix[k] + t.amount

        flagged_ids: set[str] = set()
        right = 0  # right pointer advances monotonically — O(n) total movement

        for i, anchor in enumerate(deposits_sorted):
            # Advance right until the next deposit falls outside the 7-day window
            while (
                right < n
                and (deposits_sorted[right].date - anchor.date).days
                <= STRUCTURING_WINDOW_DAYS
            ):
                right += 1

            # Window is deposits_sorted[i:right]; sum is O(1) via prefix array
            cumulative = prefix[right] - prefix[i]

            if cumulative >= STRUCTURING_THRESHOLD:
                window_txns = deposits_sorted[i:right]
                involved_ids = [t.transaction_id for t in window_txns]
                new_ids = set(involved_ids) - flagged_ids
                if new_ids:
                    flagged_ids.update(new_ids)
                    alert = AMLAlert(
                        alert_id=str(uuid.uuid4()),
                        client_id=client_id,
                        transaction_id=",".join(involved_ids),
                        alert_type=AlertType.STRUCTURING,
                        description=(
                            f"Structuring detected: {len(window_txns)} deposit(s) "
                            f"totalling {cumulative:.2f} SGD within "
                            f"{STRUCTURING_WINDOW_DAYS} days "
                            f"(transactions: {', '.join(involved_ids)})."
                        ),
                        detected_at=now,
                    )
                    alerts.append(alert)

    return alerts


# ---------------------------------------------------------------------------
# Module C: Velocity & Profile Anomalies
# ---------------------------------------------------------------------------


def detect_velocity_anomalies(
    transactions: list[Transaction],
    accounts: list[Account],
    reference_date: date | None = None,
) -> list[AMLAlert]:
    """Detect pass-through mule activity and inception spikes.

    Pass-through (mule) flag:
        (Total Monthly Outflow / Total Monthly Inflow) > PASSTHROUGH_RATIO

    Inception Spike flag:
        Total Monthly Volume > Initial Deposit
        AND account age < INCEPTION_MONTHS months

    Args:
        transactions:   Current month's transactions.
        accounts:       Account records for the current entity.
        reference_date: The date used to determine account age
                        (defaults to today).
    """
    alerts: list[AMLAlert] = []
    now = datetime.now(tz=timezone.utc)
    ref = reference_date or date.today()

    account_map: dict[str, Account] = {acc.client_id: acc for acc in accounts}

    by_client: dict[str, list[Transaction]] = {}
    for txn in transactions:
        by_client.setdefault(txn.client_id, []).append(txn)

    for client_id, txns in by_client.items():
        # Single pass — avoids iterating txns twice for inflow and outflow
        inflow = outflow = 0.0
        for t in txns:
            if t.transaction_type == TransactionType.DEPOSIT:
                inflow += t.amount
            else:
                outflow += t.amount
        total_volume = inflow + outflow

        # --- Pass-through detection ---
        if inflow > 0 and (outflow / inflow) > PASSTHROUGH_RATIO:
            alert = AMLAlert(
                alert_id=str(uuid.uuid4()),
                client_id=client_id,
                transaction_id=None,
                alert_type=AlertType.PASSTHROUGH,
                description=(
                    f"Pass-through activity: outflow {outflow:.2f} SGD is "
                    f"{(outflow / inflow * 100):.1f}% of inflow {inflow:.2f} SGD "
                    f"(threshold {PASSTHROUGH_RATIO * 100:.0f}%)."
                ),
                detected_at=now,
            )
            alerts.append(alert)

        # --- Inception spike detection ---
        account = account_map.get(client_id)
        if account:
            account_age_months = (ref.year - account.opening_date.year) * 12 + (
                ref.month - account.opening_date.month
            )
            if (
                account_age_months < INCEPTION_MONTHS
                and total_volume > account.initial_deposit
            ):
                alert = AMLAlert(
                    alert_id=str(uuid.uuid4()),
                    client_id=client_id,
                    transaction_id=None,
                    alert_type=AlertType.INCEPTION_SPIKE,
                    description=(
                        f"Inception spike: monthly volume {total_volume:.2f} SGD "
                        f"exceeds initial deposit {account.initial_deposit:.2f} SGD "
                        f"for account aged {account_age_months} month(s) "
                        f"(threshold < {INCEPTION_MONTHS} months)."
                    ),
                    detected_at=now,
                )
                alerts.append(alert)

    return alerts


# ---------------------------------------------------------------------------
# Log Entry Factory
# ---------------------------------------------------------------------------


def create_log_entry_for_alert(alert: AMLAlert) -> LogEntry:
    """Produce a Feature 3 Log entry for an AML alert.

    The entry uses:
        action         = CREATE  (a new alert record is being created)
        attribute_name = "AML_ALERT"
        before_value   = None    (nothing existed before)
        after_value    = JSON-serialised alert summary
        user_id       = "SYSTEM_AML"  (system-generated)
        client_id      = the flagged client
        correlation_id = the alert's own ID for traceability
    """
    return LogEntry(
        log_id=str(uuid.uuid4()),
        action=LogAction.CREATE,
        attribute_name="AML_ALERT",
        before_value=None,
        after_value=json.dumps(
            {
                "alertId": alert.alert_id,
                "alertType": alert.alert_type.value,
                "description": alert.description,
            },
            default=str,
        ),
        user_id="SYSTEM_AML",
        client_id=alert.client_id,
        date_time=alert.detected_at,
        correlation_id=alert.alert_id,
    )


# ---------------------------------------------------------------------------
# AML Engine Orchestrator
# ---------------------------------------------------------------------------


def run_aml_engine(
    transactions: list[Transaction],
    accounts: list[Account],
    historical_repo: HistoricalTransactionRepositoryProtocol,
    crm_client: CRMWriteClientProtocol,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Orchestrate all three AML detection modules and persist results.

    For every detected alert:
      1. Write the alert record to the CRM (write_alert).
      2. Write a corresponding audit log entry (write_log).

    Returns a summary dictionary suitable for use as a Lambda response body.
    """
    logger.info(
        "AML engine starting — transactions: %d, accounts: %d",
        len(transactions),
        len(accounts),
    )

    # Module A — Statistical Outlier Detection
    module_a_alerts = detect_statistical_outliers(transactions, historical_repo)
    logger.info("Module A (3-sigma): %d alert(s)", len(module_a_alerts))

    # Module B — Structuring Detection
    module_b_alerts = detect_structuring(transactions)
    logger.info("Module B (structuring): %d alert(s)", len(module_b_alerts))

    # Module C — Velocity & Profile Anomalies
    module_c_alerts = detect_velocity_anomalies(transactions, accounts, reference_date)
    logger.info("Module C (velocity): %d alert(s)", len(module_c_alerts))

    all_alerts = module_a_alerts + module_b_alerts + module_c_alerts

    # Persist each alert and its corresponding audit log entry
    for alert in all_alerts:
        crm_client.write_alert(alert)
        crm_client.write_log(create_log_entry_for_alert(alert))

    summary: dict[str, Any] = {
        "totalTransactionsProcessed": len(transactions),
        "totalAlertsGenerated": len(all_alerts),
        "alertsByType": {
            AlertType.STATISTICAL_OUTLIER.value: len(module_a_alerts),
            AlertType.STRUCTURING.value: len(module_b_alerts),
            AlertType.PASSTHROUGH.value: sum(
                1 for a in module_c_alerts if a.alert_type == AlertType.PASSTHROUGH
            ),
            AlertType.INCEPTION_SPIKE.value: sum(
                1 for a in module_c_alerts if a.alert_type == AlertType.INCEPTION_SPIKE
            ),
        },
        "alerts": [
            {
                "alertId": a.alert_id,
                "clientId": a.client_id,
                "alertType": a.alert_type.value,
                "description": a.description,
                "detectedAt": a.detected_at.isoformat(),
                "reviewStatus": a.review_status,
            }
            for a in all_alerts
        ],
    }

    logger.info(
        "AML engine complete — %s",
        json.dumps({k: v for k, v in summary.items() if k != "alerts"}, default=str),
    )
    return summary


# ---------------------------------------------------------------------------
# Client Factory
# ---------------------------------------------------------------------------


def _create_clients() -> tuple[
    SFTPClientProtocol,
    AccountRepositoryProtocol,
    HistoricalTransactionRepositoryProtocol,
    CRMWriteClientProtocol,
]:
    """Instantiate and return the four production external clients.

    Isolated in its own function so that integration tests can swap all four
    clients with a single monkeypatch call instead of patching each constructor
    separately:

        monkeypatch.setattr(
            "lambda_function._create_clients",
            lambda: (MockSFTPClient(), MockAccountRepository(),
                     MockHistoricalTransactionRepository(), MockCRMWriteClient()),
        )

    See tests/mocks.py for the mock implementations.
    """
    sftp_mode = os.environ.get("AML_SFTP_MODE", "").strip().lower()
    sftp_client: SFTPClientProtocol
    if sftp_mode == "mock":
        sftp_client = MockSFTPClient()
    else:
        sftp_client = SFTPClient()

    return (
        sftp_client,
        AccountRepository(),
        HistoricalTransactionRepository(),
        CRMWriteClient(),
    )


def _load_accounts_for_active_clients(
    transactions: list[Transaction],
    account_repo: AccountRepositoryProtocol,
) -> list[Account]:
    """Load one account per active client in the current transaction batch."""
    accounts: list[Account] = []
    for client_id in sorted({txn.client_id for txn in transactions}):
        account = account_repo.get_account_by_client_id(client_id)
        if account is not None:
            accounts.append(account)
    return accounts


# ---------------------------------------------------------------------------
# Lambda Handler (AWS entry point)
# ---------------------------------------------------------------------------


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point — invoked monthly by EventBridge.

    Obtains the four external clients from _create_clients() and runs the full
    AML batch pipeline:

        SFTP download → CSV parse → AML engine → CRM write + Log write

    For integration testing, monkeypatch _create_clients to inject mocks
    (see tests/mocks.py).  For production, set the environment variables
    documented at the top of this file.

    Args:
        event:   EventBridge scheduled-event payload (not consumed directly).
        context: Lambda context object (not consumed directly).

    Returns:
        API Gateway-compatible response dict with statusCode and JSON body.
    """
    logger.info("Lambda invoked. Event: %s", json.dumps(event, default=str))

    try:
        sftp_client, account_repo, historical_repo, crm_client = _create_clients()

        # Step 1 — Fetch transaction CSV from SFTP
        remote_path = os.environ.get("SFTP_REMOTE_PATH", "/transactions/latest.csv")
        csv_content = sftp_client.download_transactions_csv(remote_path)

        # Step 2 — Parse
        transactions = parse_transactions_csv(csv_content)
        accounts = _load_accounts_for_active_clients(transactions, account_repo)

        # Steps 3–5 — Process, Populate, Log
        summary = run_aml_engine(transactions, accounts, historical_repo, crm_client)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(summary, default=str),
        }
    except Exception:
        logger.exception("AML batch execution failed")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "error": "internal_error",
                    "message": "AML batch execution failed",
                }
            ),
        }


# ---------------------------------------------------------------------------
# Local runner  (python lambda_function.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        stream=sys.stdout,
    )
    result = lambda_handler({}, None)
    print("\n--- AML Engine Summary ---")
    print(json.dumps(json.loads(result["body"]), indent=2))
