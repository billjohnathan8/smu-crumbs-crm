"""Tests for Module B: Structuring (Smurfing) Detection."""

from __future__ import annotations

from datetime import date, timedelta

from lambda_function import (
    AlertType,
    STRUCTURING_MIN_AMOUNT,
    STRUCTURING_THRESHOLD,
    STRUCTURING_WINDOW_DAYS,
    detect_structuring,
)
from tests.conftest import make_deposit, make_withdrawal


# ---------------------------------------------------------------------------
# Happy-path: classic structuring pattern
# ---------------------------------------------------------------------------


class TestModuleB_StructuringFlagged:
    """Three deposits within a week that together exceed $10,000 must be flagged."""

    def test_structuring_detected(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        assert len(alerts) >= 1

    def test_alert_type_is_structuring(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        assert alerts[0].alert_type == AlertType.STRUCTURING

    def test_alert_client_id(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        assert alerts[0].client_id == "CLIENT_SMURF"

    def test_alert_transaction_ids_included(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        txn_ids_in_alert = alerts[0].transaction_id or ""
        assert "S001" in txn_ids_in_alert
        assert "S002" in txn_ids_in_alert
        assert "S003" in txn_ids_in_alert

    def test_review_status_is_pending(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        assert alerts[0].review_status == "Pending"

    def test_description_mentions_threshold(self, transactions_structuring):
        alerts = detect_structuring(transactions_structuring)
        desc = alerts[0].description
        # Description should reference number of transactions or the cumulative total
        assert "structuring" in desc.lower() or str(STRUCTURING_THRESHOLD) in desc


# ---------------------------------------------------------------------------
# Boundary: exactly at threshold vs. just below
# ---------------------------------------------------------------------------


class TestModuleB_BoundaryConditions:
    def test_exactly_at_threshold_is_flagged(self):
        """Cumulative deposits == STRUCTURING_THRESHOLD should be flagged (>=)."""
        txns = [
            make_deposit(
                "B1", "CLIENT_BOUNDARY", STRUCTURING_MIN_AMOUNT, date(2026, 1, 1)
            ),
            make_deposit(
                "B2",
                "CLIENT_BOUNDARY",
                STRUCTURING_THRESHOLD - STRUCTURING_MIN_AMOUNT,
                date(2026, 1, 2),
            ),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 1

    def test_just_below_threshold_not_flagged(self):
        """Cumulative just under threshold must not be flagged."""
        txns = [
            make_deposit(
                "C1", "CLIENT_BELOW", STRUCTURING_MIN_AMOUNT, date(2026, 1, 1)
            ),
            make_deposit(
                "C2",
                "CLIENT_BELOW",
                STRUCTURING_THRESHOLD - STRUCTURING_MIN_AMOUNT - 0.01,
                date(2026, 1, 2),
            ),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0

    def test_individual_deposit_at_or_above_threshold_excluded(self):
        """A deposit >= STRUCTURING_THRESHOLD is NOT suspicious.

        It is reported outright.
        """
        txns = [
            make_deposit("X1", "CLIENT_LARGE", STRUCTURING_THRESHOLD, date(2026, 1, 1)),
            make_deposit(
                "X2", "CLIENT_LARGE", STRUCTURING_THRESHOLD + 500, date(2026, 1, 2)
            ),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0

    def test_individual_deposit_below_min_amount_excluded(self):
        """Individual deposits below STRUCTURING_MIN_AMOUNT are not candidates."""
        # Each individual amount is below the minimum; even if cumulative > 10k,
        # these are not suspicious structured deposits.
        txns = [
            make_deposit(
                f"L{i}",
                "CLIENT_LOW",
                STRUCTURING_MIN_AMOUNT - 1.0,
                date(2026, 1, i + 1),
            )
            for i in range(5)
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0


# ---------------------------------------------------------------------------
# Window boundary
# ---------------------------------------------------------------------------


class TestModuleB_WindowBoundary:
    def test_deposits_outside_window_not_grouped(self):
        """Deposits separated by more than STRUCTURING_WINDOW_DAYS must not combine."""
        txns = [
            make_deposit("W1", "CLIENT_WIDE", 5_000.0, date(2026, 1, 1)),
            # Second deposit is 8 days later → outside the 7-day window
            make_deposit("W2", "CLIENT_WIDE", 5_500.0, date(2026, 1, 9)),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0

    def test_deposit_on_last_day_of_window_included(self):
        """A deposit exactly at day STRUCTURING_WINDOW_DAYS.

        Must be included in the window.
        """
        anchor_date = date(2026, 1, 1)
        last_day = anchor_date + timedelta(days=STRUCTURING_WINDOW_DAYS)
        txns = [
            make_deposit("WL1", "CLIENT_EDGE", 5_000.0, anchor_date),
            make_deposit("WL2", "CLIENT_EDGE", 5_500.0, last_day),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 1


# ---------------------------------------------------------------------------
# Withdrawals do not trigger structuring
# ---------------------------------------------------------------------------


class TestModuleB_WithdrawalsIgnored:
    def test_withdrawals_not_counted(self):
        """Only deposits matter for structuring detection.

        Withdrawals must be ignored.
        """
        txns = [
            make_withdrawal("WD1", "CLIENT_WD", 4_000.0, date(2026, 1, 1)),
            make_withdrawal("WD2", "CLIENT_WD", 4_000.0, date(2026, 1, 2)),
            make_withdrawal("WD3", "CLIENT_WD", 4_000.0, date(2026, 1, 3)),
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0

    def test_mixed_deposits_and_withdrawals_only_deposits_evaluated(self):
        """Withdrawals interspersed with deposits.

        Must not inflate the cumulative total.
        """
        txns = [
            make_deposit("MD1", "CLIENT_MIX", 4_000.0, date(2026, 1, 1)),
            make_withdrawal("MW1", "CLIENT_MIX", 4_000.0, date(2026, 1, 2)),
            make_deposit("MD2", "CLIENT_MIX", 3_500.0, date(2026, 1, 3)),
            # Cumulative deposits = 7,500 < 10,000 → should NOT flag
        ]
        alerts = detect_structuring(txns)
        assert len(alerts) == 0


# ---------------------------------------------------------------------------
# Multiple clients
# ---------------------------------------------------------------------------


class TestModuleB_MultipleClients:
    def test_only_structuring_client_flagged(self, transactions_structuring):
        normal = [
            make_deposit("N1", "CLIENT_CLEAN", 1_000.0, date(2026, 1, 1)),
            make_deposit("N2", "CLIENT_CLEAN", 800.0, date(2026, 1, 5)),
        ]
        all_txns = transactions_structuring + normal
        alerts = detect_structuring(all_txns)
        client_ids = {a.client_id for a in alerts}
        assert "CLIENT_SMURF" in client_ids
        assert "CLIENT_CLEAN" not in client_ids

    def test_two_clients_both_structuring(self):
        """Two different clients performing structuring both get flagged."""
        txns = [
            make_deposit("A1", "SMURF_A", 4_000.0, date(2026, 1, 1)),
            make_deposit("A2", "SMURF_A", 3_500.0, date(2026, 1, 2)),
            make_deposit("A3", "SMURF_A", 3_200.0, date(2026, 1, 4)),
            make_deposit("B1", "SMURF_B", 5_000.0, date(2026, 1, 1)),
            make_deposit("B2", "SMURF_B", 5_500.0, date(2026, 1, 3)),
        ]
        alerts = detect_structuring(txns)
        client_ids = {a.client_id for a in alerts}
        assert "SMURF_A" in client_ids
        assert "SMURF_B" in client_ids


# ---------------------------------------------------------------------------
# No duplicate alerts for same transaction set
# ---------------------------------------------------------------------------


class TestModuleB_NoDuplicates:
    def test_no_duplicate_alerts_for_same_transactions(self, transactions_structuring):
        """Once a group of transactions is flagged.

        It must not appear in a second alert.
        """
        alerts = detect_structuring(transactions_structuring)
        # Collect all transaction IDs across all alerts
        all_flagged_ids: list[str] = []
        for a in alerts:
            if a.transaction_id:
                all_flagged_ids.extend(a.transaction_id.split(","))
        # No transaction ID should appear more than once
        assert len(all_flagged_ids) == len(set(all_flagged_ids))


# ---------------------------------------------------------------------------
# Empty / minimal inputs
# ---------------------------------------------------------------------------


class TestModuleB_EdgeInputs:
    def test_empty_transactions(self):
        assert detect_structuring([]) == []

    def test_single_deposit_below_threshold(self):
        txns = [make_deposit("SOLO", "CLIENT_SOLO", 5_000.0, date(2026, 1, 1))]
        assert detect_structuring(txns) == []
