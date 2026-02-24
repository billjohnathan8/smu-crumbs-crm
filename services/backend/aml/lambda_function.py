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
    CRM_API_BASE_URL    - Base URL of the CRM REST API
    ENTITY_ID           - Legal entity / country instance (data-segregation)
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import statistics
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
    agent_id: str
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


class AccountRepository:
    """Production account repository — queries the CRM accounts REST endpoint."""

    def __init__(self) -> None:
        self._base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")
        self._entity_id = os.environ["ENTITY_ID"]

    # AccountRepositoryProtocol
    def get_accounts(self) -> list[Account]:
        import urllib.request  # noqa: PLC0415

        url = f"{self._base_url}/entities/{self._entity_id}/accounts"
        with urllib.request.urlopen(url) as resp:
            rows = json.loads(resp.read().decode())
        return [self._deserialise(row) for row in rows]

    def get_account_by_client_id(self, client_id: str) -> Account | None:
        import urllib.error  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        url = f"{self._base_url}/entities/{self._entity_id}/accounts/{client_id}"
        try:
            with urllib.request.urlopen(url) as resp:
                return self._deserialise(json.loads(resp.read().decode()))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise

    @staticmethod
    def _deserialise(row: dict[str, Any]) -> Account:
        return Account(
            account_id=row["account_id"],
            client_id=row["client_id"],
            account_type=AccountType(row["account_type"]),
            account_status=AccountStatus(row["account_status"]),
            opening_date=date.fromisoformat(row["opening_date"]),
            initial_deposit=float(row["initial_deposit"]),
            currency=row.get("currency", "SGD"),
            branch_id=row.get("branch_id", ""),
        )


class HistoricalTransactionRepository:
    """Production historical transaction repository — queries the CRM history endpoint."""

    def __init__(self) -> None:
        self._base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")
        self._entity_id = os.environ["ENTITY_ID"]

    # HistoricalTransactionRepositoryProtocol
    def get_historical_amounts(self, client_id: str) -> list[float]:
        import urllib.request  # noqa: PLC0415

        url = (
            f"{self._base_url}/entities/{self._entity_id}"
            f"/clients/{client_id}/historical-amounts"
        )
        with urllib.request.urlopen(url) as resp:
            return [float(v) for v in json.loads(resp.read().decode())]


class CRMWriteClient:
    """Production CRM write client — POSTs alerts and log entries via REST."""

    def __init__(self) -> None:
        self._base_url = os.environ["CRM_API_BASE_URL"].rstrip("/")
        self._entity_id = os.environ["ENTITY_ID"]

    # CRMWriteClientProtocol
    def write_alert(self, alert: AMLAlert) -> None:
        self._post(
            f"/entities/{self._entity_id}/aml-alerts",
            {
                "alert_id": alert.alert_id,
                "client_id": alert.client_id,
                "transaction_id": alert.transaction_id,
                "alert_type": alert.alert_type.value,
                "description": alert.description,
                "detected_at": alert.detected_at.isoformat(),
                "review_status": alert.review_status,
            },
        )

    def write_log(self, log: LogEntry) -> None:
        self._post(
            f"/entities/{self._entity_id}/logs",
            {
                "log_id": log.log_id,
                "action": log.action.value,
                "attribute_name": log.attribute_name,
                "before_value": log.before_value,
                "after_value": log.after_value,
                "agent_id": log.agent_id,
                "client_id": log.client_id,
                "date_time": log.date_time.isoformat(),
                "correlation_id": log.correlation_id,
            },
        )

    def _post(self, path: str, payload: dict[str, Any]) -> None:
        import urllib.request  # noqa: PLC0415

        body = json.dumps(payload, default=str).encode()
        req = urllib.request.Request(
            url=self._base_url + path,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req):
            pass


# ---------------------------------------------------------------------------
# Data Ingestion
# ---------------------------------------------------------------------------


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
        - Each individual deposit is within [STRUCTURING_MIN_AMOUNT, STRUCTURING_THRESHOLD)
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
        agent_id       = "SYSTEM_AML"  (system-generated)
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
                "alert_id": alert.alert_id,
                "alert_type": alert.alert_type.value,
                "description": alert.description,
            },
            default=str,
        ),
        agent_id="SYSTEM_AML",
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
        "total_transactions_processed": len(transactions),
        "total_alerts_generated": len(all_alerts),
        "alerts_by_type": {
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
                "alert_id": a.alert_id,
                "client_id": a.client_id,
                "alert_type": a.alert_type.value,
                "description": a.description,
                "detected_at": a.detected_at.isoformat(),
                "review_status": a.review_status,
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
    return (
        SFTPClient(),
        AccountRepository(),
        HistoricalTransactionRepository(),
        CRMWriteClient(),
    )


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

    sftp_client, account_repo, historical_repo, crm_client = _create_clients()

    # Step 1 — Fetch transaction CSV from SFTP
    remote_path = os.environ.get("SFTP_REMOTE_PATH", "/transactions/latest.csv")
    csv_content = sftp_client.download_transactions_csv(remote_path)

    # Step 2 — Parse
    transactions = parse_transactions_csv(csv_content)
    accounts = account_repo.get_accounts()

    # Steps 3–5 — Process, Populate, Log
    summary = run_aml_engine(transactions, accounts, historical_repo, crm_client)

    return {
        "statusCode": 200,
        "body": json.dumps(summary, default=str),
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
