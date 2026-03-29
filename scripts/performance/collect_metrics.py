#!/usr/bin/env python3
"""
Lightweight resource-metrics collector for performance test runs.

Samples Docker container stats (CPU, memory) and database connection counts
at a fixed interval and writes a single metrics.json when finished or
terminated (SIGTERM / KeyboardInterrupt).

Usage:
    python collect_metrics.py --output metrics.json --duration 300

The script is designed to be launched as a background subprocess by
run_jmeter_tests.py and terminated after the JMeter run completes.
"""

from __future__ import annotations

import argparse
import json
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Docker stats
# ---------------------------------------------------------------------------

def _parse_percent(value: str) -> Optional[float]:
    """Parse '12.34%' -> 12.34, returning None on failure."""
    try:
        return float(value.strip().rstrip("%"))
    except (ValueError, AttributeError):
        return None


def _parse_mem_bytes(value: str) -> Optional[int]:
    """Parse Docker memory strings like '123.4MiB' -> bytes."""
    value = value.strip()
    multipliers = {
        "B": 1,
        "KiB": 1024,
        "MiB": 1024 ** 2,
        "GiB": 1024 ** 3,
        "kB": 1000,
        "MB": 1000 ** 2,
        "GB": 1000 ** 3,
    }
    for suffix, mult in sorted(multipliers.items(), key=lambda x: -len(x[0])):
        if value.endswith(suffix):
            try:
                return int(float(value[: -len(suffix)]) * mult)
            except ValueError:
                return None
    try:
        return int(float(value))
    except ValueError:
        return None


def collect_docker_stats() -> List[Dict[str, Any]]:
    """Return per-container CPU / memory stats from ``docker stats``."""
    try:
        result = subprocess.run(
            [
                "docker", "stats", "--no-stream", "--format",
                "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.PIDs}}",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            return []
    except Exception:
        return []

    containers: List[Dict[str, Any]] = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        name = parts[0]
        mem_parts = parts[2].split("/")
        mem_used = _parse_mem_bytes(mem_parts[0].strip()) if mem_parts else None
        mem_limit = _parse_mem_bytes(mem_parts[1].strip()) if len(mem_parts) > 1 else None
        pids: Optional[int] = None
        if len(parts) >= 6:
            try:
                pids = int(parts[5].strip())
            except ValueError:
                pass

        containers.append({
            "name": name,
            "cpu_percent": _parse_percent(parts[1]),
            "mem_used_bytes": mem_used,
            "mem_limit_bytes": mem_limit,
            "mem_percent": _parse_percent(parts[3]),
            "pids": pids,
        })
    return containers


# ---------------------------------------------------------------------------
# DB connection counts  (best-effort)
# ---------------------------------------------------------------------------

def collect_db_connections() -> Optional[Dict[str, Any]]:
    """Query PostgreSQL connection count via ``docker exec`` into the postgres container."""
    # Find the postgres container (name contains 'postgres')
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", "ancestor=postgres:16", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            # Fallback: try container name pattern
            result = subprocess.run(
                ["docker", "ps", "--format", "{{.Names}}"],
                capture_output=True, text=True, timeout=5, check=False,
            )
            names = [n for n in result.stdout.strip().splitlines() if "postgres" in n.lower()]
            if not names:
                return None
            container = names[0]
        else:
            container = result.stdout.strip().splitlines()[0]
    except Exception:
        return None

    query = (
        "SELECT count(*) AS total, "
        "count(*) FILTER (WHERE state = 'active') AS active, "
        "count(*) FILTER (WHERE state = 'idle') AS idle "
        "FROM pg_stat_activity WHERE datname = current_database();"
    )
    try:
        result = subprocess.run(
            ["docker", "exec", container, "psql", "-U", "crm_app", "-d", "crm",
             "-t", "-A", "-F", ",", "-c", query],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if result.returncode != 0:
            return None
        parts = result.stdout.strip().split(",")
        if len(parts) >= 3:
            return {
                "total": int(parts[0]),
                "active": int(parts[1]),
                "idle": int(parts[2]),
            }
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Actuator HikariCP metrics  (best-effort)
# ---------------------------------------------------------------------------

_HIKARI_METRICS = [
    "hikaricp.connections.active",
    "hikaricp.connections.idle",
    "hikaricp.connections.pending",
    "hikaricp.connections.max",
]

# Default service ports in the fullstack compose topology
_SERVICE_PORTS = {
    "client-service": "18082",
    "user-service": "18081",
    "transaction-service": "18083",
}


def _fetch_actuator_metric(host: str, port: str, metric_name: str) -> Optional[float]:
    url = f"http://{host}:{port}/actuator/metrics/{metric_name}"
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "2", url],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout)
        measurements = data.get("measurements", [])
        if measurements:
            return measurements[0].get("value")
    except Exception:
        pass
    return None


def collect_actuator_pool_metrics(host: str) -> Dict[str, Any]:
    """Try to scrape HikariCP pool metrics from each backend service."""
    pool_data: Dict[str, Any] = {}
    for svc, port in _SERVICE_PORTS.items():
        svc_metrics: Dict[str, Any] = {}
        for metric in _HIKARI_METRICS:
            val = _fetch_actuator_metric(host, port, metric)
            if val is not None:
                short = metric.replace("hikaricp.connections.", "")
                svc_metrics[short] = val
        if svc_metrics:
            pool_data[svc] = svc_metrics
    return pool_data


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

_stop = False


def _handle_signal(signum, _frame):
    global _stop
    _stop = True


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect resource metrics during perf tests")
    parser.add_argument("--host", default="127.0.0.1", help="Host for actuator endpoints")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path")
    parser.add_argument("--interval", type=int, default=5, help="Sample interval in seconds")
    parser.add_argument("--duration", type=int, default=300, help="Max collection duration in seconds")
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, _handle_signal)

    print(f"[metrics] Collecting every {args.interval}s for up to {args.duration}s", flush=True)
    print(f"[metrics] Output: {args.output}", flush=True)

    samples: List[Dict[str, Any]] = []
    start_time = time.monotonic()
    start_wall = datetime.now(timezone.utc)

    while not _stop and (time.monotonic() - start_time) < args.duration:
        elapsed = round(time.monotonic() - start_time, 1)
        sample: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "elapsed_s": elapsed,
        }

        # Docker container stats (always attempted)
        sample["containers"] = collect_docker_stats()

        # Postgres connection counts (best-effort)
        db_conn = collect_db_connections()
        if db_conn is not None:
            sample["db_connections"] = db_conn

        # Actuator HikariCP pool metrics (best-effort)
        pool = collect_actuator_pool_metrics(args.host)
        if pool:
            sample["hikari_pool"] = pool

        samples.append(sample)

        container_count = len(sample.get("containers", []))
        db_info = f", db_conn={db_conn['total']}/{db_conn['active']}active" if db_conn else ""
        print(
            f"[metrics] #{len(samples)} elapsed={elapsed}s containers={container_count}{db_info}",
            flush=True,
        )

        # Sleep in small increments so SIGTERM is responsive
        deadline = start_time + elapsed + args.interval
        while not _stop and time.monotonic() < deadline:
            time.sleep(min(0.5, max(0, deadline - time.monotonic())))

    # ----- Write output -----
    payload = {
        "collection_start": start_wall.isoformat(),
        "collection_end": datetime.now(timezone.utc).isoformat(),
        "duration_s": round(time.monotonic() - start_time, 1),
        "interval_s": args.interval,
        "sample_count": len(samples),
        "samples": samples,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[metrics] Wrote {len(samples)} samples to {args.output}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        # Treat Ctrl-C same as SIGTERM – flush whatever we have
        print("[metrics] Interrupted, flushing...", flush=True)
        sys.exit(0)
