from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from botocore.exceptions import ClientError

import lambda_function


def _base_payload(**overrides):
    payload = {
        "alertId": "aml-001",
        "detectedAt": "2026-02-03T10:20:30Z",
        "clientId": "client-789",
        "alertType": "LargeCashDeposit",
        "description": "Large cash deposit in 24h window",
        "reviewStatus": "Pending",
        "entityId": "entity-123",
        "sourceService": "aml-engine",
        "transactionId": "txn-321",
        "correlationId": "corr-abc",
        "riskScore": 87.5,
        "metadata": {"region": "SG"},
    }
    payload.update(overrides)
    return payload


def _record(message_id: str | None, body):
    record = {"body": body if isinstance(body, str) else json.dumps(body)}
    if message_id is not None:
        record["messageId"] = message_id
    return record


class FakeTable:
    def __init__(self, outcomes=None):
        self.items = []
        self.condition_expressions = []
        self._outcomes = list(outcomes or [])

    def put_item(self, Item, ConditionExpression):  # noqa: N803 - boto3 style
        self.items.append(Item)
        self.condition_expressions.append(ConditionExpression)
        if not self._outcomes:
            return {"ResponseMetadata": {"HTTPStatusCode": 200}}
        outcome = self._outcomes.pop(0)
        if outcome == "success":
            return {"ResponseMetadata": {"HTTPStatusCode": 200}}
        error_code = (
            "ConditionalCheckFailedException" if outcome == "duplicate" else outcome
        )
        raise ClientError(
            {
                "Error": {
                    "Code": error_code,
                    "Message": f"simulated {error_code}",
                }
            },
            "PutItem",
        )


class FakeDynamoResource:
    def __init__(self, table):
        self._table = table
        self.requested_table_names = []

    def Table(self, table_name):  # noqa: N802 - boto3 style
        self.requested_table_names.append(table_name)
        return self._table


def _install_fake_boto3(monkeypatch, table):
    resource = FakeDynamoResource(table)

    class FakeBoto3:
        @staticmethod
        def resource(service_name):
            assert service_name == "dynamodb"
            return resource

    monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)
    return resource


def test_valid_single_record_processing(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(outcomes=["success"])
    resource = _install_fake_boto3(monkeypatch, table)
    event = {"Records": [_record("msg-1", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert resource.requested_table_names == ["aml-alerts"]
    assert table.items[0]["pk"] == "AML#aml-001"
    assert table.items[0]["sk"] == "2026-02-03T10:20:30Z"
    assert table.condition_expressions == [lambda_function.CONDITIONAL_WRITE_EXPRESSION]


def test_valid_multi_record_processing(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(outcomes=["success", "success"])
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-1", _base_payload(alertId="aml-001")),
            _record("msg-2", _base_payload(alertId="aml-002")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert [item["pk"] for item in table.items] == ["AML#aml-001", "AML#aml-002"]


def test_malformed_json_is_non_retryable(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-bad-json", "{not-json")]}, None
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_missing_required_fields_is_non_retryable(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    payload = _base_payload()
    payload.pop("clientId")
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-missing", payload)]}, None
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_invalid_timestamp_is_non_retryable(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {
            "Records": [
                _record("msg-invalid-ts", _base_payload(detectedAt="invalid-ts"))
            ]
        },
        None,
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_invalid_review_status_enum_is_non_retryable(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {
            "Records": [
                _record(
                    "msg-invalid-status", _base_payload(reviewStatus="Investigating")
                )
            ]
        },
        None,
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_duplicate_idempotent_write_behavior(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(outcomes=["success", "duplicate"])
    _install_fake_boto3(monkeypatch, table)
    payload = _base_payload()

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-1", payload), _record("msg-2", payload)]}, None
    )

    assert response == {"batchItemFailures": []}
    assert len(table.items) == 2


def test_retryable_transient_failure_behavior(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(outcomes=["ProvisionedThroughputExceededException"])
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-retry", _base_payload())]}, None
    )

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-retry"}]}


def test_partial_batch_failure_response_shape(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(
        outcomes=[
            "success",
            "ProvisionedThroughputExceededException",
            "success",
        ]
    )
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-ok", _base_payload(alertId="aml-ok")),
            _record("msg-retry", _base_payload(alertId="aml-retry")),
            _record("msg-invalid", "{bad-json"),
            _record(None, _base_payload(alertId="aml-no-id")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-retry"}]}


def test_ttl_and_mapping_correctness():
    event = lambda_function.parse_and_validate_event(
        json.dumps(
            _base_payload(
                detectedAt="2026-03-01T18:30:00+08:00",
                transactionId=None,
                correlationId=None,
                riskScore=42,
            )
        )
    )
    now_utc = datetime(2026, 3, 1, 10, 30, 0, tzinfo=timezone.utc)
    item = lambda_function.map_event_to_dynamodb_item(
        event,
        ttl_days=30,
        now_utc=now_utc,
    )

    expected_ttl = int((now_utc + timedelta(days=30)).timestamp())
    assert item["pk"] == "AML#aml-001"
    assert item["sk"] == "2026-03-01T10:30:00Z"
    assert item["alert_id"] == "aml-001"
    assert item["review_status"] == "Pending"
    assert item["ttl"] == expected_ttl
    assert item["risk_score"] == 42
    assert "transaction_id" not in item
    assert "correlation_id" not in item


def test_invalid_optional_risk_score_is_non_retryable(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-invalid-risk", _base_payload(riskScore="high"))]},
        None,
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_missing_table_name_returns_retryable_failures(monkeypatch):
    monkeypatch.delenv("DYNAMODB_TABLE_NAME", raising=False)
    event = {
        "Records": [
            _record("msg-1", _base_payload()),
            _record(None, _base_payload(alertId="aml-no-id")),
            _record("msg-2", _base_payload(alertId="aml-002")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {
        "batchItemFailures": [
            {"itemIdentifier": "msg-1"},
            {"itemIdentifier": "msg-2"},
        ]
    }
