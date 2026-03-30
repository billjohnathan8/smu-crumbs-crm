#!/usr/bin/env python3
"""
Unit tests for recovery baseline comparison logic in scripts/pipelines/test_all.py.

Tests the compare_recovery_baseline() function with various scenarios.
"""

import json
import sys
import tempfile
from pathlib import Path

# Add scripts/pipelines to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "scripts" / "pipelines"))

from test_all import compare_recovery_baseline


def test_recovery_passes_when_metrics_similar():
    """Test that recovery passes when post-stress metrics are similar to pre-stress."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline: p95=50ms, error_rate=0.1%
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: p95=55ms (1.1x), error_rate=0.15% (1.5x)
        post_summary = {
            "aggregate": {
                "p95_ms": 55.0,
                "error_rate_pct": 0.15,
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 0, "Recovery should pass when metrics are similar"


def test_recovery_fails_when_p95_degraded_2x():
    """Test that recovery fails when post-stress p95 is >2x worse."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline: p95=50ms
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: p95=120ms (2.4x worse)
        post_summary = {
            "aggregate": {
                "p95_ms": 120.0,
                "error_rate_pct": 0.1,
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 1, "Recovery should fail when p95 is >2x worse"


def test_recovery_fails_when_error_rate_elevated():
    """Test that recovery fails when error rate increases significantly."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline: error_rate=0.1%
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: error_rate=0.7% (0.6 percentage points increase)
        post_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.7,
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 1, "Recovery should fail when error rate increases >0.5 percentage points"


def test_recovery_fails_when_multiple_metrics_degraded():
    """Test that recovery fails when both p95 and error rate are degraded."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.2,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: both degraded
        post_summary = {
            "aggregate": {
                "p95_ms": 120.0,  # 2.4x worse
                "error_rate_pct": 0.9,  # 0.7 percentage points increase
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 1, "Recovery should fail when multiple metrics are degraded"


def test_recovery_passes_at_exactly_2x_threshold():
    """Test that recovery passes at exactly 2.0x threshold (boundary test)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline: p95=50ms
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: p95=100ms (exactly 2.0x)
        post_summary = {
            "aggregate": {
                "p95_ms": 100.0,
                "error_rate_pct": 0.1,
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 0, "Recovery should pass at exactly 2.0x threshold (not >2.0x)"


def test_recovery_handles_missing_summary():
    """Test that recovery fails gracefully when summary.json is missing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Only create pre-stress summary, not post-stress
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 1, "Recovery should fail when summary.json is missing"


def test_recovery_allows_small_error_rate_increase():
    """Test that recovery allows small error rate increases (<0.5 percentage points)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        pre_dir = tmppath / "pre"
        post_dir = tmppath / "post"
        pre_dir.mkdir()
        post_dir.mkdir()

        # Pre-stress baseline: error_rate=0.1%
        pre_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.1,
            }
        }
        (pre_dir / "summary.json").write_text(json.dumps(pre_summary), encoding="utf-8")

        # Post-stress baseline: error_rate=0.4% (0.3 percentage points increase)
        post_summary = {
            "aggregate": {
                "p95_ms": 50.0,
                "error_rate_pct": 0.4,
            }
        }
        (post_dir / "summary.json").write_text(json.dumps(post_summary), encoding="utf-8")

        result = compare_recovery_baseline(pre_dir, post_dir)
        assert result == 0, "Recovery should pass when error rate increase is <0.5 percentage points"


if __name__ == "__main__":
    print("Running unit tests for recovery comparison logic...")
    test_recovery_passes_when_metrics_similar()
    print("PASS: test_recovery_passes_when_metrics_similar")
    test_recovery_fails_when_p95_degraded_2x()
    print("PASS: test_recovery_fails_when_p95_degraded_2x")
    test_recovery_fails_when_error_rate_elevated()
    print("PASS: test_recovery_fails_when_error_rate_elevated")
    test_recovery_fails_when_multiple_metrics_degraded()
    print("PASS: test_recovery_fails_when_multiple_metrics_degraded")
    test_recovery_passes_at_exactly_2x_threshold()
    print("PASS: test_recovery_passes_at_exactly_2x_threshold")
    test_recovery_handles_missing_summary()
    print("PASS: test_recovery_handles_missing_summary")
    test_recovery_allows_small_error_rate_increase()
    print("PASS: test_recovery_allows_small_error_rate_increase")
    print("\nAll recovery comparison tests passed!")
