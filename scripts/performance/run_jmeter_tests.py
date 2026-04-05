#!/usr/bin/env python3
"""
Python wrapper for running JMeter performance tests with timestamped output.

This script is designed to be called from test_all.py pipeline as Layer 7.
It runs performance tests against the local dev stack and generates
timestamped results compatible with the test_all.py logging structure.

Prerequisites:
  - JMeter 5.6+ installed and in PATH
  - Local dev stack running (will verify health before running tests)

Usage:
  python scripts/performance/run_jmeter_tests.py [--test-mode MODE] [--skip-health-check]

Test Modes:
  baseline    - Single thread, 100 loops (fast baseline)
  smoke       - 10 threads, 10 loops (quick validation)
  concurrent  - 100 threads, 10 loops (CS301 requirement validation)
  burst       - 100 threads, 0s ramp-up (thundering herd / cold-start resilience)
  stress      - 200 threads, 10 loops (stress test)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PERF_LOG_ROOT = REPO_ROOT / "build-logs" / "performance"
TEST_PLAN = REPO_ROOT / "tests" / "performance" / "agent-crud-workflow.jmx"
REPO_ENV_LOCAL = REPO_ROOT / ".env.local"

# Test mode configurations
# - thinktime_ms keeps virtual users alive long enough to overlap during ramp-up.
# - concurrency_* enables hard proof gates for target active-thread levels.
TEST_MODES: Dict[str, Dict[str, Any]] = {
    "baseline": {
        "threads": "1",
        "rampup": "0",
        "loops": "100",
        "thinktime_ms": "0",
        "description": "Single thread baseline (100 iterations)",
    },
    "smoke": {
        "threads": "10",
        "rampup": "5",
        "loops": "10",
        "thinktime_ms": "0",
        "description": "Smoke test (10 threads, 10 iterations)",
    },
    "concurrent": {
        "threads": "100",
        "rampup": "60",
        "loops": "10",
        "thinktime_ms": "2000",
        "concurrency_target_threads": "100",
        "concurrency_min_sustain_s": "10",
        "description": "Concurrent load test (100 threads, CS301 requirement)",
    },
    "burst": {
        "threads": "100",
        "rampup": "0",
        "loops": "10",
        "thinktime_ms": "0",
        "concurrency_target_threads": "100",
        "concurrency_min_sustain_s": "1",
        "description": "Burst load test (100 threads, 0s ramp-up)",
    },
    "stress": {
        "threads": "200",
        "rampup": "120",
        "loops": "10",
        "thinktime_ms": "3000",
        "concurrency_target_threads": "200",
        "concurrency_min_sustain_s": "10",
        "description": "Stress test (200 threads)",
    },
}


def load_env_from_file_if_missing(env_file: Path, required_keys: List[str]) -> List[str]:
    """Load missing env vars from a simple KEY=VALUE env file."""
    loaded_keys: List[str] = []
    if not env_file.exists():
        return loaded_keys

    try:
        with env_file.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                if key.startswith("export "):
                    key = key[len("export "):].strip()
                value = value.strip()

                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]

                if key in required_keys and not os.environ.get(key):
                    os.environ[key] = value
                    loaded_keys.append(key)
    except OSError as exc:
        print(f"[WARN] Could not read env file {env_file}: {exc}")

    return loaded_keys


def is_windows() -> bool:
    return os.name == "nt"


def find_jmeter() -> Optional[str]:
    """Find JMeter executable (handles Unix and Windows variants)."""
    candidates = ["jmeter", "jmeter.bat", "jmeter.cmd"]
    for cmd in candidates:
        found = shutil.which(cmd)
        if found:
            return found
    return None


def check_stack_health(host: str, port: str) -> bool:
    """Check if the local dev stack is responding."""
    url = f"http://{host}:{port}/actuator/health"
    try:
        result = subprocess.run(
            ["curl", "--silent", "--fail", "--max-time", "5", url],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def to_windows_path(unix_path: str) -> str:
    """Convert Unix-style path to Windows path for JMeter on Windows."""
    if not is_windows():
        return unix_path

    # Try cygpath first (Git Bash)
    if shutil.which("cygpath"):
        try:
            result = subprocess.run(
                ["cygpath", "-w", unix_path],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            pass

    # Try wslpath (WSL)
    if shutil.which("wslpath"):
        try:
            result = subprocess.run(
                ["wslpath", "-w", unix_path],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            pass

    # Fallback: simple path conversion
    # /mnt/c/... -> C:\...
    # /c/... -> C:\...
    unix_path = unix_path.replace("/", "\\")
    if unix_path.startswith("\\mnt\\"):
        drive = unix_path[5].upper()
        rest = unix_path[7:]
        return f"{drive}:\\{rest}"
    if len(unix_path) > 2 and unix_path[0] == "\\" and unix_path[2] == "\\":
        drive = unix_path[1].upper()
        rest = unix_path[3:]
        return f"{drive}:\\{rest}"

    return unix_path


def run_jmeter_test(
    jmeter_cmd: str,
    test_plan: Path,
    output_dir: Path,
    host: str,
    port: str,
    admin_email: str,
    admin_password: str,
    threads: str,
    rampup: str,
    loops: str,
    thinktime_ms: str,
) -> int:
    """Run JMeter test in non-GUI mode."""

    # Prepare paths
    results_csv = output_dir / "results.csv"
    report_dir = output_dir / "report"
    jmeter_log = output_dir / "jmeter.log"

    # Build JMeter command
    jmeter_args = [
        "-n",  # Non-GUI mode
        "-t", str(test_plan),
        "-Jhost=" + host,
        "-Jport=" + port,
        "-JadminEmail=" + admin_email,
        "-JadminPassword=" + admin_password,
        "-Jthreads=" + threads,
        "-Jrampup=" + rampup,
        "-Jloops=" + loops,
        "-Jthinktime=" + thinktime_ms,
        "-l", str(results_csv),
        "-e",  # Generate dashboard
        "-o", str(report_dir),
        "-j", str(jmeter_log),
    ]

    # On Windows, if using .bat/.cmd, need to invoke via cmd.exe
    if is_windows() and (jmeter_cmd.endswith(".bat") or jmeter_cmd.endswith(".cmd")):
        # Convert paths to Windows format for JMeter (Windows program)
        win_test_plan = to_windows_path(str(test_plan))
        win_results_csv = to_windows_path(str(results_csv))
        win_report_dir = to_windows_path(str(report_dir))
        win_jmeter_log = to_windows_path(str(jmeter_log))

        jmeter_args = [
            "-n",
            "-t", win_test_plan,
            "-Jhost=" + host,
            "-Jport=" + port,
            "-JadminEmail=" + admin_email,
            "-JadminPassword=" + admin_password,
            "-Jthreads=" + threads,
            "-Jrampup=" + rampup,
            "-Jloops=" + loops,
            "-Jthinktime=" + thinktime_ms,
            "-l", win_results_csv,
            "-e",
            "-o", win_report_dir,
            "-j", win_jmeter_log,
        ]

        # Determine cmd.exe switch for Git Bash vs native Windows
        cmd_switch = "/c"
        if "MSYSTEM" in os.environ:  # Git Bash
            cmd_switch = "//c"

        cmd = ["cmd.exe", cmd_switch, jmeter_cmd] + jmeter_args
    else:
        cmd = [jmeter_cmd] + jmeter_args

    redacted_cmd = [
        "-JadminPassword=***REDACTED***" if token.startswith("-JadminPassword=") else token
        for token in cmd
    ]

    print(f"[INFO] Running JMeter test...")
    print(f"  Command: {' '.join(redacted_cmd)}")
    print(f"  Output: {output_dir}")
    print()

    try:
        result = subprocess.run(cmd, check=False)
        return result.returncode
    except Exception as e:
        print(f"[ERROR] JMeter execution failed: {e}")
        return 1


def percentile(values: List[int], pct: float) -> float:
    """Nearest-rank style percentile used for quick CLI summaries."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int((pct / 100.0) * (len(ordered) - 1))
    return float(ordered[index])


def summarize_results_csv(results_csv: Path) -> Dict[str, Any]:
    if not results_csv.exists():
        raise FileNotFoundError(f"Results CSV not found: {results_csv}")

    elapsed: List[int] = []
    timestamps: List[int] = []
    all_threads_samples: List[int] = []
    total = 0
    errors = 0
    response_codes: Dict[str, int] = {}
    error_categories: Dict[str, int] = {
        "server_error_5xx": 0,
        "client_error_4xx": 0,
        "timeout": 0,
        "connection_refused": 0,
        "assertion_failure": 0,
        "other": 0,
    }

    with results_csv.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            total += 1
            success = (row.get("success", "") or "").strip().lower()
            response_code = (row.get("responseCode", "") or "").strip()
            response_message = (row.get("responseMessage", "") or "").strip().lower()

            # Track response code distribution
            if response_code:
                response_codes[response_code] = response_codes.get(response_code, 0) + 1
            else:
                response_codes["unknown"] = response_codes.get("unknown", 0) + 1

            if success == "false":
                errors += 1
                # Categorize error
                if response_code.startswith("5"):
                    error_categories["server_error_5xx"] += 1
                elif response_code.startswith("4"):
                    error_categories["client_error_4xx"] += 1
                elif response_code == "0" or "timeout" in response_message or "timed out" in response_message:
                    error_categories["timeout"] += 1
                elif "connection refused" in response_message or "connect exception" in response_message:
                    error_categories["connection_refused"] += 1
                elif "assertion" in response_message or "test failed" in response_message:
                    error_categories["assertion_failure"] += 1
                else:
                    error_categories["other"] += 1

            try:
                elapsed.append(int(float(row.get("elapsed", "0") or "0")))
            except ValueError:
                elapsed.append(0)

            try:
                timestamps.append(int(float(row.get("timeStamp", "0") or "0")))
            except ValueError:
                timestamps.append(0)
            try:
                all_threads_samples.append(int(float(row.get("allThreads", "0") or "0")))
            except ValueError:
                all_threads_samples.append(0)

    if total == 0:
        raise RuntimeError(f"Results CSV has no samples: {results_csv}")

    error_rate_pct = (errors * 100.0) / total
    p95_ms = percentile(elapsed, 95.0)

    if timestamps:
        duration_s = max((max(timestamps) - min(timestamps)) / 1000.0, 0.001)
    else:
        duration_s = 0.001
    throughput_rps = total / duration_s

    return {
        "total_samples": float(total),
        "errors": float(errors),
        "error_rate_pct": error_rate_pct,
        "p95_ms": p95_ms,
        "max_all_threads": float(max(all_threads_samples) if all_threads_samples else 0),
        "p95_all_threads": percentile(all_threads_samples, 95.0),
        "throughput_rps": throughput_rps,
        "duration_s": duration_s,
        "response_code_distribution": response_codes,
        "error_categories": error_categories,
    }


def extract_thread_timeline(results_csv: Path) -> List[Tuple[int, int]]:
    timeline: List[Tuple[int, int]] = []
    with results_csv.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                ts = int(float(row.get("timeStamp", "0") or "0"))
            except ValueError:
                ts = 0
            try:
                threads = int(float(row.get("allThreads", "0") or "0"))
            except ValueError:
                threads = 0
            timeline.append((ts, threads))
    timeline.sort(key=lambda pair: pair[0])
    return timeline


def evaluate_concurrency_proof(
    timeline: List[Tuple[int, int]],
    target_threads: int,
    min_sustain_s: float,
) -> Dict[str, object]:
    if target_threads <= 0:
        return {
            "required": False,
            "pass": True,
            "target_threads": target_threads,
            "min_sustain_s": min_sustain_s,
            "max_observed_threads": 0,
            "samples_at_or_above_target": 0,
            "sample_count": len(timeline),
            "sample_pct_at_or_above_target": 0.0,
            "sustained_s_at_or_above_target": 0.0,
            "max_contiguous_s_at_or_above_target": 0.0,
        }

    sample_count = len(timeline)
    samples_at_or_above = 0
    max_observed_threads = 0
    for _, threads in timeline:
        if threads >= target_threads:
            samples_at_or_above += 1
        if threads > max_observed_threads:
            max_observed_threads = threads

    sustained_s = 0.0
    max_contiguous_s = 0.0
    current_contiguous_s = 0.0
    for idx in range(len(timeline) - 1):
        ts, threads = timeline[idx]
        next_ts = timeline[idx + 1][0]
        delta_s = max((next_ts - ts) / 1000.0, 0.0)
        if threads >= target_threads:
            sustained_s += delta_s
            current_contiguous_s += delta_s
            if current_contiguous_s > max_contiguous_s:
                max_contiguous_s = current_contiguous_s
        else:
            current_contiguous_s = 0.0

    sample_pct = (samples_at_or_above * 100.0 / sample_count) if sample_count else 0.0
    meets_peak = max_observed_threads >= target_threads
    meets_sustain = sustained_s >= min_sustain_s

    return {
        "required": True,
        "pass": bool(meets_peak and meets_sustain),
        "target_threads": target_threads,
        "min_sustain_s": min_sustain_s,
        "max_observed_threads": max_observed_threads,
        "samples_at_or_above_target": samples_at_or_above,
        "sample_count": sample_count,
        "sample_pct_at_or_above_target": sample_pct,
        "sustained_s_at_or_above_target": sustained_s,
        "max_contiguous_s_at_or_above_target": max_contiguous_s,
        "checks": {
            "peak_threads": {
                "actual": max_observed_threads,
                "threshold": target_threads,
                "pass": meets_peak,
            },
            "sustain_seconds": {
                "actual": sustained_s,
                "threshold": min_sustain_s,
                "pass": meets_sustain,
            },
        },
    }


def evaluate_slo(
    metrics: Dict[str, float],
    max_error_rate_pct: float,
    max_p95_ms: float,
) -> Dict[str, object]:
    checks = {
        "error_rate": {
            "actual": metrics["error_rate_pct"],
            "threshold": max_error_rate_pct,
            "pass": metrics["error_rate_pct"] <= max_error_rate_pct,
        },
        "p95": {
            "actual": metrics["p95_ms"],
            "threshold": max_p95_ms,
            "pass": metrics["p95_ms"] <= max_p95_ms,
        },
    }
    return {"pass": all(item["pass"] for item in checks.values()), "checks": checks}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run JMeter performance tests with timestamped output"
    )
    parser.add_argument(
        "--test-mode",
        choices=list(TEST_MODES.keys()),
        default="smoke",
        help="Test mode (default: smoke)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Target host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        default="18088",
        help="Target port (default: 18088)",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip health check (assume stack is running)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Output directory (default: auto-generated with timestamp)",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=1,
        help="Number of repeated executions for this test mode (default: 1)",
    )
    parser.add_argument(
        "--slo-max-error-rate-pct",
        type=float,
        default=1.0,
        help="Fail if any run exceeds this error rate percentage (default: 1.0)",
    )
    parser.add_argument(
        "--slo-max-p95-ms",
        type=float,
        default=5000.0,
        help="Fail if any run exceeds this p95 latency in ms (default: 5000)",
    )
    parser.add_argument(
        "--disable-metrics",
        action="store_true",
        help="Disable background resource-metrics collection during the test run",
    )
    parser.add_argument(
        "--disable-concurrency-proof",
        action="store_true",
        help=(
            "Disable concurrency proof gate for modes that define "
            "concurrency_target_threads/concurrency_min_sustain_s."
        ),
    )
    parser.add_argument(
        "--concurrency-proof-target-threads",
        type=int,
        default=0,
        help=(
            "Override target allThreads value for proof gating. "
            "0 means use mode default."
        ),
    )
    parser.add_argument(
        "--concurrency-proof-min-sustain-s",
        type=float,
        default=0.0,
        help=(
            "Override minimum sustained seconds at/above target allThreads. "
            "0 means use mode default."
        ),
    )

    args = parser.parse_args()
    if args.repeats < 1:
        print("[ERROR] --repeats must be >= 1")
        return 1

    loaded_keys = load_env_from_file_if_missing(
        env_file=REPO_ENV_LOCAL,
        required_keys=["E2E_ADMIN_PASSWORD"],
    )
    if loaded_keys:
        print(
            "[INFO] Loaded missing environment variable(s) from "
            f"{REPO_ENV_LOCAL}: {', '.join(sorted(loaded_keys))}"
        )

    if not os.environ.get("E2E_ADMIN_PASSWORD"):
        print("[ERROR] Missing E2E_ADMIN_PASSWORD for JMeter login")
        print("Set E2E_ADMIN_PASSWORD in your shell, or define it in repo root .env.local.")
        return 1

    admin_email = (os.environ.get("E2E_ADMIN_EMAIL") or "admin@crm.com").strip()
    admin_password = os.environ.get("E2E_ADMIN_PASSWORD", "")

    # Get test configuration
    test_config = TEST_MODES[args.test_mode]

    print("=" * 80)
    print(f"JMeter Performance Test - {args.test_mode}")
    print("=" * 80)
    print(f"Description: {test_config['description']}")
    print(f"Target: http://{args.host}:{args.port}")
    print(f"Threads: {test_config['threads']}")
    print(f"Ramp-up: {test_config['rampup']}s")
    print(f"Loops: {test_config['loops']}")
    print(f"Think time: {test_config.get('thinktime_ms', '0')}ms")
    print(f"Repeats: {args.repeats}")
    print(
        f"SLO: error_rate <= {args.slo_max_error_rate_pct:.3f}% "
        f"and p95 <= {args.slo_max_p95_ms:.1f}ms"
    )
    mode_proof_target = int(test_config.get("concurrency_target_threads", "0") or "0")
    mode_proof_sustain = float(test_config.get("concurrency_min_sustain_s", "0") or "0")
    proof_target_threads = (
        args.concurrency_proof_target_threads
        if args.concurrency_proof_target_threads > 0
        else mode_proof_target
    )
    proof_min_sustain_s = (
        args.concurrency_proof_min_sustain_s
        if args.concurrency_proof_min_sustain_s > 0
        else mode_proof_sustain
    )
    concurrency_proof_required = (
        (proof_target_threads > 0)
        and (proof_min_sustain_s > 0)
        and (not args.disable_concurrency_proof)
    )
    if concurrency_proof_required:
        print(
            f"Concurrency proof: target allThreads >= {proof_target_threads}, "
            f"sustain >= {proof_min_sustain_s:.1f}s"
        )
    else:
        print("Concurrency proof: disabled or not required for this mode")
    print()

    # Check prerequisites
    jmeter_cmd = find_jmeter()
    if not jmeter_cmd:
        print("[ERROR] JMeter not found in PATH")
        print("Please install Apache JMeter 5.6+ from:")
        print("  https://jmeter.apache.org/download_jmeter.cgi")
        return 1

    print(f"[OK] Found JMeter: {jmeter_cmd}")

    if not TEST_PLAN.exists():
        print(f"[ERROR] Test plan not found: {TEST_PLAN}")
        return 1

    print(f"[OK] Test plan: {TEST_PLAN}")

    # Check stack health
    if not args.skip_health_check:
        print(f"[INFO] Checking stack health at http://{args.host}:{args.port}...")
        if not check_stack_health(args.host, args.port):
            print("[ERROR] Local dev stack is not responding")
            print(f"  Health check failed: http://{args.host}:{args.port}/actuator/health")
            print()
            print("Please ensure the stack is running:")
            print("  Option 1: Run fullstack integration tests first (they start the stack)")
            print("  Option 2: Manually start the stack:")
            print("    bash scripts/dev/stack-up.sh")
            return 1
        print("[OK] Stack is healthy")

    # Prepare output directory
    if args.output_dir:
        output_dir = args.output_dir
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = PERF_LOG_ROOT / f"{args.test_mode}-{timestamp}"

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[OK] Output directory: {output_dir}")
    print()

    # --- Start background metrics collection ---
    metrics_process: Optional[subprocess.Popen] = None
    metrics_output = output_dir / "metrics.json"
    if not args.disable_metrics:
        # Estimate how long the JMeter run will take so the collector
        # doesn't exit before the test finishes.
        loops = int(test_config.get("loops", "10"))
        rampup = int(test_config.get("rampup", "0"))
        thinktime_s = int(test_config.get("thinktime_ms", "0")) / 1000.0
        # Rough estimate: rampup + (loops * (requests_per_loop * avg_latency + think_time))
        estimated_per_repeat = rampup + loops * (5 * 0.5 + thinktime_s)
        estimated_duration = int(estimated_per_repeat * args.repeats + 120)  # generous buffer
        try:
            metrics_process = subprocess.Popen(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts" / "performance" / "collect_metrics.py"),
                    "--host", args.host,
                    "--output", str(metrics_output),
                    "--interval", "5",
                    "--duration", str(estimated_duration),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            print(f"[INFO] Metrics collector started (pid={metrics_process.pid}, "
                  f"est. {estimated_duration}s)")
        except Exception as e:
            print(f"[WARN] Could not start metrics collector: {e}")
            metrics_process = None
    else:
        print("[INFO] Metrics collection disabled (--disable-metrics)")
    print()

    # Run repeated JMeter tests
    runs: List[Dict[str, object]] = []
    overall_exit_code = 0
    start_time = time.monotonic()
    for i in range(args.repeats):
        run_index = i + 1
        run_output_dir = output_dir if args.repeats == 1 else output_dir / f"repeat-{run_index:02d}"
        run_output_dir.mkdir(parents=True, exist_ok=True)
        print(f"[INFO] Starting repeat {run_index}/{args.repeats}")
        run_started = time.monotonic()
        exit_code = run_jmeter_test(
            jmeter_cmd=jmeter_cmd,
            test_plan=TEST_PLAN,
            output_dir=run_output_dir,
            host=args.host,
            port=args.port,
            admin_email=admin_email,
            admin_password=admin_password,
            threads=test_config["threads"],
            rampup=test_config["rampup"],
            loops=test_config["loops"],
            thinktime_ms=str(test_config.get("thinktime_ms", "0")),
        )
        run_duration = time.monotonic() - run_started

        result: Dict[str, object] = {
            "repeat": run_index,
            "output_dir": str(run_output_dir),
            "process_exit_code": exit_code,
            "duration_s": round(run_duration, 3),
        }

        if exit_code == 0:
            try:
                metrics = summarize_results_csv(run_output_dir / "results.csv")
                slo = evaluate_slo(
                    metrics=metrics,
                    max_error_rate_pct=args.slo_max_error_rate_pct,
                    max_p95_ms=args.slo_max_p95_ms,
                )
                result["metrics"] = metrics
                result["slo"] = slo
                print(
                    "[INFO] Repeat {idx} metrics: error_rate={err:.3f}% "
                    "p95={p95:.1f}ms throughput={tps:.2f}/s".format(
                        idx=run_index,
                        err=metrics["error_rate_pct"],
                        p95=metrics["p95_ms"],
                        tps=metrics["throughput_rps"],
                    )
                )

                # Print error breakdown if errors exist
                if metrics["error_rate_pct"] > 0:
                    print(f"[INFO] Repeat {run_index} error breakdown:")
                    error_cats = metrics.get("error_categories", {})
                    for category, count in error_cats.items():
                        if count > 0:
                            print(f"  - {category}: {count}")
                    print(f"[INFO] Repeat {run_index} response code distribution:")
                    resp_codes = metrics.get("response_code_distribution", {})
                    for code, count in sorted(resp_codes.items()):
                        print(f"  - {code}: {count}")

                print(
                    f"[INFO] Repeat {run_index} SLO: "
                    f"{'PASS' if slo['pass'] else 'FAIL'}"
                )
                if not slo["pass"]:
                    overall_exit_code = 1

                if concurrency_proof_required:
                    timeline = extract_thread_timeline(run_output_dir / "results.csv")
                    proof = evaluate_concurrency_proof(
                        timeline=timeline,
                        target_threads=proof_target_threads,
                        min_sustain_s=proof_min_sustain_s,
                    )
                    result["concurrency_proof"] = proof
                    print(
                        "[INFO] Repeat {idx} concurrency proof: {status} "
                        "(max_allThreads={max_threads}, sustain={sustain:.1f}s, "
                        "sample_pct_at_target={pct:.2f}%)".format(
                            idx=run_index,
                            status="PASS" if proof["pass"] else "FAIL",
                            max_threads=proof["max_observed_threads"],
                            sustain=proof["sustained_s_at_or_above_target"],
                            pct=proof["sample_pct_at_or_above_target"],
                        )
                    )
                    if not proof["pass"]:
                        overall_exit_code = 1
            except Exception as e:
                print(f"[ERROR] Failed to summarize repeat {run_index}: {e}")
                result["summary_error"] = str(e)
                overall_exit_code = 1
        else:
            overall_exit_code = 1

        runs.append(result)
        print()

    # --- Stop metrics collection ---
    if metrics_process is not None:
        print("[INFO] Stopping metrics collector...")
        metrics_process.terminate()
        try:
            metrics_process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            metrics_process.kill()
            metrics_process.wait(timeout=5)
        # Dump collector stdout so it appears in the CI log
        if metrics_process.stdout:
            for raw_line in metrics_process.stdout:
                line = raw_line.decode("utf-8", errors="replace").rstrip()
                if line:
                    print(f"  {line}")
        if metrics_output.exists():
            print(f"[OK] Metrics written to {metrics_output}")
        else:
            print("[WARN] Metrics file was not produced")

    duration = time.monotonic() - start_time

    passed_runs = [r for r in runs if r.get("process_exit_code") == 0 and r.get("metrics")]
    aggregate: Dict[str, object] = {}
    if passed_runs:
        error_rates = [float(r["metrics"]["error_rate_pct"]) for r in passed_runs]
        p95_values = [float(r["metrics"]["p95_ms"]) for r in passed_runs]
        aggregate = {
            "error_rate_pct": {
                "min": min(error_rates),
                "avg": mean(error_rates),
                "max": max(error_rates),
            },
            "p95_ms": {
                "min": min(p95_values),
                "avg": mean(p95_values),
                "max": max(p95_values),
            },
        }

    summary_payload = {
        "timestamp": datetime.now().isoformat(),
        "mode": args.test_mode,
        "host": args.host,
        "port": args.port,
        "repeats": args.repeats,
        "slo": {
            "max_error_rate_pct": args.slo_max_error_rate_pct,
            "max_p95_ms": args.slo_max_p95_ms,
        },
        "all_runs_passed": overall_exit_code == 0,
        "concurrency_proof_required": concurrency_proof_required,
        "concurrency_proof_target_threads": proof_target_threads,
        "concurrency_proof_min_sustain_s": proof_min_sustain_s,
        "total_duration_s": round(duration, 3),
        "aggregate": aggregate,
        "runs": runs,
    }
    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary_payload, indent=2), encoding="utf-8")

    proof_json_path = None
    proof_md_path = None
    if concurrency_proof_required:
        proof_runs = []
        for run in runs:
            run_proof = run.get("concurrency_proof")
            proof_runs.append(
                {
                    "repeat": run.get("repeat"),
                    "pass": bool(run_proof and run_proof.get("pass")),
                    "process_exit_code": run.get("process_exit_code"),
                    "metrics": run.get("metrics"),
                    "concurrency_proof": run_proof,
                    "output_dir": run.get("output_dir"),
                }
            )

        proof_payload = {
            "timestamp": datetime.now().isoformat(),
            "mode": args.test_mode,
            "target_threads": proof_target_threads,
            "min_sustain_s": proof_min_sustain_s,
            "all_runs_passed": overall_exit_code == 0,
            "runs": proof_runs,
        }
        proof_json_path = output_dir / "concurrency-proof.json"
        proof_json_path.write_text(
            json.dumps(proof_payload, indent=2),
            encoding="utf-8",
        )

        lines = [
            "# Concurrency Proof",
            "",
            f"- Mode: `{args.test_mode}`",
            f"- Target active threads (`allThreads`): `>= {proof_target_threads}`",
            f"- Minimum sustained duration at target: `>= {proof_min_sustain_s:.1f}s`",
            f"- Overall Result: `{'PASS' if overall_exit_code == 0 else 'FAIL'}`",
            "",
            "## Repeats",
        ]
        for run in proof_runs:
            proof = run.get("concurrency_proof") or {}
            lines.extend(
                [
                    "",
                    f"- Repeat `{run.get('repeat')}`: "
                    f"`{'PASS' if run.get('pass') else 'FAIL'}`",
                    f"- Process exit: `{run.get('process_exit_code')}`",
                    f"- Max allThreads: `{proof.get('max_observed_threads', 'n/a')}`",
                    f"- Sustained at target: "
                    f"`{float(proof.get('sustained_s_at_or_above_target', 0.0)):.1f}s`",
                    f"- Samples at/above target: "
                    f"`{float(proof.get('sample_pct_at_or_above_target', 0.0)):.2f}%`",
                    f"- Artifacts: `{run.get('output_dir')}`",
                ]
            )

        proof_md_path = output_dir / "concurrency-proof.md"
        proof_md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print()
    print("=" * 80)
    if overall_exit_code == 0:
        print("[SUCCESS] JMeter test completed successfully")
    else:
        print("[FAIL] One or more repeats failed process execution or SLO checks")
    print(f"Duration: {duration:.1f}s")
    print()
    if aggregate:
        print("Aggregate across repeats:")
        print(
            "  - Error rate (%): min={min:.3f} avg={avg:.3f} max={max:.3f}".format(
                min=aggregate["error_rate_pct"]["min"],
                avg=aggregate["error_rate_pct"]["avg"],
                max=aggregate["error_rate_pct"]["max"],
            )
        )
        print(
            "  - P95 (ms):       min={min:.1f} avg={avg:.1f} max={max:.1f}".format(
                min=aggregate["p95_ms"]["min"],
                avg=aggregate["p95_ms"]["avg"],
                max=aggregate["p95_ms"]["max"],
            )
        )
        print()
    print("Results:")
    if args.repeats == 1:
        print(f"  - CSV:   {output_dir / 'results.csv'}")
        print(f"  - HTML:  {output_dir / 'report' / 'index.html'}")
        print(f"  - Log:   {output_dir / 'jmeter.log'}")
    else:
        print(f"  - Run artifacts root: {output_dir}")
        print("  - Per-repeat folders: repeat-01, repeat-02, ...")
    print(f"  - Summary JSON: {summary_path}")
    if proof_json_path is not None:
        print(f"  - Concurrency proof JSON: {proof_json_path}")
    if proof_md_path is not None:
        print(f"  - Concurrency proof Markdown: {proof_md_path}")
    if metrics_output.exists():
        print(f"  - Metrics JSON: {metrics_output}")
    print("=" * 80)

    return overall_exit_code


if __name__ == "__main__":
    sys.exit(main())
