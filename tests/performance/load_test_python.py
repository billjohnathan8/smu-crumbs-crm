#!/usr/bin/env python3
"""
Python-based load test for CS301 CRM - Alternative to JMeter
Tests 100 concurrent agents performing CRUD operations

Requirements:
    pip install requests

Usage:
    python tests/performance/load_test_python.py
"""
import concurrent.futures
import json
import os
import time
import statistics
import random
from dataclasses import dataclass
from typing import List, Dict, Tuple
import requests


@dataclass
class TestResult:
    endpoint: str
    status_code: int
    elapsed_ms: float
    success: bool
    error_message: str = ""


class AgentCRUDWorkflow:
    """Simulates an agent performing CRUD operations"""

    def __init__(self, agent_id: int, base_url: str):
        self.agent_id = agent_id
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.client_id = None

    def run_workflow(self) -> List[TestResult]:
        """Execute full CRUD workflow: login -> create -> read -> create account -> read transactions"""
        results = []

        # 1. Login
        result = self._login()
        results.append(result)
        if not result.success:
            return results  # Stop if login fails

        # 2. Create client
        result = self._create_client()
        results.append(result)
        if not result.success:
            return results  # Stop if creation fails

        # 3. Get client
        result = self._get_client()
        results.append(result)

        # 4. Create account
        result = self._create_account()
        results.append(result)

        # 5. Get transactions
        result = self._get_transactions()
        results.append(result)

        return results

    def _make_request(self, method: str, endpoint: str, json_data: Dict = None,
                      timeout: int = 30) -> Tuple[int, float, str, any]:
        """Make HTTP request and return (status_code, elapsed_ms, error_msg, response_obj)"""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        try:
            start = time.time()
            resp = None
            if method == "GET":
                resp = self.session.get(url, headers=headers, timeout=timeout)
            elif method == "POST":
                # Important: use json parameter, not data
                resp = self.session.post(url, json=json_data, headers=headers, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
            elapsed_ms = (time.time() - start) * 1000

            return resp.status_code, elapsed_ms, "", resp
        except requests.exceptions.Timeout:
            elapsed_ms = timeout * 1000
            return 0, elapsed_ms, "Request timeout", None
        except Exception as e:
            return 0, 0, str(e), None

    def _login(self) -> TestResult:
        """Login as admin (has permission to create clients)"""
        password = os.environ.get("E2E_ADMIN_PASSWORD", "").strip()
        if not password:
            raise RuntimeError(
                "Set E2E_ADMIN_PASSWORD in the environment (see repository .env.example)."
            )
        payload = {
            "email": "admin@crm.com",
            "password": password,
        }
        status, elapsed, error, resp = self._make_request("POST", "/api/auth/login", payload)
        success = 200 <= status < 300

        if success and resp:
            # Extract token from response
            try:
                data = resp.json()
                self.token = data.get("accessToken") or data.get("token", "")
            except:
                pass

        return TestResult(
            endpoint="POST /api/auth/login",
            status_code=status,
            elapsed_ms=elapsed,
            success=success,
            error_message=error if not success else ""
        )

    def _create_client(self) -> TestResult:
        """Create a new client"""
        # Use correct payload format matching JMeter test plan
        # Ensure uniqueness with random numbers to avoid collisions under concurrency
        random_suffix = random.randint(10000000, 99999999)
        payload = {
            "firstName": "LoadTest",
            "lastName": "User",  # Must be letters only per validation pattern
            "dateOfBirth": "1990-01-01",
            "gender": "Male",  # String value, not enum name
            "emailAddress": f"loadtest{random_suffix}@test.local",
            "phoneNumber": f"+65{random_suffix}",  # +65 + 8 random digits
            "address": f"{random_suffix % 1000} Test Street",
            "city": "Singapore",
            "state": "Singapore",
            "country": "Singapore",
            "postalCode": f"{100000 + (random_suffix % 899999)}"
        }
        status, elapsed, error, resp = self._make_request("POST", "/api/clients", payload)
        success = 200 <= status < 300

        if success and resp:
            # Extract client ID from response
            try:
                data = resp.json()
                self.client_id = data.get("clientId", "")
            except:
                self.client_id = ""

        return TestResult(
            endpoint="POST /api/clients",
            status_code=status,
            elapsed_ms=elapsed,
            success=success,
            error_message=error if not success else ""
        )

    def _get_client(self) -> TestResult:
        """Retrieve the created client"""
        if not self.client_id:
            return TestResult(
                endpoint="GET /api/clients/{id}",
                status_code=400,
                elapsed_ms=0,
                success=False,
                error_message="No client ID available"
            )

        status, elapsed, error, resp = self._make_request("GET", f"/api/clients/{self.client_id}")
        success = 200 <= status < 300

        return TestResult(
            endpoint="GET /api/clients/{id}",
            status_code=status,
            elapsed_ms=elapsed,
            success=success,
            error_message=error if not success else ""
        )

    def _create_account(self) -> TestResult:
        """Create an account for the client"""
        if not self.client_id:
            return TestResult(
                endpoint="POST /api/accounts",
                status_code=400,
                elapsed_ms=0,
                success=False,
                error_message="No client ID available"
            )

        # Use correct payload format matching AccountCreateRequest DTO
        payload = {
            "clientId": self.client_id,
            "accountType": "Savings",
            "accountStatus": "Active",
            "openingDate": "2026-03-28",
            "initialDeposit": 1000.00,
            "currency": "SGD",
            "branchId": "SG-001"
        }
        status, elapsed, error, resp = self._make_request("POST", "/api/accounts", payload)
        success = 200 <= status < 300

        return TestResult(
            endpoint="POST /api/accounts",
            status_code=status,
            elapsed_ms=elapsed,
            success=success,
            error_message=error if not success else ""
        )

    def _get_transactions(self) -> TestResult:
        """Get transactions for the client"""
        if not self.client_id:
            return TestResult(
                endpoint="GET /api/clients/{id}/transactions",
                status_code=400,
                elapsed_ms=0,
                success=False,
                error_message="No client ID available"
            )

        status, elapsed, error, resp = self._make_request(
            "GET",
            f"/api/clients/{self.client_id}/transactions"
        )
        success = 200 <= status < 300

        return TestResult(
            endpoint="GET /api/clients/{id}/transactions",
            status_code=status,
            elapsed_ms=elapsed,
            success=success,
            error_message=error if not success else ""
        )


def run_load_test(base_url: str, num_agents: int, loops: int) -> Dict:
    """Run concurrent load test with multiple agents"""
    print(f"\n{'='*60}")
    print(f"  100-Thread Python Load Test")
    print(f"{'='*60}")
    print(f"Target:     {base_url}")
    print(f"Threads:    {num_agents} concurrent agents")
    print(f"Loops:      {loops} per agent")
    print(f"Total Requests: ~{num_agents * loops * 5}")
    print(f"{'='*60}\n")

    all_results = []
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_agents) as executor:
        futures = []
        for agent_id in range(num_agents):
            for loop_num in range(loops):
                agent = AgentCRUDWorkflow(agent_id * loops + loop_num, base_url)
                future = executor.submit(agent.run_workflow)
                futures.append(future)

        # Collect results with progress indicator
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            try:
                results = future.result()
                all_results.extend(results)
                completed += 1
                if completed % 100 == 0:
                    print(f"[Progress] Completed {completed}/{len(futures)} workflows...")
            except Exception as e:
                print(f"[ERROR] Workflow failed: {e}")

    total_time = time.time() - start_time

    # Analyze results
    return analyze_results(all_results, total_time)


def analyze_results(results: List[TestResult], total_time: float) -> Dict:
    """Analyze test results and generate report"""
    total_requests = len(results)
    failures = [r for r in results if not r.success]
    successes = [r for r in results if r.success]

    error_rate = (len(failures) / total_requests * 100) if total_requests > 0 else 0

    # Calculate latency percentiles
    latencies = [r.elapsed_ms for r in successes]
    p50 = statistics.median(latencies) if latencies else 0
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) > 1 else 0
    p99 = statistics.quantiles(latencies, n=100)[98] if len(latencies) > 1 else 0
    avg_latency = statistics.mean(latencies) if latencies else 0

    # Group by endpoint
    by_endpoint = {}
    for result in results:
        if result.endpoint not in by_endpoint:
            by_endpoint[result.endpoint] = {"total": 0, "errors": 0}
        by_endpoint[result.endpoint]["total"] += 1
        if not result.success:
            by_endpoint[result.endpoint]["errors"] += 1

    # Print report
    print(f"\n{'='*60}")
    print(f"  Test Results")
    print(f"{'='*60}")
    print(f"Total Requests:    {total_requests}")
    print(f"Successful:        {len(successes)} ({len(successes)/total_requests*100:.2f}%)")
    print(f"Failed:            {len(failures)} ({error_rate:.2f}%)")
    print(f"Total Duration:    {total_time:.2f}s")
    print(f"\nLatency (ms):")
    print(f"  Average:         {avg_latency:.2f}ms")
    print(f"  P50 (Median):    {p50:.2f}ms")
    print(f"  P95:             {p95:.2f}ms")
    print(f"  P99:             {p99:.2f}ms")
    print(f"\nBy Endpoint:")
    for endpoint, stats in sorted(by_endpoint.items()):
        error_pct = (stats["errors"] / stats["total"] * 100) if stats["total"] > 0 else 0
        status = "[OK]" if error_pct < 5 else "[WARN]" if error_pct < 30 else "[FAIL]"
        print(f"  {status} {endpoint:40s} {stats['errors']:4d}/{stats['total']:4d} errors ({error_pct:5.1f}%)")

    # Verdict
    print(f"\n{'='*60}")
    if error_rate < 1:
        print("[SUCCESS] Error rate <1% - System handles 100 concurrent agents")
        verdict = "PASS"
    elif error_rate < 5:
        print("[WARNING] Error rate 1-5% - Acceptable but needs monitoring")
        verdict = "PASS"
    else:
        print(f"[FAILURE] Error rate {error_rate:.2f}% (exceeds 5% threshold)")
        print("   CRITICAL: System cannot handle 100 concurrent agents")
        verdict = "FAIL"
    print(f"{'='*60}\n")

    return {
        "verdict": verdict,
        "error_rate": error_rate,
        "total_requests": total_requests,
        "total_failures": len(failures),
        "latency_p95": p95,
        "latency_p99": p99,
        "by_endpoint": by_endpoint
    }


if __name__ == "__main__":
    # Test configuration
    BASE_URL = "http://127.0.0.1:18088"
    NUM_AGENTS = 100
    LOOPS_PER_AGENT = 10

    # Verify services are running
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        if resp.status_code != 200:
            print(f"[ERROR] Service not responding: {BASE_URL}/health")
            print("Please start the stack: bash scripts/dev/stack-up.sh")
            exit(1)
    except Exception as e:
        print(f"[ERROR] Cannot reach services: {e}")
        print("Please start the stack: bash scripts/dev/stack-up.sh")
        exit(1)

    # Run load test
    results = run_load_test(BASE_URL, NUM_AGENTS, LOOPS_PER_AGENT)

    # Exit with appropriate code
    exit(0 if results["verdict"] == "PASS" else 1)
