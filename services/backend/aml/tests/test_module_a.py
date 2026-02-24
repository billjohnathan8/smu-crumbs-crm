"""Tests for Module A: Statistical Outlier Detection (3-sigma rule)."""

from __future__ import annotations

from datetime import date


from lambda_function import (
    AlertType,
    detect_statistical_outliers,
)
from tests.mocks import MockHistoricalTransactionRepository
from tests.conftest import make_deposit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_repo() -> MockHistoricalTransactionRepository:
    repo = MockHistoricalTransactionRepository()
    repo.MOCK_HISTORY = {}
    return repo


def _repo_with(
    client_id: str, amounts: list[float]
) -> MockHistoricalTransactionRepository:
    repo = MockHistoricalTransactionRepository()
    repo.MOCK_HISTORY = {client_id: amounts}
    return repo


# ---------------------------------------------------------------------------
# Happy-path: clear outlier is flagged
# ---------------------------------------------------------------------------


class TestModuleA_OutlierFlagged:
    """A transaction far outside the client's baseline should be flagged."""

    def test_single_outlier_detected(
        self, transactions_outlier, historical_repo_outlier
    ):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert len(alerts) == 1

    def test_outlier_alert_type(self, transactions_outlier, historical_repo_outlier):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].alert_type == AlertType.STATISTICAL_OUTLIER

    def test_outlier_transaction_id(
        self, transactions_outlier, historical_repo_outlier
    ):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].transaction_id == "O004"

    def test_outlier_client_id(self, transactions_outlier, historical_repo_outlier):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].client_id == "CLIENT_OUTLIER"

    def test_alert_description_contains_sigma(
        self, transactions_outlier, historical_repo_outlier
    ):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert "3" in alerts[0].description and "σ" in alerts[0].description

    def test_review_status_is_pending(
        self, transactions_outlier, historical_repo_outlier
    ):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].review_status == "Pending"

    def test_non_outlier_transactions_not_flagged(
        self, transactions_outlier, historical_repo_outlier
    ):
        """Only the extreme outlier transaction should appear; the ~$200 ones must not."""
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        flagged_ids = [a.transaction_id for a in alerts]
        assert "O001" not in flagged_ids
        assert "O002" not in flagged_ids
        assert "O003" not in flagged_ids


# ---------------------------------------------------------------------------
# Normal activity: no alerts
# ---------------------------------------------------------------------------


class TestModuleA_NoFalsePositives:
    """Stable transactions within 3σ must not generate alerts."""

    def test_normal_transactions_no_alerts(
        self, transactions_normal, historical_repo_empty
    ):
        # transactions_normal has only 3 data points and no history, so std comes
        # from global baseline — all values are clustered; no extreme outliers.
        alerts = detect_statistical_outliers(transactions_normal, historical_repo_empty)
        assert len(alerts) == 0

    def test_uniform_amounts_no_alerts(self):
        """Perfectly uniform amounts → std = 0 → no z-score comparison is made."""
        txns = [
            make_deposit(f"U{i}", "CLIENT_UNIFORM", 500.0, date(2026, 1, i + 1))
            for i in range(6)
        ]
        repo = _repo_with("CLIENT_UNIFORM", [500.0, 500.0, 500.0, 500.0, 500.0])
        alerts = detect_statistical_outliers(txns, repo)
        assert len(alerts) == 0


# ---------------------------------------------------------------------------
# Thin-history fallback (global baseline)
# ---------------------------------------------------------------------------


class TestModuleA_ThinHistoryFallback:
    """When a client has < MIN_HISTORY_TRANSACTIONS samples, use global baseline."""

    def test_fallback_to_global_baseline(self):
        """A client with no history should still be checked against the global std."""
        # Build a batch where one client has nothing suspicious and one has a massive spike
        normal_txns = [
            make_deposit(
                f"G{i}", "CLIENT_GLOBAL", float(1000 + i * 10), date(2026, 1, i + 1)
            )
            for i in range(5)
        ]
        spike_txn = make_deposit(
            "SPIKE", "CLIENT_NEW_SPIKE", 999_999.0, date(2026, 1, 15)
        )
        all_txns = normal_txns + [spike_txn]

        repo = _empty_repo()
        alerts = detect_statistical_outliers(all_txns, repo)
        flagged_ids = [a.transaction_id for a in alerts]
        assert "SPIKE" in flagged_ids

    def test_client_with_just_enough_history_uses_own_baseline(self):
        """Exactly MIN_HISTORY_TRANSACTIONS combined samples → own baseline used."""
        from lambda_function import MIN_HISTORY_TRANSACTIONS

        # 2 current + 3 historical = 5 total (= MIN_HISTORY_TRANSACTIONS)
        txns = [
            make_deposit("H1", "CLIENT_H", 200.0, date(2026, 1, 1)),
            make_deposit("H2", "CLIENT_H", 210.0, date(2026, 1, 5)),
        ]
        repo = _repo_with("CLIENT_H", [195.0, 205.0, 200.0])  # 3 historical
        assert 2 + 3 == MIN_HISTORY_TRANSACTIONS

        # All values are tightly clustered → no outlier
        alerts = detect_statistical_outliers(txns, repo)
        assert len(alerts) == 0


# ---------------------------------------------------------------------------
# Multiple clients in same batch
# ---------------------------------------------------------------------------


class TestModuleA_MultipleClients:
    def test_only_outlier_client_flagged(self, historical_repo_outlier):
        """Multiple clients in the same batch: only the outlier one gets flagged."""
        outlier_txns = [
            make_deposit("O001", "CLIENT_OUTLIER", 190.0, date(2026, 1, 2)),
            make_deposit("O002", "CLIENT_OUTLIER", 205.0, date(2026, 1, 5)),
            make_deposit("O003", "CLIENT_OUTLIER", 195.0, date(2026, 1, 8)),
            make_deposit("O004", "CLIENT_OUTLIER", 50_000.0, date(2026, 1, 20)),
        ]
        normal_txns = [
            make_deposit("N001", "CLIENT_SAFE", 200.0, date(2026, 1, 3)),
            make_deposit("N002", "CLIENT_SAFE", 210.0, date(2026, 1, 7)),
            make_deposit("N003", "CLIENT_SAFE", 195.0, date(2026, 1, 12)),
        ]
        all_txns = outlier_txns + normal_txns

        repo = _repo_with("CLIENT_OUTLIER", [180.0, 190.0, 200.0, 205.0, 195.0])
        alerts = detect_statistical_outliers(all_txns, repo)

        client_ids = {a.client_id for a in alerts}
        assert "CLIENT_OUTLIER" in client_ids
        assert "CLIENT_SAFE" not in client_ids

    def test_multiple_outliers_in_same_client(self):
        """Two extreme outliers for the same client should each generate an alert."""
        txns = [
            make_deposit("M1", "CLIENT_M", 200.0, date(2026, 1, 1)),
            make_deposit("M2", "CLIENT_M", 205.0, date(2026, 1, 2)),
            make_deposit("BIG1", "CLIENT_M", 99_000.0, date(2026, 1, 10)),
            make_deposit("BIG2", "CLIENT_M", 98_000.0, date(2026, 1, 20)),
        ]
        history = [195.0, 200.0, 205.0, 198.0, 202.0]
        repo = _repo_with("CLIENT_M", history)
        alerts = detect_statistical_outliers(txns, repo)
        assert len(alerts) == 2
        assert {a.transaction_id for a in alerts} == {"BIG1", "BIG2"}


# ---------------------------------------------------------------------------
# Alert fields
# ---------------------------------------------------------------------------


class TestModuleA_AlertFields:
    def test_alert_has_unique_ids(self, transactions_outlier, historical_repo_outlier):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].alert_id  # non-empty
        # Run twice to confirm UUIDs differ
        alerts2 = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].alert_id != alerts2[0].alert_id

    def test_alert_detected_at_is_set(
        self, transactions_outlier, historical_repo_outlier
    ):
        alerts = detect_statistical_outliers(
            transactions_outlier, historical_repo_outlier
        )
        assert alerts[0].detected_at is not None
