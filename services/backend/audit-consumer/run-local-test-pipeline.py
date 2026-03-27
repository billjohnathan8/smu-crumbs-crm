#!/usr/bin/env python3
"""Run the audit-consumer local test pipeline with a dedicated virtualenv."""

from __future__ import annotations

import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    """Execute a command and stream its output, raising on failure."""
    print(f"[local-test-pipeline] {' '.join(command)}")
    run_env = None
    if env is not None:
        run_env = os.environ.copy()
        run_env.update(env)
    subprocess.run(command, cwd=cwd, check=True, env=run_env)


def run_pip_install_requirements(
    venv_python: Path, requirements_file: str, *, cwd: Path
) -> None:
    """Install requirements.txt, reporting only if new dependencies were installed."""
    command = [str(venv_python), "-m", "pip", "install", "-r", requirements_file]
    print(f"[local-test-pipeline] {' '.join(command)}")

    result = subprocess.run(
        command,
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    output = result.stdout + result.stderr
    has_new_installs = (
        "Successfully installed" in output or "Installing collected packages" in output
    )

    if has_new_installs:
        print("[local-test-pipeline] New dependencies installed:")
        for line in output.splitlines():
            if (
                "Successfully installed" in line
                or "Installing collected packages" in line
                or "Downloading" in line
                or "Collecting" in line
            ):
                print(f"  {line}")


def main() -> int:
    """Build a virtualenv, lint, compile, and run tests with coverage (if present)."""
    service_root = Path(__file__).resolve().parent
    venv_dir = service_root / ".venv"
    reports_root = service_root / "build" / "reports"
    coverage_dir = reports_root / "coverage"
    test_dir = reports_root / "tests"
    black_cache_dir = service_root / ".cache" / "black"
    tests_dir = service_root / "tests"
    has_tests = tests_dir.exists()

    if platform.system().lower().startswith("win"):
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    if not venv_python.exists():
        run([sys.executable, "-m", "venv", str(venv_dir)], cwd=service_root)

    if not venv_python.exists():
        raise FileNotFoundError(
            f"Python executable not found in virtual environment: {venv_python}"
        )

    os.makedirs(coverage_dir, exist_ok=True)
    os.makedirs(test_dir, exist_ok=True)
    os.makedirs(black_cache_dir, exist_ok=True)

    run_pip_install_requirements(venv_python, "requirements.txt", cwd=service_root)

    lint_targets = ["lambda_function.py"]
    compile_targets = ["lambda_function.py"]
    if has_tests:
        lint_targets.append("tests")
        compile_targets.append("tests")

    run(
        [str(venv_python), "-m", "black", "--check", *lint_targets],
        cwd=service_root,
        env={"BLACK_CACHE_DIR": str(black_cache_dir)},
    )

    run(
        [str(venv_python), "-m", "flake8", "--jobs", "1", *lint_targets],
        cwd=service_root,
    )

    run(
        [str(venv_python), "-m", "compileall", "-q", *compile_targets],
        cwd=service_root,
    )

    if has_tests:
        coverage_data_file = Path(tempfile.gettempdir()) / "audit-consumer-coverage"
        run(
            [
                str(venv_python),
                "-m",
                "pytest",
                "tests",
                "-o",
                "cache_dir=build/.pytest_cache",
                "--junitxml=build/reports/tests/junit.xml",
                "--cov=lambda_function",
                "--cov-branch",
                "--cov-report=term-missing",
                "--cov-report=xml:build/reports/coverage/coverage.xml",
                "--cov-report=html:build/reports/coverage/html",
            ],
            cwd=service_root,
            env={"COVERAGE_FILE": str(coverage_data_file)},
        )
    else:
        print("[local-test-pipeline] No tests directory found; skipping pytest.")

    print("[local-test-pipeline] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
