"""
Mock implementations of all external AML dependencies.

These classes are for use in tests ONLY.  They implement the same Protocol
interfaces defined in lambda_function.py so they can be passed directly to
any function that accepts those protocols.

Usage pattern in tests:
    from tests.mocks import (
        MockSFTPClient,
        MockAccountRepository,
        MockHistoricalTransactionRepository,
        MockCRMWriteClient,
    )

    def test_something():
        repo = MockHistoricalTransactionRepository()
        repo.MOCK_HISTORY = {"CLIENT_X": [100.0, 200.0, 300.0, 150.0, 250.0]}
        alerts = detect_statistical_outliers(txns, repo)
        ...

For lambda_handler integration tests, patch the client factory instead:
    monkeypatch.setattr(
        "lambda_function._create_clients",
        lambda: (MockSFTPClient(), MockAccountRepository(),
                 MockHistoricalTransactionRepository(), MockCRMWriteClient()),
    )
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from lambda_function import (
    Account,
    AccountStatus,
    AccountType,
    AMLAlert,
    LogEntry,
)
from tests.mock_data import (
    MOCK_ACCOUNTS_DATA,
    MOCK_CSV as MOCK_CSV_DATA,
    MOCK_HISTORY_DATA,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mock: SFTP Client
# ---------------------------------------------------------------------------


class MockSFTPClient:
    """Returns the embedded mock CSV instead of contacting a real SFTP server.

    The CSV string is also accessible as the class attribute ``MOCK_CSV`` so
    that test code can inspect the raw data:
        sftp = MockSFTPClient()
        txns = parse_transactions_csv(sftp.MOCK_CSV)
    """

    # Class attribute for test convenience (e.g. sftp.MOCK_CSV, MockSFTPClient.MOCK_CSV)
    MOCK_CSV: str = MOCK_CSV_DATA

    def download_transactions_csv(
        self, remote_path: str = "/transactions/latest.csv"
    ) -> str:
        logger.info(
            "MockSFTPClient: returning embedded CSV (remote path: %s)", remote_path
        )
        return MOCK_CSV_DATA


# ---------------------------------------------------------------------------
# Mock: Account Repository
# ---------------------------------------------------------------------------


class MockAccountRepository:
    """Returns Account instances built from MOCK_ACCOUNTS_DATA.

    Tests that need custom accounts should construct Account objects directly
    and pass them to the function under test rather than customising this class.
    """

    def __init__(self) -> None:
        self._accounts: list[Account] = [
            Account(
                account_id=row[0],
                client_id=row[1],
                account_type=AccountType(row[2]),
                account_status=AccountStatus(row[3]),
                opening_date=date.fromisoformat(row[4]),
                initial_deposit=row[5],
            )
            for row in MOCK_ACCOUNTS_DATA
        ]

    def get_accounts(self) -> list[Account]:
        return list(self._accounts)

    def get_account_by_client_id(self, client_id: str) -> Account | None:
        for acc in self._accounts:
            if acc.client_id == client_id:
                return acc
        return None


# ---------------------------------------------------------------------------
# Mock: Historical Transaction Repository
# ---------------------------------------------------------------------------


class MockHistoricalTransactionRepository:
    """Returns historical amounts from MOCK_HISTORY_DATA.

    Tests that require specific per-client history can override the instance
    attribute MOCK_HISTORY after construction:
        repo = MockHistoricalTransactionRepository()
        repo.MOCK_HISTORY = {"CLIENT_X": [100.0, 200.0, 300.0, 150.0, 250.0]}
    """

    def __init__(self) -> None:
        # Copy so individual test instances are independent
        self.MOCK_HISTORY: dict[str, list[float]] = {
            k: list(v) for k, v in MOCK_HISTORY_DATA.items()
        }

    def get_historical_amounts(self, client_id: str) -> list[float]:
        return list(self.MOCK_HISTORY.get(client_id, []))


# ---------------------------------------------------------------------------
# Mock: CRM Write Client
# ---------------------------------------------------------------------------


class MockCRMWriteClient:
    """Captures write calls in memory instead of hitting the CRM REST API.

    Tests can inspect ``written_alerts`` and ``written_logs`` after exercising
    the engine to assert that the correct records were produced:
        crm = MockCRMWriteClient()
        run_aml_engine(..., crm_client=crm)
        assert len(crm.written_alerts) == 3
    """

    def __init__(self) -> None:
        self.written_alerts: list[dict[str, Any]] = []
        self.written_logs: list[dict[str, Any]] = []

    def write_alert(self, alert: AMLAlert) -> None:
        payload: dict[str, Any] = {
            "alertId": alert.alert_id,
            "clientId": alert.client_id,
            "transactionId": alert.transaction_id,
            "alertType": alert.alert_type.value,
            "description": alert.description,
            "detectedAt": alert.detected_at.isoformat(),
            "reviewStatus": alert.review_status,
        }
        self.written_alerts.append(payload)
        logger.debug(
            "MockCRMWriteClient captured alert: %s", json.dumps(payload, default=str)
        )

    def write_log(self, log: LogEntry) -> None:
        payload: dict[str, Any] = {
            "logId": log.log_id,
            "action": log.action.value,
            "attributeName": log.attribute_name,
            "beforeValue": log.before_value,
            "afterValue": log.after_value,
            "agentId": log.agent_id,
            "clientId": log.client_id,
            "dateTime": log.date_time.isoformat(),
            "correlationId": log.correlation_id,
        }
        self.written_logs.append(payload)
        logger.debug(
            "MockCRMWriteClient captured log: %s", json.dumps(payload, default=str)
        )
