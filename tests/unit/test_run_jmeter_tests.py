#!/usr/bin/env python3
"""
Unit tests for scripts/performance/run_jmeter_tests.py

Focused on error categorization logic added for P0 remediation.
"""

import csv
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile

# Add scripts/performance to path to import run_jmeter_tests
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "scripts" / "performance"))

from run_jmeter_tests import summarize_results_csv


def create_test_csv(rows: list) -> Path:
    """Create a temporary CSV file with JMeter results format."""
    # Use delete=False so file persists for reading
    temp = NamedTemporaryFile(mode="w", suffix=".csv", newline="", delete=False, encoding="utf-8")
    writer = csv.DictWriter(
        temp,
        fieldnames=[
            "timeStamp",
            "elapsed",
            "label",
            "responseCode",
            "responseMessage",
            "success",
            "allThreads",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    temp.close()
    return Path(temp.name)


def test_no_errors():
    """Test CSV with all successful requests."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "200",
            "responseMessage": "OK",
            "success": "true",
            "allThreads": "1",
        },
        {
            "timeStamp": "2000",
            "elapsed": "75",
            "label": "Test",
            "responseCode": "201",
            "responseMessage": "Created",
            "success": "true",
            "allThreads": "1",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["total_samples"] == 2.0
        assert result["errors"] == 0.0
        assert result["error_rate_pct"] == 0.0
        assert result["response_code_distribution"] == {"200": 1, "201": 1}
        assert result["error_categories"]["server_error_5xx"] == 0
        assert result["error_categories"]["timeout"] == 0
    finally:
        csv_path.unlink()


def test_server_errors_5xx():
    """Test CSV with 500-series errors."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "100",
            "label": "Test",
            "responseCode": "500",
            "responseMessage": "Internal Server Error",
            "success": "false",
            "allThreads": "10",
        },
        {
            "timeStamp": "2000",
            "elapsed": "150",
            "label": "Test",
            "responseCode": "502",
            "responseMessage": "Bad Gateway",
            "success": "false",
            "allThreads": "10",
        },
        {
            "timeStamp": "3000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "200",
            "responseMessage": "OK",
            "success": "true",
            "allThreads": "10",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["total_samples"] == 3.0
        assert result["errors"] == 2.0
        assert abs(result["error_rate_pct"] - 66.67) < 0.1
        assert result["response_code_distribution"]["500"] == 1
        assert result["response_code_distribution"]["502"] == 1
        assert result["response_code_distribution"]["200"] == 1
        assert result["error_categories"]["server_error_5xx"] == 2
        assert result["error_categories"]["timeout"] == 0
    finally:
        csv_path.unlink()


def test_client_errors_4xx():
    """Test CSV with 400-series errors."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "404",
            "responseMessage": "Not Found",
            "success": "false",
            "allThreads": "1",
        },
        {
            "timeStamp": "2000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "429",
            "responseMessage": "Too Many Requests",
            "success": "false",
            "allThreads": "1",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["total_samples"] == 2.0
        assert result["errors"] == 2.0
        assert result["error_categories"]["client_error_4xx"] == 2
        assert result["error_categories"]["server_error_5xx"] == 0
    finally:
        csv_path.unlink()


def test_timeouts():
    """Test CSV with timeout errors."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "30000",
            "label": "Test",
            "responseCode": "0",
            "responseMessage": "Read timed out",
            "success": "false",
            "allThreads": "50",
        },
        {
            "timeStamp": "2000",
            "elapsed": "30000",
            "label": "Test",
            "responseCode": "0",
            "responseMessage": "Connection timeout",
            "success": "false",
            "allThreads": "50",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["errors"] == 2.0
        assert result["error_categories"]["timeout"] == 2
        assert result["error_categories"]["server_error_5xx"] == 0
        assert result["response_code_distribution"]["0"] == 2
    finally:
        csv_path.unlink()


def test_connection_refused():
    """Test CSV with connection refused errors."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "10",
            "label": "Test",
            "responseCode": "Non HTTP response code",
            "responseMessage": "connection refused",
            "success": "false",
            "allThreads": "100",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["errors"] == 1.0
        assert result["error_categories"]["connection_refused"] == 1
    finally:
        csv_path.unlink()


def test_assertion_failure():
    """Test CSV with assertion failures."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "100",
            "label": "Test",
            "responseCode": "200",
            "responseMessage": "assertion failed: expected client id",
            "success": "false",
            "allThreads": "10",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["errors"] == 1.0
        assert result["error_categories"]["assertion_failure"] == 1
    finally:
        csv_path.unlink()


def test_mixed_errors():
    """Test CSV with a mix of error types."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "200",
            "responseMessage": "OK",
            "success": "true",
            "allThreads": "100",
        },
        {
            "timeStamp": "1100",
            "elapsed": "200",
            "label": "Test",
            "responseCode": "500",
            "responseMessage": "Internal Server Error",
            "success": "false",
            "allThreads": "100",
        },
        {
            "timeStamp": "1200",
            "elapsed": "30000",
            "label": "Test",
            "responseCode": "0",
            "responseMessage": "timeout",
            "success": "false",
            "allThreads": "100",
        },
        {
            "timeStamp": "1300",
            "elapsed": "10",
            "label": "Test",
            "responseCode": "",
            "responseMessage": "connection refused",
            "success": "false",
            "allThreads": "100",
        },
        {
            "timeStamp": "1400",
            "elapsed": "100",
            "label": "Test",
            "responseCode": "429",
            "responseMessage": "Rate limit exceeded",
            "success": "false",
            "allThreads": "100",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["total_samples"] == 5.0
        assert result["errors"] == 4.0
        assert result["error_rate_pct"] == 80.0
        assert result["error_categories"]["server_error_5xx"] == 1
        assert result["error_categories"]["client_error_4xx"] == 1
        assert result["error_categories"]["timeout"] == 1
        assert result["error_categories"]["connection_refused"] == 1
        assert result["error_categories"]["assertion_failure"] == 0
        assert result["error_categories"]["other"] == 0
    finally:
        csv_path.unlink()


def test_unknown_response_code():
    """Test CSV with missing response codes."""
    rows = [
        {
            "timeStamp": "1000",
            "elapsed": "50",
            "label": "Test",
            "responseCode": "",
            "responseMessage": "Unknown error",
            "success": "false",
            "allThreads": "1",
        },
    ]
    csv_path = create_test_csv(rows)
    try:
        result = summarize_results_csv(csv_path)
        assert result["response_code_distribution"]["unknown"] == 1
        assert result["error_categories"]["other"] == 1
    finally:
        csv_path.unlink()


if __name__ == "__main__":
    print("Running unit tests for run_jmeter_tests.py error categorization...")
    test_no_errors()
    print("PASS: test_no_errors")
    test_server_errors_5xx()
    print("PASS: test_server_errors_5xx")
    test_client_errors_4xx()
    print("PASS: test_client_errors_4xx")
    test_timeouts()
    print("PASS: test_timeouts")
    test_connection_refused()
    print("PASS: test_connection_refused")
    test_assertion_failure()
    print("PASS: test_assertion_failure")
    test_mixed_errors()
    print("PASS: test_mixed_errors")
    test_unknown_response_code()
    print("PASS: test_unknown_response_code")
    print("\nAll tests passed!")
