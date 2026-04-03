from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from botocore.exceptions import ClientError

import lambda_function


def _base_payload(**overrides):
    payload = {
        "alertId": "aml_001",
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


@pytest.fixture(autouse=True)
def env_defaults(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    monkeypatch.setenv("IDEMPOTENCY_TTL_DAYS", "90")
    monkeypatch.delenv("LOG_LEVEL", raising=False)


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
    assert table.items[0]["pk"] == "AML#aml_001"
    assert table.items[0]["sk"] == "2026-02-03T10:20:30Z"
    assert table.condition_expressions == [lambda_function.CONDITIONAL_WRITE_EXPRESSION]


def test_valid_multi_record_processing(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "aml-alerts")
    table = FakeTable(outcomes=["success", "success"])
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-1", _base_payload(alertId="aml_001")),
            _record("msg-2", _base_payload(alertId="aml_002")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert [item["pk"] for item in table.items] == ["AML#aml_001", "AML#aml_002"]


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
            _record("msg-ok", _base_payload(alertId="aml_1001")),
            _record("msg-retry", _base_payload(alertId="aml_1002")),
            _record("msg-invalid", "{bad-json"),
            _record(None, _base_payload(alertId="aml_1003")),
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
    assert item["pk"] == "AML#aml_001"
    assert item["sk"] == "2026-03-01T10:30:00Z"
    assert item["alert_id"] == "aml_001"
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


def test_non_object_json_body_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)

    response = lambda_function.lambda_handler(
        {"Records": [_record("msg-list", json.dumps(["not", "an", "object"]))]},
        None,
    )

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_invalid_optional_and_metadata_fields_are_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-bad-opt", _base_payload(correlationId=" ")),
            _record("msg-bad-meta", _base_payload(metadata="not-a-dict")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_blank_and_naive_timestamps(monkeypatch):
    table = FakeTable(outcomes=["success"])
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-blank-ts", _base_payload(detectedAt="   ")),
            _record(
                "msg-naive-ts",
                _base_payload(alertId="aml_1004", detectedAt="2026-03-01T10:30:00"),
            ),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert len(table.items) == 1
    assert table.items[0]["sk"] == "2026-03-01T10:30:00Z"


def test_non_string_body_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {"Records": [{"messageId": "msg-nonstr", "body": {"raw": "object"}}]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_retryable_generic_persistence_error(monkeypatch):
    class ExplodingTable:
        def put_item(self, Item, ConditionExpression):  # noqa: N803 - boto3 style
            raise RuntimeError("unexpected failure")

    _install_fake_boto3(monkeypatch, ExplodingTable())
    event = {"Records": [_record("msg-generic-retry", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-generic-retry"}]}


def test_unexpected_exception_in_process_record_is_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    monkeypatch.setattr(
        lambda_function,
        "parse_and_validate_event",
        lambda _body: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    event = {"Records": [_record("msg-unexpected", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-unexpected"}]}


@pytest.mark.parametrize("ttl_env", ["not-an-int", "0", "-7"])
def test_idempotency_ttl_env_fallbacks(monkeypatch, ttl_env):
    table = FakeTable(outcomes=["success"])
    _install_fake_boto3(monkeypatch, table)
    monkeypatch.setenv("IDEMPOTENCY_TTL_DAYS", ttl_env)
    event = {"Records": [_record("msg-ttl-fallback", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert len(table.items) == 1


def test_missing_table_name_returns_retryable_failures(monkeypatch):
    monkeypatch.delenv("DYNAMODB_TABLE_NAME", raising=False)
    event = {
        "Records": [
            _record("msg-1", _base_payload()),
            _record(None, _base_payload(alertId="aml_1003")),
            _record("msg-2", _base_payload(alertId="aml_002")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {
        "batchItemFailures": [
            {"itemIdentifier": "msg-1"},
            {"itemIdentifier": "msg-2"},
        ]
    }


def test_non_list_records_treated_as_empty(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {"Records": "not-a-list"}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []
