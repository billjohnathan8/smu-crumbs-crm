#!/usr/bin/env python3
from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path


def run(command: list[str], *, cwd: Path) -> None:
    print(f"[local-test-pipeline] {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def main() -> int:
    service_root = Path(__file__).resolve().parent
    venv_dir = service_root / ".venv"
    reports_root = service_root / "build" / "reports"
    coverage_dir = reports_root / "coverage"
    test_dir = reports_root / "tests"

    if platform.system().lower().startswith("win"):
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    # Avoid recreating an active virtual environment in-place on Windows.
    if not venv_python.exists():
        run([sys.executable, "-m", "venv", str(venv_dir)], cwd=service_root)

    if not venv_python.exists():
        raise FileNotFoundError(f"Python executable not found in virtual environment: {venv_python}")

    os.makedirs(coverage_dir, exist_ok=True)
    os.makedirs(test_dir, exist_ok=True)

    run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"], cwd=service_root)
    run([str(venv_python), "-m", "pip", "install", "-r", "requirements.txt"], cwd=service_root)

    # 1) Lint
    run([str(venv_python), "-m", "black", "--check", "app", "tests"], cwd=service_root)
    run([str(venv_python), "-m", "flake8", "app", "tests"], cwd=service_root)

    # 2) Build (syntax compilation check for Python service code)
    run([str(venv_python), "-m", "compileall", "-q", "app", "tests"], cwd=service_root)

    # 3 + 4) Tests + coverage reports
    run(
        [
            str(venv_python),
            "-m",
            "pytest",
            "tests",
            "--junitxml=build/reports/tests/junit.xml",
            "--cov=app",
            "--cov-report=term-missing",
            "--cov-report=xml:build/reports/coverage/coverage.xml",
            "--cov-report=html:build/reports/coverage/html",
        ],
        cwd=service_root,
    )

    print("[local-test-pipeline] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
