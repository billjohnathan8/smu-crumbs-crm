from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from botocore.exceptions import ClientError

import lambda_function


def _base_payload(**overrides):
    payload = {
        "eventId": "evt-001",
        "occurredAt": "2026-02-03T10:20:30Z",
        "action": "UPDATE_PROFILE",
        "attributeName": "phone_number",
        "userId": "user-123",
        "clientId": "client-789",
        "sourceService": "profile-api",
        "beforeValue": "11111111",
        "afterValue": "99999999",
        "correlationId": "corr-abc",
        "requestId": "req-xyz",
        "metadata": {"channel": "web"},
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


@pytest.fixture(autouse=True)
def env_defaults(monkeypatch):
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "audit-events")
    monkeypatch.setenv("IDEMPOTENCY_TTL_DAYS", "90")
    monkeypatch.delenv("LOG_LEVEL", raising=False)


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
    table = FakeTable(outcomes=["success"])
    resource = _install_fake_boto3(monkeypatch, table)
    event = {"Records": [_record("msg-1", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert resource.requested_table_names == ["audit-events"]
    assert len(table.items) == 1
    assert table.items[0]["pk"] == "AUDIT#evt-001"
    assert table.items[0]["sk"] == "2026-02-03T10:20:30Z"
    assert table.condition_expressions == [lambda_function.CONDITIONAL_WRITE_EXPRESSION]


def test_valid_multi_record_processing(monkeypatch):
    table = FakeTable(outcomes=["success", "success"])
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [
            _record("msg-1", _base_payload(eventId="evt-001")),
            _record("msg-2", _base_payload(eventId="evt-002")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert [item["pk"] for item in table.items] == ["AUDIT#evt-001", "AUDIT#evt-002"]


def test_malformed_json_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {"Records": [_record("msg-bad-json", "{not-json")]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_missing_required_fields_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    payload = _base_payload()
    payload.pop("clientId")
    event = {"Records": [_record("msg-missing", payload)]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_invalid_timestamp_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {
        "Records": [_record("msg-invalid-ts", _base_payload(occurredAt="invalid-ts"))]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert table.items == []


def test_duplicate_idempotent_write_behavior(monkeypatch):
    table = FakeTable(outcomes=["success", "duplicate"])
    _install_fake_boto3(monkeypatch, table)
    payload = _base_payload()
    event = {"Records": [_record("msg-1", payload), _record("msg-2", payload)]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": []}
    assert len(table.items) == 2


def test_retryable_dynamodb_transient_failure(monkeypatch):
    table = FakeTable(outcomes=["ProvisionedThroughputExceededException"])
    _install_fake_boto3(monkeypatch, table)
    event = {"Records": [_record("msg-retry", _base_payload())]}

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-retry"}]}


def test_partial_batch_failure_response_shape(monkeypatch):
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
            _record("msg-ok", _base_payload(eventId="evt-ok")),
            _record("msg-retry", _base_payload(eventId="evt-retry")),
            _record("msg-invalid", "{bad-json"),
            _record(None, _base_payload(eventId="evt-no-id")),
        ]
    }

    response = lambda_function.lambda_handler(event, None)

    assert response == {"batchItemFailures": [{"itemIdentifier": "msg-retry"}]}


def test_ttl_generation_and_mapping_correctness():
    event = lambda_function.parse_and_validate_event(
        json.dumps(
            _base_payload(
                occurredAt="2026-03-01T18:30:00+08:00",
                beforeValue=None,
                afterValue="new-value",
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
    assert item["pk"] == "AUDIT#evt-001"
    assert item["sk"] == "2026-03-01T10:30:00Z"
    assert item["ttl"] == expected_ttl
    assert item["after_value"] == "new-value"
    assert "before_value" not in item


def test_non_object_json_body_is_non_retryable(monkeypatch):
    table = FakeTable()
    _install_fake_boto3(monkeypatch, table)
    event = {"Records": [_record("msg-list", json.dumps(["not", "an", "object"]))]}

    response = lambda_function.lambda_handler(event, None)

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
            _record("msg-blank-ts", _base_payload(occurredAt="   ")),
            _record(
                "msg-naive-ts",
                _base_payload(eventId="evt-naive", occurredAt="2026-03-01T10:30:00"),
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
            _record(None, _base_payload(eventId="evt-no-id")),
            _record("msg-2", _base_payload(eventId="evt-2")),
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
