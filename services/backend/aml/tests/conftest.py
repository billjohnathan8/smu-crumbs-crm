"""Shared pytest fixtures for the AML Lambda test suite.

All fixtures are derived directly from the data models in lambda_function.py,
so that tests remain independent of the mock classes embedded in the module.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

# ---------------------------------------------------------------------------
# Make the parent directory importable when running pytest from /aml or /tests
# ---------------------------------------------------------------------------
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lambda_function import (  # noqa: E402
    Account,
    AccountStatus,
    AccountType,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from tests.mocks import (  # noqa: E402
    MockAccountRepository,
    MockCRMWriteClient,
    MockHistoricalTransactionRepository,
)


# ---------------------------------------------------------------------------
# Reusable date helpers
# ---------------------------------------------------------------------------

REF_DATE = date(2026, 1, 31)  # "end of January 2026" — the batch reference date
NOW = datetime(2026, 1, 31, 0, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Account fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def account_savings_old() -> Account:
    """A long-established savings account — should NOT trigger inception spike."""
    return Account(
        account_id="ACC_S_OLD",
        client_id="CLIENT_SAVINGS_OLD",
        account_type=AccountType.SAVINGS,
        account_status=AccountStatus.ACTIVE,
        opening_date=date(2015, 1, 1),
        initial_deposit=2_000.0,
    )


@pytest.fixture()
def account_checking_new() -> Account:
    """A new (1-month-old) checking account — inception-spike candidate."""
    return Account(
        account_id="ACC_C_NEW",
        client_id="CLIENT_NEW",
        account_type=AccountType.CHECKING,
        account_status=AccountStatus.ACTIVE,
        opening_date=date(2025, 12, 1),  # 1 month before REF_DATE
        initial_deposit=1_000.0,
    )


@pytest.fixture()
def account_business() -> Account:
    """An established business account."""
    return Account(
        account_id="ACC_B",
        client_id="CLIENT_BUSINESS",
        account_type=AccountType.BUSINESS,
        account_status=AccountStatus.ACTIVE,
        opening_date=date(2020, 6, 1),
        initial_deposit=50_000.0,
    )


@pytest.fixture()
def default_accounts(
    account_savings_old, account_checking_new, account_business
) -> list[Account]:
    return [account_savings_old, account_checking_new, account_business]


# ---------------------------------------------------------------------------
# Transaction builder helpers
# ---------------------------------------------------------------------------


def make_deposit(
    txn_id: str,
    client_id: str,
    amount: float,
    txn_date: date,
    status: TransactionStatus = TransactionStatus.COMPLETED,
) -> Transaction:
    return Transaction(
        transaction_id=txn_id,
        client_id=client_id,
        transaction_type=TransactionType.DEPOSIT,
        amount=amount,
        date=txn_date,
        status=status,
    )


def make_withdrawal(
    txn_id: str,
    client_id: str,
    amount: float,
    txn_date: date,
    status: TransactionStatus = TransactionStatus.COMPLETED,
) -> Transaction:
    return Transaction(
        transaction_id=txn_id,
        client_id=client_id,
        transaction_type=TransactionType.WITHDRAWAL,
        amount=amount,
        date=txn_date,
        status=status,
    )


# ---------------------------------------------------------------------------
# Pre-built transaction sets
# ---------------------------------------------------------------------------


@pytest.fixture()
def transactions_normal() -> list[Transaction]:
    """A set of unremarkable transactions that should produce zero alerts."""
    return [
        make_deposit("N001", "CLIENT_NORMAL", 1_000.0, date(2026, 1, 5)),
        make_deposit("N002", "CLIENT_NORMAL", 1_050.0, date(2026, 1, 12)),
        make_withdrawal("N003", "CLIENT_NORMAL", 200.0, date(2026, 1, 15)),
    ]


@pytest.fixture()
def transactions_outlier() -> list[Transaction]:
    """CLIENT_OUTLIER has a stable $200 history.

    The $50,000 deposit is a clear outlier.
    """
    return [
        make_deposit("O001", "CLIENT_OUTLIER", 190.0, date(2026, 1, 2)),
        make_deposit("O002", "CLIENT_OUTLIER", 205.0, date(2026, 1, 5)),
        make_deposit("O003", "CLIENT_OUTLIER", 195.0, date(2026, 1, 8)),
        make_deposit("O004", "CLIENT_OUTLIER", 50_000.0, date(2026, 1, 20)),  # OUTLIER
    ]


@pytest.fixture()
def historical_repo_outlier() -> MockHistoricalTransactionRepository:
    """Historical data for CLIENT_OUTLIER: five stable $200-range amounts."""
    repo = MockHistoricalTransactionRepository()
    repo.MOCK_HISTORY = {
        "CLIENT_OUTLIER": [180.0, 190.0, 200.0, 205.0, 195.0],
    }
    return repo


@pytest.fixture()
def historical_repo_empty() -> MockHistoricalTransactionRepository:
    """No historical data — forces global fallback baseline in Module A."""
    repo = MockHistoricalTransactionRepository()
    repo.MOCK_HISTORY = {}
    return repo


@pytest.fixture()
def transactions_structuring() -> list[Transaction]:
    """CLIENT_SMURF deposits three amounts within 7 days summing > $10,000."""
    return [
        make_deposit("S001", "CLIENT_SMURF", 4_000.0, date(2026, 1, 1)),
        make_deposit("S002", "CLIENT_SMURF", 3_500.0, date(2026, 1, 3)),
        make_deposit(
            "S003", "CLIENT_SMURF", 3_200.0, date(2026, 1, 6)
        ),  # cumulative = 10,700
    ]


@pytest.fixture()
def transactions_passthrough() -> list[Transaction]:
    """CLIENT_MULE deposits $100,000 and immediately withdraws $95,000 (95% ratio)."""
    return [
        make_deposit("P001", "CLIENT_MULE", 100_000.0, date(2026, 1, 10)),
        make_withdrawal("P002", "CLIENT_MULE", 95_000.0, date(2026, 1, 11)),
    ]


@pytest.fixture()
def transactions_inception_spike(account_checking_new) -> list[Transaction]:
    """CLIENT_NEW's monthly volume vastly exceeds the $1,000 initial deposit."""
    client_id = account_checking_new.client_id
    return [
        make_deposit("I001", client_id, 5_000.0, date(2026, 1, 5)),
        make_deposit("I002", client_id, 3_000.0, date(2026, 1, 20)),
    ]


# ---------------------------------------------------------------------------
# Repository / client fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def crm_client() -> MockCRMWriteClient:
    return MockCRMWriteClient()


@pytest.fixture()
def account_repo() -> MockAccountRepository:
    return MockAccountRepository()


@pytest.fixture()
def historical_repo() -> MockHistoricalTransactionRepository:
    return MockHistoricalTransactionRepository()
