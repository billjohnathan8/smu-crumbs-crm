#!/usr/bin/env python3
"""
Unit tests for scripts/pipelines/test_all.py mode-specific SLO defaults.

Tests the logic that chooses between CLI overrides and mode-specific defaults.
"""

import sys
from pathlib import Path

# Add scripts/pipelines to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "scripts" / "pipelines"))

from test_all import PERFORMANCE_MODE_SLO_DEFAULTS, PERFORMANCE_MODE_SEQUENCES


def test_mode_defaults_exist():
    """Verify all expected modes have SLO defaults."""
    expected_modes = ["baseline", "smoke", "concurrent", "burst", "stress"]
    for mode in expected_modes:
        assert mode in PERFORMANCE_MODE_SLO_DEFAULTS, f"Missing SLO defaults for mode: {mode}"
        defaults = PERFORMANCE_MODE_SLO_DEFAULTS[mode]
        assert "max_p95_ms" in defaults, f"Missing max_p95_ms for mode: {mode}"
        assert "max_error_rate_pct" in defaults, f"Missing max_error_rate_pct for mode: {mode}"


def test_concurrent_mode_has_tight_thresholds():
    """Verify concurrent mode has tightened thresholds."""
    defaults = PERFORMANCE_MODE_SLO_DEFAULTS["concurrent"]
    assert defaults["max_p95_ms"] == 500.0, "Concurrent mode should have 500ms p95 threshold"
    assert defaults["max_error_rate_pct"] == 0.5, "Concurrent mode should have 0.5% error rate threshold"


def test_burst_mode_has_moderate_thresholds():
    """Verify burst mode has moderate thresholds."""
    defaults = PERFORMANCE_MODE_SLO_DEFAULTS["burst"]
    assert defaults["max_p95_ms"] == 1000.0, "Burst mode should have 1000ms p95 threshold"
    assert defaults["max_error_rate_pct"] == 1.0, "Burst mode should have 1.0% error rate threshold"


def test_stress_mode_has_relaxed_thresholds():
    """Verify stress mode has relaxed thresholds."""
    defaults = PERFORMANCE_MODE_SLO_DEFAULTS["stress"]
    assert defaults["max_p95_ms"] == 2000.0, "Stress mode should have 2000ms p95 threshold"
    assert defaults["max_error_rate_pct"] == 1.0, "Stress mode should have 1.0% error rate threshold"


def test_baseline_and_smoke_have_original_defaults():
    """Verify baseline and smoke modes retain original generous defaults."""
    for mode in ["baseline", "smoke"]:
        defaults = PERFORMANCE_MODE_SLO_DEFAULTS[mode]
        assert defaults["max_p95_ms"] == 5000.0, f"{mode} mode should have 5000ms p95 threshold"
        assert defaults["max_error_rate_pct"] == 1.0, f"{mode} mode should have 1.0% error rate threshold"


def test_cli_override_detection_logic():
    """
    Test the CLI override detection logic.

    This simulates the logic in build_steps_local_phase5():
        cli_override = (
            args.performance_max_p95_ms != 5000.0
            or args.performance_max_error_rate_pct != 1.0
        )
    """
    # Simulate args object
    class Args:
        def __init__(self, p95, error_rate):
            self.performance_max_p95_ms = p95
            self.performance_max_error_rate_pct = error_rate

    # Default values (no override)
    args = Args(5000.0, 1.0)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0
    assert not cli_override, "Default values should not trigger CLI override"

    # Override p95 only
    args = Args(2000.0, 1.0)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0
    assert cli_override, "Non-default p95 should trigger CLI override"

    # Override error rate only
    args = Args(5000.0, 0.5)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0
    assert cli_override, "Non-default error rate should trigger CLI override"

    # Override both
    args = Args(3000.0, 2.0)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0
    assert cli_override, "Non-default values should trigger CLI override"


def test_mode_specific_threshold_selection():
    """
    Test the threshold selection logic per mode.

    Simulates the logic that chooses between CLI override and mode-specific defaults.
    """
    # Simulate args with defaults (no CLI override)
    class Args:
        def __init__(self, p95, error_rate):
            self.performance_max_p95_ms = p95
            self.performance_max_error_rate_pct = error_rate

    args = Args(5000.0, 1.0)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0

    # Test concurrent mode gets tight defaults
    perf_mode = "concurrent"
    if cli_override:
        max_p95_ms = args.performance_max_p95_ms
        max_error_rate_pct = args.performance_max_error_rate_pct
    else:
        mode_defaults = PERFORMANCE_MODE_SLO_DEFAULTS.get(
            perf_mode,
            {"max_p95_ms": 5000.0, "max_error_rate_pct": 1.0},
        )
        max_p95_ms = mode_defaults["max_p95_ms"]
        max_error_rate_pct = mode_defaults["max_error_rate_pct"]

    assert max_p95_ms == 500.0, "Concurrent should use mode-specific 500ms when no CLI override"
    assert max_error_rate_pct == 0.5, "Concurrent should use mode-specific 0.5% when no CLI override"

    # Test with CLI override
    args = Args(3000.0, 2.0)
    cli_override = args.performance_max_p95_ms != 5000.0 or args.performance_max_error_rate_pct != 1.0

    if cli_override:
        max_p95_ms = args.performance_max_p95_ms
        max_error_rate_pct = args.performance_max_error_rate_pct
    else:
        mode_defaults = PERFORMANCE_MODE_SLO_DEFAULTS.get(
            perf_mode,
            {"max_p95_ms": 5000.0, "max_error_rate_pct": 1.0},
        )
        max_p95_ms = mode_defaults["max_p95_ms"]
        max_error_rate_pct = mode_defaults["max_error_rate_pct"]

    assert max_p95_ms == 3000.0, "CLI override should take precedence"
    assert max_error_rate_pct == 2.0, "CLI override should take precedence"


def test_recovery_mode_exists():
    """Verify recovery mode exists in PERFORMANCE_MODE_SEQUENCES."""
    assert "recovery" in PERFORMANCE_MODE_SEQUENCES, "Recovery mode should exist in PERFORMANCE_MODE_SEQUENCES"


def test_recovery_mode_sequence():
    """Verify recovery mode has the correct sequence: baseline -> stress -> baseline."""
    sequence = PERFORMANCE_MODE_SEQUENCES["recovery"]
    assert sequence == ["baseline", "stress", "baseline"], \
        "Recovery mode should run baseline, then stress, then baseline"


def test_recovery_mode_uses_baseline_slo():
    """Verify that baseline mode (used in recovery) has appropriate SLOs."""
    # Recovery mode runs baseline twice, so we need baseline SLOs to be defined
    assert "baseline" in PERFORMANCE_MODE_SLO_DEFAULTS, "Baseline mode should have SLO defaults"
    baseline_defaults = PERFORMANCE_MODE_SLO_DEFAULTS["baseline"]
    assert baseline_defaults["max_p95_ms"] == 5000.0, "Baseline should have 5000ms p95 threshold"
    assert baseline_defaults["max_error_rate_pct"] == 1.0, "Baseline should have 1.0% error rate threshold"


def test_full_with_recovery_mode_exists():
    """Verify full-with-recovery mode exists in PERFORMANCE_MODE_SEQUENCES."""
    assert "full-with-recovery" in PERFORMANCE_MODE_SEQUENCES, \
        "full-with-recovery mode should exist in PERFORMANCE_MODE_SEQUENCES"


def test_full_with_recovery_mode_sequence():
    """Verify full-with-recovery mode has the correct sequence."""
    sequence = PERFORMANCE_MODE_SEQUENCES["full-with-recovery"]
    expected = ["baseline", "concurrent", "burst", "stress", "baseline"]
    assert sequence == expected, \
        f"full-with-recovery should be {expected}, got {sequence}"


def test_full_with_recovery_includes_capacity_tests():
    """Verify full-with-recovery includes all capacity tests from 'full' mode."""
    full_sequence = PERFORMANCE_MODE_SEQUENCES["full"]
    full_with_recovery_sequence = PERFORMANCE_MODE_SEQUENCES["full-with-recovery"]

    # All modes from "full" should be in "full-with-recovery"
    for mode in full_sequence:
        assert mode in full_with_recovery_sequence, \
            f"full-with-recovery should include {mode} from full mode"


if __name__ == "__main__":
    print("Running unit tests for test_all.py SLO defaults...")
    test_mode_defaults_exist()
    print("PASS: test_mode_defaults_exist")
    test_concurrent_mode_has_tight_thresholds()
    print("PASS: test_concurrent_mode_has_tight_thresholds")
    test_burst_mode_has_moderate_thresholds()
    print("PASS: test_burst_mode_has_moderate_thresholds")
    test_stress_mode_has_relaxed_thresholds()
    print("PASS: test_stress_mode_has_relaxed_thresholds")
    test_baseline_and_smoke_have_original_defaults()
    print("PASS: test_baseline_and_smoke_have_original_defaults")
    test_cli_override_detection_logic()
    print("PASS: test_cli_override_detection_logic")
    test_mode_specific_threshold_selection()
    print("PASS: test_mode_specific_threshold_selection")
    test_recovery_mode_exists()
    print("PASS: test_recovery_mode_exists")
    test_recovery_mode_sequence()
    print("PASS: test_recovery_mode_sequence")
    test_recovery_mode_uses_baseline_slo()
    print("PASS: test_recovery_mode_uses_baseline_slo")
    test_full_with_recovery_mode_exists()
    print("PASS: test_full_with_recovery_mode_exists")
    test_full_with_recovery_mode_sequence()
    print("PASS: test_full_with_recovery_mode_sequence")
    test_full_with_recovery_includes_capacity_tests()
    print("PASS: test_full_with_recovery_includes_capacity_tests")
    print("\nAll tests passed!")
