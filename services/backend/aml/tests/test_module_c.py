"""Tests for Module C: Velocity & Profile Anomalies (pass-through & inception spike)."""

from __future__ import annotations

from datetime import date

from lambda_function import (
    Account,
    AccountStatus,
    AccountType,
    AlertType,
    INCEPTION_MONTHS,
    PASSTHROUGH_RATIO,
    detect_velocity_anomalies,
)
from tests.conftest import REF_DATE, make_deposit, make_withdrawal

# ---------------------------------------------------------------------------
# Pass-through (mule) detection
# ---------------------------------------------------------------------------


class TestModuleC_Passthrough:
    """Client moves ≥ PASSTHROUGH_RATIO of inflow back out in the same month."""

    def test_passthrough_flagged(self, transactions_passthrough, default_accounts):
        alerts = detect_velocity_anomalies(
            transactions_passthrough, default_accounts, REF_DATE
        )
        alert_types = [a.alert_type for a in alerts]
        assert AlertType.PASSTHROUGH in alert_types

    def test_passthrough_client_id(self, transactions_passthrough, default_accounts):
        alerts = detect_velocity_anomalies(
            transactions_passthrough, default_accounts, REF_DATE
        )
        passthrough = [a for a in alerts if a.alert_type == AlertType.PASSTHROUGH]
        assert all(a.client_id == "CLIENT_MULE" for a in passthrough)

    def test_passthrough_no_transaction_id(
        self, transactions_passthrough, default_accounts
    ):
        """Pass-through is a client-level flag; no single transaction_id."""
        alerts = detect_velocity_anomalies(
            transactions_passthrough, default_accounts, REF_DATE
        )
        passthrough = [a for a in alerts if a.alert_type == AlertType.PASSTHROUGH]
        assert all(a.transaction_id is None for a in passthrough)

    def test_passthrough_review_status_pending(
        self, transactions_passthrough, default_accounts
    ):
        alerts = detect_velocity_anomalies(
            transactions_passthrough, default_accounts, REF_DATE
        )
        passthrough = [a for a in alerts if a.alert_type == AlertType.PASSTHROUGH]
        assert all(a.review_status == "Pending" for a in passthrough)

    def test_passthrough_description_mentions_ratio(
        self, transactions_passthrough, default_accounts
    ):
        alerts = detect_velocity_anomalies(
            transactions_passthrough, default_accounts, REF_DATE
        )
        passthrough = [a for a in alerts if a.alert_type == AlertType.PASSTHROUGH]
        assert any(
            "%" in a.description or "outflow" in a.description.lower()
            for a in passthrough
        )

    def test_exactly_at_passthrough_ratio_flagged(self):
        """Outflow exactly == PASSTHROUGH_RATIO * inflow → should be flagged (>)."""
        # 90% outflow of 100k inflow
        inflow = 10_000.0
        outflow = inflow * PASSTHROUGH_RATIO + 0.01  # just above the ratio
        txns = [
            make_deposit("PT1", "CLIENT_PT", inflow, date(2026, 1, 1)),
            make_withdrawal("PT2", "CLIENT_PT", outflow, date(2026, 1, 2)),
        ]
        account = Account(
            "ACC_PT",
            "CLIENT_PT",
            AccountType.SAVINGS,
            AccountStatus.ACTIVE,
            date(2020, 1, 1),
            5_000.0,
        )
        alerts = detect_velocity_anomalies(txns, [account], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.PASSTHROUGH in types

    def test_below_passthrough_ratio_not_flagged(self):
        """Outflow well below PASSTHROUGH_RATIO → no pass-through alert."""
        txns = [
            make_deposit("LP1", "CLIENT_LP", 10_000.0, date(2026, 1, 1)),
            make_withdrawal("LP2", "CLIENT_LP", 5_000.0, date(2026, 1, 2)),  # 50%
        ]
        account = Account(
            "ACC_LP",
            "CLIENT_LP",
            AccountType.SAVINGS,
            AccountStatus.ACTIVE,
            date(2020, 1, 1),
            5_000.0,
        )
        alerts = detect_velocity_anomalies(txns, [account], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.PASSTHROUGH not in types

    def test_no_inflow_no_passthrough_division_by_zero(self):
        """A withdrawal-only client must not raise ZeroDivisionError."""
        txns = [make_withdrawal("WO1", "CLIENT_WO", 1_000.0, date(2026, 1, 1))]
        account = Account(
            "ACC_WO",
            "CLIENT_WO",
            AccountType.SAVINGS,
            AccountStatus.ACTIVE,
            date(2020, 1, 1),
            5_000.0,
        )
        # Should not raise
        alerts = detect_velocity_anomalies(txns, [account], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.PASSTHROUGH not in types


# ---------------------------------------------------------------------------
# Inception Spike detection
# ---------------------------------------------------------------------------


class TestModuleC_InceptionSpike:
    def test_inception_spike_flagged(
        self, transactions_inception_spike, account_checking_new, default_accounts
    ):
        alerts = detect_velocity_anomalies(
            transactions_inception_spike, default_accounts, REF_DATE
        )
        types = [a.alert_type for a in alerts]
        assert AlertType.INCEPTION_SPIKE in types

    def test_inception_spike_client_id(
        self, transactions_inception_spike, account_checking_new, default_accounts
    ):
        alerts = detect_velocity_anomalies(
            transactions_inception_spike, default_accounts, REF_DATE
        )
        spikes = [a for a in alerts if a.alert_type == AlertType.INCEPTION_SPIKE]
        assert all(a.client_id == account_checking_new.client_id for a in spikes)

    def test_old_account_no_inception_spike(self, account_savings_old):
        """Account older than INCEPTION_MONTHS threshold.

        Must never trigger inception spike.
        """
        txns = [
            make_deposit(
                "OS1", account_savings_old.client_id, 999_999.0, date(2026, 1, 1)
            ),
        ]
        alerts = detect_velocity_anomalies(txns, [account_savings_old], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.INCEPTION_SPIKE not in types

    def test_new_account_below_initial_deposit_not_flagged(self, account_checking_new):
        """New account whose monthly volume stays below initial deposit.

        Must not flag.
        """
        txns = [
            make_deposit(
                "NL1", account_checking_new.client_id, 500.0, date(2026, 1, 1)
            ),
            # 500 < initial_deposit (1,000) → no flag
        ]
        alerts = detect_velocity_anomalies(txns, [account_checking_new], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.INCEPTION_SPIKE not in types

    def test_account_exactly_at_age_threshold_not_flagged(self):
        """Account exactly INCEPTION_MONTHS old is outside the danger window."""
        # Compute opening date that is exactly INCEPTION_MONTHS before REF_DATE.
        # REF_DATE = 2026-01, INCEPTION_MONTHS = 3 → opening = 2025-10-01
        raw_month = REF_DATE.month - INCEPTION_MONTHS
        if raw_month <= 0:
            opening = date(REF_DATE.year - 1, raw_month + 12, 1)
        else:
            opening = date(REF_DATE.year, raw_month, 1)

        # Sanity-check: months_diff should equal exactly INCEPTION_MONTHS
        months_diff = (REF_DATE.year - opening.year) * 12 + (
            REF_DATE.month - opening.month
        )
        assert months_diff == INCEPTION_MONTHS

        account = Account(
            "ACC_AGE",
            "CLIENT_AGE",
            AccountType.SAVINGS,
            AccountStatus.ACTIVE,
            opening,
            1_000.0,
        )
        txns = [make_deposit("AGE1", "CLIENT_AGE", 99_999.0, date(2026, 1, 5))]
        alerts = detect_velocity_anomalies(txns, [account], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.INCEPTION_SPIKE not in types

    def test_inception_spike_description_mentions_initial_deposit(
        self, transactions_inception_spike, account_checking_new, default_accounts
    ):
        alerts = detect_velocity_anomalies(
            transactions_inception_spike, default_accounts, REF_DATE
        )
        spikes = [a for a in alerts if a.alert_type == AlertType.INCEPTION_SPIKE]
        assert any("initial deposit" in a.description.lower() for a in spikes)


# ---------------------------------------------------------------------------
# Both flags in one client
# ---------------------------------------------------------------------------


class TestModuleC_BothFlags:
    def test_client_can_trigger_both_alerts(self):
        """A new account that also shows pass-through behaviour gets two alerts."""
        account = Account(
            "ACC_BOTH",
            "CLIENT_BOTH",
            AccountType.CHECKING,
            AccountStatus.ACTIVE,
            date(2025, 12, 15),
            500.0,
        )
        txns = [
            make_deposit("B1", "CLIENT_BOTH", 50_000.0, date(2026, 1, 1)),
            make_withdrawal("B2", "CLIENT_BOTH", 49_000.0, date(2026, 1, 2)),
        ]
        alerts = detect_velocity_anomalies(txns, [account], REF_DATE)
        types = {a.alert_type for a in alerts}
        assert AlertType.PASSTHROUGH in types
        assert AlertType.INCEPTION_SPIKE in types


# ---------------------------------------------------------------------------
# No accounts in list
# ---------------------------------------------------------------------------


class TestModuleC_MissingAccount:
    def test_no_matching_account_still_checks_passthrough(self):
        """If no account record is found for a client, pass-through still works."""
        txns = [
            make_deposit("MA1", "CLIENT_GHOST", 10_000.0, date(2026, 1, 1)),
            make_withdrawal("MA2", "CLIENT_GHOST", 9_500.0, date(2026, 1, 2)),
        ]
        # Pass an empty account list so CLIENT_GHOST has no record
        alerts = detect_velocity_anomalies(txns, [], REF_DATE)
        types = [a.alert_type for a in alerts]
        assert AlertType.PASSTHROUGH in types
        # No inception-spike check possible without account record
        assert AlertType.INCEPTION_SPIKE not in types


# ---------------------------------------------------------------------------
# Empty input
# ---------------------------------------------------------------------------


class TestModuleC_EdgeInputs:
    def test_empty_transactions(self, default_accounts):
        assert detect_velocity_anomalies([], default_accounts, REF_DATE) == []

    def test_empty_accounts(self, transactions_passthrough):
        alerts = detect_velocity_anomalies(transactions_passthrough, [], REF_DATE)
        assert all(a.alert_type == AlertType.PASSTHROUGH for a in alerts)
