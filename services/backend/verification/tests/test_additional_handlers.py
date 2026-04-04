"""
Tests for CloudWatch alarm handling, client info updates, verification approvals/rejections.
These test the event handlers that were not previously covered.
"""

import json
import pytest

import lambda_function


class TestCloudWatchAlarmDetection:
    """Tests for _is_cloudwatch_alarm_message"""

    def test_detects_valid_cloudwatch_alarm_message(self):
        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
            "NewStateReason": "Threshold breached",
        }
        assert lambda_function._is_cloudwatch_alarm_message(message) is True

    def test_returns_false_when_missing_alarm_name(self):
        message = {
            "NewStateValue": "ALARM",
            "NewStateReason": "Threshold breached",
        }
        assert lambda_function._is_cloudwatch_alarm_message(message) is False

    def test_returns_false_when_missing_new_state_value(self):
        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateReason": "Threshold breached",
        }
        assert lambda_function._is_cloudwatch_alarm_message(message) is False

    def test_returns_false_when_missing_new_state_reason(self):
        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
        }
        assert lambda_function._is_cloudwatch_alarm_message(message) is False

    def test_returns_false_for_empty_message(self):
        assert lambda_function._is_cloudwatch_alarm_message({}) is False


class TestCloudWatchAlarmHandler:
    """Tests for _handle_cloudwatch_alarm"""

    def test_forwards_alarm_when_configured_correctly(self, monkeypatch):
        """Should send email when source email and recipients are configured"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "alerts@example.com")
        monkeypatch.setenv(
            "ALARM_FORWARD_TO_EMAILS", "ops@example.com,admin@example.com"
        )

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
            "NewStateReason": "CPU > 80%",
            "Region": "us-east-1",
            "AWSAccountId": "123456789012",
            "StateChangeTime": "2024-01-15T10:30:00Z",
        }

        result = lambda_function._handle_cloudwatch_alarm(message)

        assert result is True
        assert len(sent_emails) == 1
        assert "ops@example.com" in sent_emails[0]["Destination"]["ToAddresses"]
        assert "admin@example.com" in sent_emails[0]["Destination"]["ToAddresses"]
        assert "prod-db-cpu" in sent_emails[0]["Message"]["Subject"]["Data"]
        assert "ALARM" in sent_emails[0]["Message"]["Subject"]["Data"]

    def test_returns_false_when_no_recipients(self, monkeypatch):
        """Should return False when ALARM_FORWARD_TO_EMAILS is empty"""
        monkeypatch.delenv("ALARM_FORWARD_TO_EMAILS", raising=False)
        monkeypatch.setenv("SES_SOURCE_EMAIL", "alerts@example.com")

        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
            "NewStateReason": "CPU > 80%",
        }

        result = lambda_function._handle_cloudwatch_alarm(message)
        assert result is False

    def test_returns_false_when_no_source_email(self, monkeypatch):
        """Should return False when SES_SOURCE_EMAIL is not configured"""
        monkeypatch.delenv("SES_SOURCE_EMAIL", raising=False)
        monkeypatch.setenv("ALARM_FORWARD_TO_EMAILS", "ops@example.com")

        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
            "NewStateReason": "CPU > 80%",
        }

        result = lambda_function._handle_cloudwatch_alarm(message)
        assert result is False

    def test_returns_false_when_boto3_unavailable(self, monkeypatch):
        """Should return False when boto3 is not available"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "alerts@example.com")
        monkeypatch.setenv("ALARM_FORWARD_TO_EMAILS", "ops@example.com")
        monkeypatch.setattr(lambda_function, "boto3", None)

        message = {
            "AlarmName": "prod-db-cpu",
            "NewStateValue": "ALARM",
            "NewStateReason": "CPU > 80%",
        }

        result = lambda_function._handle_cloudwatch_alarm(message)
        assert result is False


class TestClientInfoUpdatedEmail:
    """Tests for _send_client_info_updated_email and _handle_client_info_updated"""

    def test_sends_client_info_updated_email(self, monkeypatch):
        """Should send email when all required fields are provided"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_client_info_updated_email(
            client_id="client-123",
            email="john@example.com",
            first_name="John",
            last_name="Doe",
            request_id="req-456",
        )

        assert len(sent_emails) == 1
        email = sent_emails[0]
        assert email["Destination"]["ToAddresses"] == ["john@example.com"]
        assert "John" in email["Message"]["Body"]["Html"]["Data"]
        assert "updated" in email["Message"]["Subject"]["Data"].lower()

    def test_uses_default_display_name_when_first_name_empty(self, monkeypatch):
        """Should use 'there' when first_name is empty"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_client_info_updated_email(
            client_id="client-123",
            email="john@example.com",
            first_name="",
            last_name="Doe",
            request_id="req-456",
        )

        assert len(sent_emails) == 1
        email_body = sent_emails[0]["Message"]["Body"]["Html"]["Data"]
        assert "Hi there" in email_body

    def test_raises_error_when_source_email_missing(self, monkeypatch):
        """Should raise ValueError when SES_SOURCE_EMAIL not configured"""
        monkeypatch.delenv("SES_SOURCE_EMAIL", raising=False)

        with pytest.raises(ValueError, match="SES_SOURCE_EMAIL"):
            lambda_function._send_client_info_updated_email(
                client_id="client-123",
                email="john@example.com",
                first_name="John",
                last_name="Doe",
                request_id="req-456",
            )

    def test_raises_error_when_boto3_unavailable(self, monkeypatch):
        """Should raise RuntimeError when boto3 not available"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setattr(lambda_function, "boto3", None)

        with pytest.raises(RuntimeError, match="boto3"):
            lambda_function._send_client_info_updated_email(
                client_id="client-123",
                email="john@example.com",
                first_name="John",
                last_name="Doe",
                request_id="req-456",
            )

    def test_handles_client_info_updated_with_valid_message(self, monkeypatch):
        """Handler should extract message fields and call send function"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        message = {
            "clientId": "client-789",
            "email": "jane@example.com",
            "firstName": "Jane",
            "lastName": "Smith",
            "requestId": "req-101",
        }

        lambda_function._handle_client_info_updated(message)

        assert len(sent_emails) == 1
        assert sent_emails[0]["Destination"]["ToAddresses"] == ["jane@example.com"]

    def test_skips_when_client_id_missing(self, monkeypatch, caplog):
        """Handler should skip when clientId is missing"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setattr(lambda_function, "boto3", None)

        message = {
            "email": "jane@example.com",
            "firstName": "Jane",
            "lastName": "Smith",
        }

        lambda_function._handle_client_info_updated(message)

        assert "missing clientid or email" in caplog.text.lower()

    def test_skips_when_email_missing(self, monkeypatch, caplog):
        """Handler should skip when email is missing"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")
        monkeypatch.setattr(lambda_function, "boto3", None)

        message = {
            "clientId": "client-789",
            "firstName": "Jane",
            "lastName": "Smith",
        }

        lambda_function._handle_client_info_updated(message)

        assert "missing clientid or email" in caplog.text.lower()


class TestVerificationApprovedEmail:
    """Tests for _send_verification_approved_email and _handle_verification_approved"""

    def test_sends_verification_approved_email(self, monkeypatch):
        """Should send approval email when all required fields provided"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_approved_email(
            client_id="client-123",
            email="john@example.com",
            first_name="John",
            last_name="Doe",
            request_id="req-456",
        )

        assert len(sent_emails) == 1
        email = sent_emails[0]
        assert email["Destination"]["ToAddresses"] == ["john@example.com"]
        assert "approved" in email["Message"]["Subject"]["Data"].lower()
        assert "verified" in email["Message"]["Body"]["Html"]["Data"].lower()

    def test_handles_verification_approved_event(self, monkeypatch):
        """Handler should extract message fields and send approval email"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        message = {
            "clientId": "client-789",
            "email": "jane@example.com",
            "firstName": "Jane",
            "lastName": "Smith",
            "requestId": "req-101",
        }

        lambda_function._handle_verification_approved(message)

        assert len(sent_emails) == 1
        assert "approved" in sent_emails[0]["Message"]["Subject"]["Data"].lower()


class TestVerificationRejectedEmail:
    """Tests for _send_verification_rejected_email and _handle_verification_rejected"""

    def test_sends_verification_rejected_email(self, monkeypatch):
        """Should send rejection email when all required fields provided"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        lambda_function._send_verification_rejected_email(
            client_id="client-123",
            email="john@example.com",
            first_name="John",
            last_name="Doe",
            request_id="req-456",
        )

        assert len(sent_emails) == 1
        email = sent_emails[0]
        assert email["Destination"]["ToAddresses"] == ["john@example.com"]
        assert "requires attention" in email["Message"]["Subject"]["Data"].lower()
        assert "unable to verify" in email["Message"]["Body"]["Html"]["Data"].lower()

    def test_handles_verification_rejected_event(self, monkeypatch):
        """Handler should extract message fields and send rejection email"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        message = {
            "clientId": "client-789",
            "email": "jane@example.com",
            "firstName": "Jane",
            "lastName": "Smith",
            "requestId": "req-101",
        }

        lambda_function._handle_verification_rejected(message)

        assert len(sent_emails) == 1
        assert (
            "requires attention" in sent_emails[0]["Message"]["Subject"]["Data"].lower()
        )


class TestLambdaHandlerWithNewEventTypes:
    """Integration tests for lambda_handler with new event types"""

    def test_lambda_handler_processes_client_info_updated_event(self, monkeypatch):
        """Should process CLIENT_INFO_UPDATED event and return success"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        event = {
            "Records": [
                {
                    "Sns": {
                        "Message": json.dumps(
                            {
                                "eventType": "CLIENT_INFO_UPDATED",
                                "clientId": "client-123",
                                "email": "john@example.com",
                                "firstName": "John",
                            }
                        )
                    }
                }
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1
        assert len(sent_emails) == 1

    def test_lambda_handler_processes_verification_approved_event(self, monkeypatch):
        """Should process VERIFICATION_APPROVED event and return success"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        event = {
            "Records": [
                {
                    "Sns": {
                        "Message": json.dumps(
                            {
                                "eventType": "VERIFICATION_APPROVED",
                                "clientId": "client-123",
                                "email": "john@example.com",
                                "firstName": "John",
                            }
                        )
                    }
                }
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1

    def test_lambda_handler_processes_verification_rejected_event(self, monkeypatch):
        """Should process VERIFICATION_REJECTED event and return success"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        event = {
            "Records": [
                {
                    "Sns": {
                        "Message": json.dumps(
                            {
                                "eventType": "VERIFICATION_REJECTED",
                                "clientId": "client-456",
                                "email": "jane@example.com",
                                "firstName": "Jane",
                            }
                        )
                    }
                }
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1

    def test_lambda_handler_processes_cloudwatch_alarm_event(self, monkeypatch):
        """Should process CloudWatch alarm event and return success"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "alerts@example.com")
        monkeypatch.setenv("ALARM_FORWARD_TO_EMAILS", "ops@example.com")

        sent_emails = []

        class FakeSESClient:
            def send_email(self, **kwargs):
                sent_emails.append(kwargs)

        class FakeBoto3:
            @staticmethod
            def client(name):
                if name == "ses":
                    return FakeSESClient()
                raise ValueError(f"Unknown service: {name}")

        monkeypatch.setattr(lambda_function, "boto3", FakeBoto3)

        event = {
            "Records": [
                {
                    "Sns": {
                        "Message": json.dumps(
                            {
                                "AlarmName": "prod-db-cpu",
                                "NewStateValue": "ALARM",
                                "NewStateReason": "CPU > 80%",
                                "Region": "us-east-1",
                                "AWSAccountId": "123456789012",
                            }
                        )
                    }
                }
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        body = json.loads(response["body"])

        assert response["statusCode"] == 200
        assert body["updated"] == 1
        assert len(sent_emails) == 1

    def test_lambda_handler_handles_missing_client_id_or_email(
        self, monkeypatch, caplog
    ):
        """Should handle events with missing clientId or email gracefully"""
        monkeypatch.setenv("SES_SOURCE_EMAIL", "noreply@example.com")

        event = {
            "Records": [
                {
                    "Sns": {
                        "Message": json.dumps(
                            {
                                "eventType": "CLIENT_INFO_UPDATED",
                                "email": "john@example.com",
                            }
                        )
                    }
                }
            ]
        }

        response = lambda_function.lambda_handler(event, None)
        assert response["statusCode"] == 200
        assert "missing clientid or email" in caplog.text.lower()
