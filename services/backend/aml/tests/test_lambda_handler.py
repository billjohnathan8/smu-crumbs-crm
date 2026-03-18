"""
Integration tests for parse_transactions_csv, create_log_entry_for_alert,
run_aml_engine, and lambda_handler.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

import pytest

from lambda_function import (
    AlertType,
    AMLAlert,
    LogAction,
    TransactionStatus,
    TransactionType,
    create_log_entry_for_alert,
    lambda_handler,
    parse_transactions_csv,
    run_aml_engine,
)
from tests.mocks import (
    MockAccountRepository,
    MockCRMWriteClient,
    MockHistoricalTransactionRepository,
    MockSFTPClient,
)
from tests.conftest import REF_DATE


# ---------------------------------------------------------------------------
# parse_transactions_csv
# ---------------------------------------------------------------------------


class TestParseTransactionsCsv:
    VALID_CSV = (
        "transaction_id,client_id,transaction_type,amount,date,status\n"
        "TXN001,CLIENT_A,D,1000.00,2026-01-05,Completed\n"
        "TXN002,CLIENT_A,W,500.00,2026-01-10,Pending\n"
    )

    def test_parses_correct_number_of_rows(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert len(txns) == 2

    def test_parses_deposit_type(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert txns[0].transaction_type == TransactionType.DEPOSIT

    def test_parses_withdrawal_type(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert txns[1].transaction_type == TransactionType.WITHDRAWAL

    def test_parses_amount_as_float(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert txns[0].amount == 1000.0

    def test_parses_date(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert txns[0].date == date(2026, 1, 5)

    def test_parses_status(self):
        txns = parse_transactions_csv(self.VALID_CSV)
        assert txns[1].status == TransactionStatus.PENDING

    def test_skips_malformed_rows(self):
        csv_with_bad_row = (
            "transaction_id,client_id,transaction_type,amount,date,status\n"
            "TXN001,CLIENT_A,D,1000.00,2026-01-05,Completed\n"
            "BAD_ROW,,,NOT_A_FLOAT,not-a-date,Unknown\n"
            "TXN003,CLIENT_A,W,200.00,2026-01-07,Completed\n"
        )
        txns = parse_transactions_csv(csv_with_bad_row)
        assert len(txns) == 2

    def test_empty_csv_returns_empty_list(self):
        assert parse_transactions_csv("") == []

    def test_header_only_returns_empty_list(self):
        header = "transaction_id,client_id,transaction_type,amount,date,status"
        assert parse_transactions_csv(header) == []

    def test_whitespace_stripped_from_fields(self):
        csv_padded = (
            "transaction_id,client_id,transaction_type,amount,date,status\n"
            " TXN001 , CLIENT_A , D ,1000.00, 2026-01-05 , Completed \n"
        )
        txns = parse_transactions_csv(csv_padded)
        assert len(txns) == 1
        assert txns[0].transaction_id == "TXN001"
        assert txns[0].client_id == "CLIENT_A"

    def test_mock_sftp_csv_fully_parseable(self):
        csv_content = MockSFTPClient().MOCK_CSV
        txns = parse_transactions_csv(csv_content)
        assert len(txns) == 20  # All 20 mock rows should parse cleanly


# ---------------------------------------------------------------------------
# create_log_entry_for_alert
# ---------------------------------------------------------------------------


class TestCreateLogEntry:
    @pytest.fixture()
    def sample_alert(self) -> AMLAlert:
        return AMLAlert(
            alert_id="test-alert-uuid",
            client_id="CLIENT_TEST",
            transaction_id="TXN_TEST",
            alert_type=AlertType.STATISTICAL_OUTLIER,
            description="Test description.",
            detected_at=datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc),
        )

    def test_log_action_is_create(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.action == LogAction.CREATE

    def test_log_attribute_name(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.attribute_name == "AML_ALERT"

    def test_log_before_value_is_none(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.before_value is None

    def test_log_after_value_contains_alert_id(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        after = json.loads(log.after_value)
        assert after["alertId"] == "test-alert-uuid"

    def test_log_after_value_contains_alert_type(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        after = json.loads(log.after_value)
        assert after["alertType"] == AlertType.STATISTICAL_OUTLIER.value

    def test_log_user_id_is_system(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.user_id == "SYSTEM_AML"

    def test_log_client_id_matches_alert(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.client_id == "CLIENT_TEST"

    def test_log_correlation_id_matches_alert_id(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.correlation_id == "test-alert-uuid"

    def test_log_datetime_matches_alert(self, sample_alert):
        log = create_log_entry_for_alert(sample_alert)
        assert log.date_time == sample_alert.detected_at

    def test_log_id_is_unique(self, sample_alert):
        log1 = create_log_entry_for_alert(sample_alert)
        log2 = create_log_entry_for_alert(sample_alert)
        assert log1.log_id != log2.log_id


# ---------------------------------------------------------------------------
# run_aml_engine — integration
# ---------------------------------------------------------------------------


class TestRunAmlEngine:
    """End-to-end engine using mock data; validates summary structure + CRM writes."""

    @pytest.fixture()
    def engine_result(self, crm_client):
        sftp = MockSFTPClient()
        txns = parse_transactions_csv(sftp.MOCK_CSV)
        accounts = MockAccountRepository().get_accounts()
        hist_repo = MockHistoricalTransactionRepository()
        return (
            run_aml_engine(txns, accounts, hist_repo, crm_client, REF_DATE),
            crm_client,
        )

    def test_summary_has_required_keys(self, engine_result):
        summary, _ = engine_result
        assert "totalTransactionsProcessed" in summary
        assert "totalAlertsGenerated" in summary
        assert "alertsByType" in summary
        assert "alerts" in summary

    def test_processed_count_matches_csv(self, engine_result):
        summary, _ = engine_result
        assert summary["totalTransactionsProcessed"] == 20

    def test_total_alerts_matches_list_length(self, engine_result):
        summary, _ = engine_result
        assert summary["totalAlertsGenerated"] == len(summary["alerts"])

    def test_alerts_by_type_sums_to_total(self, engine_result):
        summary, _ = engine_result
        type_sum = sum(summary["alertsByType"].values())
        assert type_sum == summary["totalAlertsGenerated"]

    def test_at_least_one_statistical_outlier(self, engine_result):
        summary, _ = engine_result
        assert summary["alertsByType"][AlertType.STATISTICAL_OUTLIER.value] >= 1

    def test_at_least_one_structuring_alert(self, engine_result):
        summary, _ = engine_result
        assert summary["alertsByType"][AlertType.STRUCTURING.value] >= 1

    def test_at_least_one_passthrough_alert(self, engine_result):
        summary, _ = engine_result
        assert summary["alertsByType"][AlertType.PASSTHROUGH.value] >= 1

    def test_at_least_one_inception_spike(self, engine_result):
        summary, _ = engine_result
        assert summary["alertsByType"][AlertType.INCEPTION_SPIKE.value] >= 1

    def test_crm_alerts_written(self, engine_result):
        summary, crm = engine_result
        assert len(crm.written_alerts) == summary["totalAlertsGenerated"]

    def test_crm_logs_written(self, engine_result):
        """One log entry must be created per alert."""
        summary, crm = engine_result
        assert len(crm.written_logs) == summary["totalAlertsGenerated"]

    def test_alert_fields_present(self, engine_result):
        summary, _ = engine_result
        for alert in summary["alerts"]:
            assert "alertId" in alert
            assert "clientId" in alert
            assert "alertType" in alert
            assert "description" in alert
            assert "detectedAt" in alert
            assert "reviewStatus" in alert

    def test_all_alerts_start_as_pending(self, engine_result):
        summary, _ = engine_result
        assert all(a["reviewStatus"] == "Pending" for a in summary["alerts"])

    def test_no_alerts_for_normal_clients(self, crm_client):
        """CLIENT_B and CLIENT_F in the mock CSV should produce zero alerts."""
        sftp = MockSFTPClient()
        txns = parse_transactions_csv(sftp.MOCK_CSV)
        accounts = MockAccountRepository().get_accounts()
        hist_repo = MockHistoricalTransactionRepository()
        summary = run_aml_engine(txns, accounts, hist_repo, crm_client, REF_DATE)
        alert_clients = {a["clientId"] for a in summary["alerts"]}
        assert "CLIENT_B" not in alert_clients
        assert "CLIENT_F" not in alert_clients


# ---------------------------------------------------------------------------
# lambda_handler — smoke tests
# ---------------------------------------------------------------------------


class TestLambdaHandler:
    @pytest.fixture(autouse=True)
    def _inject_mocks(self, monkeypatch):
        """Patch _create_clients so lambda_handler uses mocks, not real clients."""
        monkeypatch.setattr(
            "lambda_function._create_clients",
            lambda: (
                MockSFTPClient(),
                MockAccountRepository(),
                MockHistoricalTransactionRepository(),
                MockCRMWriteClient(),
            ),
        )

    def test_returns_200_status(self):
        result = lambda_handler({}, None)
        assert result["statusCode"] == 200

    def test_body_is_valid_json(self):
        result = lambda_handler({}, None)
        body = json.loads(result["body"])
        assert isinstance(body, dict)

    def test_body_contains_summary_keys(self):
        result = lambda_handler({}, None)
        body = json.loads(result["body"])
        assert "totalTransactionsProcessed" in body
        assert "totalAlertsGenerated" in body

    def test_handler_idempotent(self):
        """Calling the handler twice should produce the same processed count."""
        r1 = lambda_handler({}, None)
        r2 = lambda_handler({}, None)
        b1 = json.loads(r1["body"])
        b2 = json.loads(r2["body"])
        assert b1["totalTransactionsProcessed"] == b2["totalTransactionsProcessed"]

    def test_handler_accepts_arbitrary_event(self):
        """Lambda should not crash regardless of the event payload it receives."""
        event = {"source": "aws.events", "detail-type": "Scheduled Event", "detail": {}}
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

    def test_sftp_remote_path_env_var_accepted(self, monkeypatch):
        """Setting SFTP_REMOTE_PATH should not break the handler (it is forwarded to the mock)."""
        monkeypatch.setenv("SFTP_REMOTE_PATH", "/custom/path/transactions.csv")
        result = lambda_handler({}, None)
        assert result["statusCode"] == 200
