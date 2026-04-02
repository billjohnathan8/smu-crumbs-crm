#!/usr/bin/env python3
"""
Local CI-equivalent runner for the main GitHub Actions pipeline.

This script is local-only and does not modify any GitHub Actions workflow.
It runs the same logical layers as `.github/workflows/ci-main.yml`:

1) Backend lint / format / typecheck
2) Backend unit / component tests
3) Frontend lint / format / typecheck
4) Frontend unit / component tests
5) Frontend Latency Tests (E2E with mocked backend, <5s validation)
6) Fullstack integration E2E (LocalStack + containers + Playwright)
7) JMeter Performance Tests (Load testing against running stack)
8) Cleanup (Tear down fullstack stack after performance tests)
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
LOG_ROOT = REPO_ROOT / "build-logs" / "test-all"
LOG_RETENTION_RUNS = 3
PERFORMANCE_MODE_SEQUENCES: Dict[str, List[str]] = {
    "baseline": ["baseline"],
    "smoke": ["smoke"],
    "concurrent": ["concurrent"],
    "burst": ["burst"],
    "stress": ["stress"],
    # Bake in the same core flow used by run-perf-full-with-cleanup.sh,
    # but rely on test_all.py Layer 6/8 for stack lifecycle.
    "full": ["concurrent", "burst", "stress"],
    # Recovery mode: baseline -> stress -> baseline to validate system
    # returns to healthy performance after stress is removed.
    "recovery": ["baseline", "stress", "baseline"],
    # Full suite with recovery validation: complete capacity testing
    # with pre/post-stress baseline comparison to detect degradation.
    "full-with-recovery": ["baseline", "concurrent", "burst", "stress", "baseline"],
}

# Mode-specific SLO defaults (tightened based on empirical results)
# CLI overrides (--performance-max-p95-ms, --performance-max-error-rate-pct) take precedence
PERFORMANCE_MODE_SLO_DEFAULTS: Dict[str, Dict[str, float]] = {
    "baseline": {"max_p95_ms": 5000.0, "max_error_rate_pct": 1.0},
    "smoke": {"max_p95_ms": 5000.0, "max_error_rate_pct": 1.0},
    "concurrent": {"max_p95_ms": 500.0, "max_error_rate_pct": 0.5},
    "burst": {"max_p95_ms": 1000.0, "max_error_rate_pct": 1.0},
    "stress": {"max_p95_ms": 2000.0, "max_error_rate_pct": 1.0},
}


@dataclass
class Step:
    phase: str
    name: str
    cwd: Path
    command: List[str]
    env: Dict[str, str] = field(default_factory=dict)
    parallel_group: Optional[str] = None
    retries: int = 0


@dataclass
class StepResult:
    phase: str
    name: str
    command: str
    cwd: str
    status: str
    duration_seconds: float
    log_file: Optional[str]


def is_windows() -> bool:
    return os.name == "nt"


def display_command(parts: Sequence[str]) -> str:
    if is_windows():
        return subprocess.list2cmdline(list(parts))
    # Minimal POSIX-safe representation for logging.
    return " ".join(parts)


def detect_python() -> str:
    return sys.executable


def detect_actionlint() -> Optional[str]:
    # Check PATH first (covers global installs and activated virtualenvs).
    found = shutil.which("actionlint")
    if found:
        return found
    # Fall back to the local devtools install location (scripts/first-time-setup).
    devtools_bin = REPO_ROOT / ".devtools" / "bin"
    candidate = devtools_bin / ("actionlint.exe" if is_windows() else "actionlint")
    if candidate.exists():
        return str(candidate)
    return None


def detect_bash() -> Optional[str]:
    candidates: List[str] = []

    if is_windows():
        candidates.extend(
            [
                r"C:\Program Files\Git\bin\bash.exe",
                r"C:\Program Files\Git\usr\bin\bash.exe",
            ]
        )

    bash_in_path = shutil.which("bash")
    if bash_in_path:
        candidates.append(bash_in_path)

    for candidate in candidates:
        if not Path(candidate).exists():
            continue
        try:
            probe = subprocess.run(
                [candidate, "--version"],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if probe.returncode == 0:
            return candidate

    return None


def detect_opentofu() -> Optional[str]:
    return shutil.which("opentofu") or shutil.which("tofu")


def is_prod_env() -> bool:
    for key in ("TERRAFORM_ENV", "TF_VAR_environment", "ENVIRONMENT"):
        value = os.environ.get(key)
        if value and value.strip().lower() in ("prod", "production", "prod-env"):
            return True
    return False


def gradle_command(service_dir: Path, *args: str) -> List[str]:
    if is_windows():
        wrapper = service_dir / "gradlew.bat"
        return ["cmd.exe", "/c", str(wrapper), *args]
    return ["./gradlew", *args]


def gradle_env(service_dir: Path) -> Dict[str, str]:
    return {"GRADLE_USER_HOME": str(service_dir / ".gradle-local")}



def resolve_windows_command(command: List[str]) -> List[str]:
    if not is_windows() or not command:
        return command

    first = command[0]
    first_suffix = Path(first).suffix.lower()
    if first_suffix in (".cmd", ".bat"):
        return ["cmd.exe", "/c", *command]

    resolved = shutil.which(first)
    if resolved:
        resolved_suffix = Path(resolved).suffix.lower()
        if resolved_suffix in (".cmd", ".bat"):
            return ["cmd.exe", "/c", *command]

    return command


def build_steps(args: argparse.Namespace) -> List[Step]:
    py = detect_python()
    bash = detect_bash()
    actionlint_cmd = detect_actionlint()
    tflint_available = shutil.which("tflint") is not None
    trivy_available = shutil.which("trivy") is not None
    infracost_available = shutil.which("infracost") is not None
    prod_env = is_prod_env()

    services_backend = REPO_ROOT / "services" / "backend"
    frontend_dir = REPO_ROOT / "services" / "frontend" / "crm-ui"
    terraform_dir = REPO_ROOT / "platform" / "terraform"
    prod_tfvars = terraform_dir / "env" / "prod.tfvars"

    steps: List[Step] = []

    run_backend = args.suite in ("all", "backend")
    run_frontend = args.suite in ("all", "frontend")

    phase = "Layer 1 - Backend Lint / Format / Typecheck"
    if actionlint_cmd:
        steps.append(
            Step(
                phase=phase,
                name="Actionlint (GitHub Actions workflows)",
                cwd=REPO_ROOT,
                command=[actionlint_cmd, "-color"],
            )
        )
    else:
        print(
            "[WARN] actionlint not found in PATH or .devtools/bin; skipping GitHub Actions "
            "workflow lint. Run scripts/first-time-setup.ps1 (or .sh) to install it."
        )

    if run_backend:
        phase = "Layer 1 - Backend Lint / Format / Typecheck"

        # -- Checkstyle: 3 independent Gradle projects, safe to parallelize --
        for svc in ("user", "client", "transaction"):
            svc_dir = services_backend / svc
            steps.append(
                Step(
                    phase=phase,
                    name=f"Checkstyle ({svc})",
                    cwd=svc_dir,
                    command=gradle_command(
                        svc_dir,
                        "checkstyleMain",
                        "checkstyleTest",
                        "--no-daemon",
                        "--console=plain",
                    ),
                    env=gradle_env(svc_dir),
                    parallel_group="lint-checkstyle",
                )
            )

        # -- Python pip installs: sequential (shared site-packages) --
        log_dir = services_backend / "log"
        aml_dir = services_backend / "aml"
        sftp_transaction_collector_dir = (
            services_backend / "sftp-transaction-collector"
        )
        verification_dir = services_backend / "verification"
        audit_consumer_dir = services_backend / "audit-consumer"
        aml_consumer_dir = services_backend / "aml-consumer"

        for label, svc_dir in [
            ("log", log_dir),
            ("aml", aml_dir),
            ("sftp-transaction-collector", sftp_transaction_collector_dir),
            ("verification", verification_dir),
            ("audit-consumer", audit_consumer_dir),
            ("aml-consumer", aml_consumer_dir),
        ]:
            steps.append(
                Step(
                    phase=phase,
                    name=f"Python deps install ({label})",
                    cwd=svc_dir,
                    command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
                )
            )

        steps.append(
            Step(
                phase=phase,
                name="Install pip-audit",
                cwd=REPO_ROOT,
                command=[py, "-m", "pip", "install", "--upgrade", "pip", "pip-audit"],
            )
        )

        # -- pip-audit: requirements-only vulnerability scans, safe to parallelize --
        pip_audit_parallel_group = "lint-pip-audit"
        for label, svc_dir in [
            ("log", log_dir),
            ("aml", aml_dir),
            ("sftp-transaction-collector", sftp_transaction_collector_dir),
            ("verification", verification_dir),
            ("audit-consumer", audit_consumer_dir),
            ("aml-consumer", aml_consumer_dir),
        ]:
            steps.append(
                Step(
                    phase=phase,
                    name=f"pip-audit ({label})",
                    cwd=svc_dir,
                    command=[
                        py,
                        "-m",
                        "pip_audit",
                        "-r",
                        "requirements.txt",
                        "--strict",
                    ],
                    parallel_group=pip_audit_parallel_group,
                    retries=2,
                )
            )

        # -- Black + Flake8: read-only checks, safe to parallelize --
        _python_lint_targets = [
            ("log", log_dir, ["app", "lambda_function.py", "tests"]),
            ("aml", aml_dir, ["lambda_function.py", "tests"]),
            (
                "sftp-transaction-collector",
                sftp_transaction_collector_dir,
                ["lambda_function.py", "tests"],
            ),
            ("verification", verification_dir, ["lambda_function.py", "tests"]),
            ("audit-consumer", audit_consumer_dir, ["lambda_function.py", "tests"]),
            ("aml-consumer", aml_consumer_dir, ["lambda_function.py", "tests"]),
        ]
        for label, svc_dir, targets in _python_lint_targets:
            steps.append(
                Step(
                    phase=phase,
                    name=f"Black check ({label})",
                    cwd=svc_dir,
                    command=[
                        py,
                        "-m",
                        "black",
                        "--check",
                        "--diff",
                        *targets,
                    ],
                    parallel_group="lint-python",
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name=f"Flake8 ({label})",
                    cwd=svc_dir,
                    command=[
                        py,
                        "-m",
                        "flake8",
                        "--jobs",
                        "1",
                        "--max-line-length=100",
                        "--extend-ignore=E501,E203,W503",
                        *targets,
                    ],
                    parallel_group="lint-python",
                )
            )

        if not args.skip_terraform:
            # Neutralise any local AWS credentials so the AWS provider does
            # not attempt STS validation during offline init/validate.
            # Empty string ("") → key is removed from subprocess env.
            # File paths use a non-existent path so the SDK does not
            # fall back to ~/.aws/credentials or ~/.aws/config.
            _no_creds_path = str(REPO_ROOT / ".nonexistent-aws-creds")
            _tf_no_aws_env = {
                "AWS_ACCESS_KEY_ID": "",
                "AWS_SECRET_ACCESS_KEY": "",
                "AWS_SESSION_TOKEN": "",
                "AWS_PROFILE": "",
                "AWS_DEFAULT_PROFILE": "",
                "AWS_SHARED_CREDENTIALS_FILE": _no_creds_path,
                "AWS_CONFIG_FILE": _no_creds_path,
            }
            _tf_flags_env = {
                **_tf_no_aws_env,
                "TF_VAR_enable_log_lambda": "true",
                "TF_VAR_enable_aml_lambda": "true",
                "TF_VAR_enable_sftp_transaction_collector": "true",
                "TF_VAR_enable_verification_pipeline": "true",
                "TF_VAR_enable_audit_pipeline": "true",
                "TF_VAR_enable_aml_pipeline": "true",
                "TF_VAR_ses_sender_email": "verification@crm.local",
            }
            _tofu_cmd = detect_opentofu()
            if not _tofu_cmd:
                print(
                    "[WARN] OpenTofu not found in PATH; skipping OpenTofu validate-only steps."
                )
            steps.append(
                Step(
                    phase=phase,
                    name="Terraform fmt check",
                    cwd=terraform_dir,
                    command=["terraform", "fmt", "-check", "-recursive"],
                )
            )
            # Remove stale .terraform cache (may contain S3 backend state
            # from a previous deployment init, which causes -backend=false
            # to still attempt AWS authentication).
            steps.append(
                Step(
                    phase=phase,
                    name="Terraform clean .terraform cache",
                    cwd=terraform_dir,
                    command=[
                        py,
                        "-c",
                        "import shutil, pathlib; "
                        "p = pathlib.Path('.terraform'); "
                        "shutil.rmtree(p, ignore_errors=True); "
                        "print('Cleaned .terraform cache' if not p.exists() else 'Nothing to clean')",
                    ],
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Terraform init (no backend)",
                    cwd=terraform_dir,
                    command=["terraform", "init", "-backend=false", "-lockfile=readonly"],
                    env=_tf_no_aws_env,
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Check lockfile is Terraform-authored",
                    cwd=REPO_ROOT,
                    command=[
                        py,
                        str(REPO_ROOT / "scripts" / "ci" / "check_terraform_lockfile.py"),
                    ],
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Terraform validate",
                    cwd=terraform_dir,
                    command=["terraform", "validate"],
                    env=_tf_no_aws_env,
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Build operable lambda artifacts",
                    cwd=REPO_ROOT,
                    command=[
                        py,
                        str(REPO_ROOT / "scripts" / "ci" / "build_lambda_artifacts.py"),
                    ],
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Terraform validate (operable lambda feature flags)",
                    cwd=terraform_dir,
                    command=["terraform", "validate"],
                    env=_tf_flags_env,
                )
            )
            if _tofu_cmd:
                steps.append(
                    Step(
                        phase=phase,
                        name="OpenTofu validate",
                        cwd=REPO_ROOT,
                        command=[
                            py,
                            str(
                                REPO_ROOT
                                / "scripts"
                                / "ci"
                                / "run_opentofu_validate_isolated.py"
                            ),
                            "--tofu-bin",
                            _tofu_cmd,
                        ],
                        env=_tf_no_aws_env,
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="OpenTofu validate (operable lambda feature flags)",
                        cwd=REPO_ROOT,
                        command=[
                            py,
                            str(
                                REPO_ROOT
                                / "scripts"
                                / "ci"
                                / "run_opentofu_validate_isolated.py"
                            ),
                            "--tofu-bin",
                            _tofu_cmd,
                        ],
                        env=_tf_flags_env,
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="Verify lockfile unchanged after OpenTofu validate",
                        cwd=REPO_ROOT,
                        command=[
                            py,
                            str(REPO_ROOT / "scripts" / "ci" / "check_terraform_lockfile.py"),
                        ],
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="Verify no OpenTofu lockfile drift",
                        cwd=terraform_dir,
                        command=["git", "diff", "--exit-code", "--", ".terraform.lock.hcl"],
                    )
                )
            if tflint_available:
                steps.append(
                    Step(
                        phase=phase,
                        name="TFLint init",
                        cwd=terraform_dir,
                        command=["tflint", "--init"],
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="TFLint run",
                        cwd=terraform_dir,
                        command=["tflint", "--format", "compact"],
                    )
                )
            else:
                print(
                    "[WARN] tflint not found in PATH; skipping TFLint init/run. "
                    "Install tflint to enable these Terraform lint checks."
                )
            if trivy_available:
                steps.append(
                    Step(
                        phase=phase,
                        name="Prepare Trivy scan artifact directory",
                        cwd=terraform_dir,
                        command=[py, "-c", "from pathlib import Path; Path('.trivy').mkdir(parents=True, exist_ok=True)"],
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="Trivy IaC scan (full JSON report)",
                        cwd=terraform_dir,
                        command=[
                            "trivy",
                            "config",
                            "--format",
                            "json",
                            "--output",
                            ".trivy/trivy-iac-report.json",
                            "--severity",
                            "HIGH,CRITICAL,MEDIUM,LOW",
                            "--skip-dirs",
                            ".terraform",
                            "--skip-dirs",
                            ".infracost",
                            "--skip-dirs",
                            ".tfplan",
                            "--skip-dirs",
                            ".ci-artifacts",
                            "--exit-code",
                            "0",
                            ".",
                        ],
                    )
                )
                steps.append(
                    Step(
                        phase=phase,
                        name="Trivy IaC scan (fail on CRITICAL)",
                        cwd=terraform_dir,
                        command=[
                            "trivy",
                            "config",
                            "--format",
                            "table",
                            "--severity",
                            "CRITICAL",
                            "--skip-dirs",
                            ".terraform",
                            "--skip-dirs",
                            ".infracost",
                            "--skip-dirs",
                            ".tfplan",
                            "--skip-dirs",
                            ".ci-artifacts",
                            "--exit-code",
                            "1",
                            ".",
                        ],
                    )
                )
            else:
                print(
                    "[WARN] trivy not found in PATH; skipping Trivy IaC checks. "
                    "Install trivy to enable Terraform misconfiguration scanning."
                )
            if infracost_available and os.environ.get("INFRACOST_API_KEY"):
                if prod_env:
                    infracost_command = [
                        "infracost",
                        "breakdown",
                        "--path=.",
                        "--format=table",
                    ]
                    if prod_tfvars.exists():
                        infracost_command.append(
                            f"--terraform-var-file={prod_tfvars}"
                        )
                    else:
                        print(
                            f"[WARN] {prod_tfvars} not found; running Infracost without prod tfvars."
                        )
                    steps.append(
                        Step(
                            phase=phase,
                            name="Infracost breakdown (prod-env only)",
                            cwd=terraform_dir,
                            command=infracost_command,
                        )
                    )
                else:
                    print(
                        "[INFO] Infracost runs only for prod-env; set TERRAFORM_ENV, "
                        "TF_VAR_environment, or ENVIRONMENT to prod-env to enable."
                    )
            else:
                if not infracost_available:
                    print(
                        "[WARN] infracost not found in PATH; skipping Infracost cost report. "
                        "Install infracost to enable cloud cost estimation."
                    )
                else:
                    print(
                        "[WARN] INFRACOST_API_KEY is not set; skipping Infracost cost report."
                    )
            steps.append(
                Step(
                    phase=phase,
                    name="Install Checkov",
                    cwd=terraform_dir,
                    command=[py, "-m", "pip", "install", "checkov"],
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Checkov scan",
                    cwd=terraform_dir,
                    command=[
                        py,
                        "-m",
                        "checkov.main",
                        "--directory",
                        ".",
                        "--framework",
                        "terraform",
                        "--output",
                        "cli",
                        "--compact",
                        "--quiet",
                        "--soft-fail",
                        "--hard-fail-on",
                        "CRITICAL,HIGH",
                    ],
                )
            )

    if run_backend:
        phase = "Layer 2 - Backend Unit / Component Tests"
        backend_parallel_group = "backend-unit-tests"

        log_dir = services_backend / "log"
        aml_dir = services_backend / "aml"
        audit_consumer_dir = services_backend / "audit-consumer"
        aml_consumer_dir = services_backend / "aml-consumer"
        steps.append(
            Step(
                phase=phase,
                name="Python deps install (log test stage)",
                cwd=log_dir,
                command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
            )
        )
        sftp_transaction_collector_dir = (
            services_backend / "sftp-transaction-collector"
        )
        steps.append(
            Step(
                phase=phase,
                name="Python deps install (sftp-transaction-collector test stage)",
                cwd=sftp_transaction_collector_dir,
                command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
            )
        )
        verification_dir = services_backend / "verification"
        steps.append(
            Step(
                phase=phase,
                name="Python deps install (verification test stage)",
                cwd=verification_dir,
                command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Python deps install (audit-consumer test stage)",
                cwd=audit_consumer_dir,
                command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Python deps install (aml-consumer test stage)",
                cwd=aml_consumer_dir,
                command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
            )
        )

        for svc in ("user", "client", "transaction"):
            svc_dir = services_backend / svc
            steps.append(
                Step(
                    phase=phase,
                    name=f"Unit tests ({svc})",
                    cwd=svc_dir,
                    command=gradle_command(
                        svc_dir,
                        "test",
                        "jacocoTestReport",
                        "jacocoTestCoverageVerification",
                        "--no-daemon",
                        "--console=plain",
                    ),
                    env=gradle_env(svc_dir),
                    parallel_group=backend_parallel_group,
                )
            )

        steps.append(
            Step(
                phase=phase,
                name="Unit tests (log)",
                cwd=log_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=app",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )

        steps.append(
            Step(
                phase=phase,
                name="Unit tests (sftp-transaction-collector)",
                cwd=sftp_transaction_collector_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Unit tests (verification)",
                cwd=verification_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Unit tests (aml)",
                cwd=aml_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Unit tests (audit-consumer)",
                cwd=audit_consumer_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Unit tests (aml-consumer)",
                cwd=aml_consumer_dir,
                command=[
                    py,
                    "-m",
                    "pytest",
                    "tests",
                    "-o",
                    "cache_dir=build/.pytest_cache",
                    "--junitxml=build/reports/tests/junit.xml",
                    "--cov=lambda_function",
                    "--cov-branch",
                    "--cov-fail-under=80",
                    "--cov-report=term-missing",
                    "--cov-report=xml:build/reports/coverage/coverage.xml",
                    "--cov-report=html:build/reports/coverage/html",
                ],
                parallel_group=backend_parallel_group,
            )
        )

    if not args.skip_openapi:
        phase = "Layer 3 - Frontend Lint / Format / Typecheck"
        openapi_dir = REPO_ROOT / "docs" / "api-contracts" / "openapi"
        spectral_available = shutil.which("spectral") is not None
        if spectral_available:
            steps.append(
                Step(
                    phase=phase,
                    name="Spectral OpenAPI lint",
                    cwd=REPO_ROOT,
                    command=[
                        "spectral",
                        "lint",
                        str(openapi_dir / "*.yaml"),
                        "--fail-severity",
                        "error",
                    ],
                )
            )
        else:
            # Fall back to npx (slower but doesn't require global install).
            steps.append(
                Step(
                    phase=phase,
                    name="Spectral OpenAPI lint (npx)",
                    cwd=REPO_ROOT,
                    command=[
                        "npx",
                        "--yes",
                        "@stoplight/spectral-cli",
                        "lint",
                        str(openapi_dir / "*.yaml"),
                        "--fail-severity",
                        "error",
                    ],
                )
            )

    if run_frontend:
        phase = "Layer 3 - Frontend Lint / Format / Typecheck"
        if is_windows():
            # On Windows, stale frontend node.exe processes (Vite dev server, prior test
            # runs) can hold a file lock on esbuild.exe inside node_modules, causing
            # npm ci to fail with EPERM.
            # Restrict cleanup to node processes tied to this frontend path so we do not
            # terminate unrelated node processes (for example editor/terminal internals).
            steps.append(
                Step(
                    phase=phase,
                    name="Kill stale frontend node processes (Windows pre-npm-ci)",
                    cwd=frontend_dir,
                    command=[
                        "powershell",
                        "-NoProfile",
                        "-NonInteractive",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        "$target = $env:CRM_UI_PATH; "
                        "if ([string]::IsNullOrWhiteSpace($target)) { exit 0 }; "
                        "$target = $target.ToLower(); "
                        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" "
                        "| Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($target) } "
                        "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "
                        "exit 0",
                    ],
                    env={"CRM_UI_PATH": str(frontend_dir)},
                )
            )
        steps.append(
            Step(
                phase=phase,
                name="Frontend npm ci (lint stage)",
                cwd=frontend_dir,
                command=["npm", "ci"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend Prettier format",
                cwd=frontend_dir,
                command=["npm", "run", "format"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend Prettier check",
                cwd=frontend_dir,
                command=["npm", "run", "format:check"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend TypeScript typecheck",
                cwd=frontend_dir,
                command=["npm", "run", "typecheck"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend ESLint",
                cwd=frontend_dir,
                command=["npm", "run", "lint"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend npm audit fix",
                cwd=frontend_dir,
                command=["npm", "audit", "fix", "--omit=dev", "--package-lock-only"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend npm audit",
                cwd=frontend_dir,
                command=["npm", "audit", "--omit=dev"],
            )
        )

    if run_frontend:
        phase = "Layer 4 - Frontend Unit / Component Tests"
        steps.append(
            Step(
                phase=phase,
                name="Frontend npm ci (test stage)",
                cwd=frontend_dir,
                command=["npm", "ci"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Unit tests (frontend coverage)",
                cwd=frontend_dir,
                command=["npm", "run", "test:coverage"],
            )
        )

        if not args.skip_frontend_latency:
            phase = "Layer 5 - Frontend Latency Tests"
            steps.append(
                Step(
                    phase=phase,
                    name="Frontend npm ci (latency test stage)",
                    cwd=frontend_dir,
                    command=["npm", "ci"],
                )
            )
            if is_windows():
                playwright_install = ["npx", "playwright", "install", "chromium"]
            else:
                playwright_install = [
                    "npx",
                    "playwright",
                    "install",
                    "--with-deps",
                    "chromium",
                ]
            steps.append(
                Step(
                    phase=phase,
                    name="Install Playwright browser (latency tests)",
                    cwd=frontend_dir,
                    command=playwright_install,
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Run frontend latency tests",
                    cwd=frontend_dir,
                    command=["npm", "run", "test:e2e:latency"],
                )
            )

    if args.suite == "all" and not args.skip_fullstack:
        if not bash:
            raise RuntimeError(
                "Unable to find 'bash' required for fullstack integration script. "
                "Install Git Bash (Windows) or a Unix shell, or run with --skip-fullstack."
            )

        phase = "Layer 6 - Fullstack Integration E2E"
        fullstack_env = {"FULLSTACK_MODE": args.fullstack_mode}

        # Skip cleanup if performance tests will run after (need stack to remain up)
        if not args.skip_performance:
            fullstack_env["SKIP_FULLSTACK_CLEANUP"] = "1"

        steps.append(
            Step(
                phase=phase,
                name=f"Fullstack integration ({args.fullstack_mode})",
                cwd=REPO_ROOT,
                command=[
                    bash,
                    str(
                        REPO_ROOT
                        / "scripts"
                        / "ci"
                        / "run-fullstack-integration-e2e.sh"
                    ),
                ],
                env=fullstack_env,
            )
        )

    if args.suite == "all" and not args.skip_performance:
        phase = "Layer 7 - JMeter Performance Tests"
        perf_script = REPO_ROOT / "scripts" / "performance" / "run_jmeter_tests.py"

        # Determine timestamped output directory for this test_all.py run
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Determine if CLI overrides are in effect (user explicitly set thresholds)
        # If CLI args differ from parser defaults, treat as explicit override for all modes
        cli_override = (
            args.performance_max_p95_ms != 5000.0
            or args.performance_max_error_rate_pct != 1.0
        )

        # Note: Health check is always performed to ensure stack is running.
        # Stack should be up from Layer 6 (fullstack integration) if not skipped.
        perf_modes = PERFORMANCE_MODE_SEQUENCES[args.performance_mode]

        # Track output directories for recovery comparison
        # Maps (mode, sequence_index) -> output_dir
        perf_output_dirs: Dict[tuple, Path] = {}

        for seq_idx, perf_mode in enumerate(perf_modes):
            # For sequences with duplicate modes (e.g., recovery has two baselines),
            # append sequence index to distinguish them
            mode_counts = {}
            for i, m in enumerate(perf_modes[:seq_idx + 1]):
                mode_counts[m] = mode_counts.get(m, 0) + 1

            mode_occurrence = mode_counts[perf_mode]
            if perf_modes.count(perf_mode) > 1:
                # Multiple occurrences: label with sequence position
                dir_name = f"{perf_mode}-seq{seq_idx}-{timestamp}"
                step_label = f"{perf_mode} (seq {seq_idx})"
            else:
                # Single occurrence: use simple name
                dir_name = f"{perf_mode}-{timestamp}"
                step_label = perf_mode

            perf_output = REPO_ROOT / "build-logs" / "performance" / dir_name
            perf_output_dirs[(perf_mode, seq_idx)] = perf_output

            # Use mode-specific SLO defaults unless CLI override is active
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

            steps.append(
                Step(
                    phase=phase,
                    name=f"Performance test ({step_label})",
                    cwd=REPO_ROOT,
                    command=[
                        py,
                        str(perf_script),
                        "--test-mode",
                        perf_mode,
                        "--repeats",
                        str(args.performance_repeats),
                        "--slo-max-error-rate-pct",
                        str(max_error_rate_pct),
                        "--slo-max-p95-ms",
                        str(max_p95_ms),
                        "--output-dir",
                        str(perf_output),
                    ],
                )
            )

        # Add recovery comparison step if mode includes pre/post-stress baseline
        if args.performance_mode in ("recovery", "full-with-recovery"):
            # Find first and last baseline indices in the sequence
            baseline_indices = [i for i, m in enumerate(perf_modes) if m == "baseline"]
            if len(baseline_indices) >= 2:
                pre_stress_idx = baseline_indices[0]
                post_stress_idx = baseline_indices[-1]
                steps.append(
                    Step(
                        phase=phase,
                        name="Recovery analysis (compare pre-stress vs post-stress baseline)",
                        cwd=REPO_ROOT,
                        command=[
                            py,
                            str(Path(__file__).resolve()),
                            "--internal-recovery-compare",
                            str(perf_output_dirs[("baseline", pre_stress_idx)]),
                            str(perf_output_dirs[("baseline", post_stress_idx)]),
                        ],
                    )
                )

        # Add cleanup step to tear down the stack after performance tests.
        # Prefer a dedicated script when available; otherwise run docker compose
        # directly to avoid shell quoting/path conversion issues on Windows.
        phase = "Layer 8 - Cleanup"
        cleanup_script = None
        for candidate in (
            REPO_ROOT / "scripts" / "ci" / "cleanup-fullstack-stack.sh",
            REPO_ROOT / "scripts" / "dev" / "stack-down.sh",
        ):
            if candidate.exists():
                cleanup_script = candidate
                break

        if cleanup_script is not None:
            if not bash:
                raise RuntimeError(
                    "Unable to find 'bash' required for stack cleanup script."
                )
            steps.append(
                Step(
                    phase=phase,
                    name="Cleanup fullstack stack",
                    cwd=REPO_ROOT,
                    command=[bash, str(cleanup_script)],
                    env={"AGGRESSIVE_PRUNE": "1"},
                )
            )
        else:
            compose_file = (
                REPO_ROOT / "scripts" / "ci" / "fullstack-integration.compose.yml"
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Cleanup fullstack stack",
                    cwd=REPO_ROOT,
                    command=[
                        "docker",
                        "compose",
                        "-f",
                        str(compose_file),
                        "-p",
                        "crm-fullstack-it-local",
                        "down",
                        "-v",
                        "--remove-orphans",
                    ],
                )
            )

    return steps


def ensure_log_dirs() -> Path:
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    prune_old_runs(keep=max(0, LOG_RETENTION_RUNS - 1))

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = LOG_ROOT / timestamp
    collision_idx = 1
    while run_dir.exists():
        run_dir = LOG_ROOT / f"{timestamp}_{collision_idx:02d}"
        collision_idx += 1

    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def prune_old_runs(keep: int = LOG_RETENTION_RUNS) -> None:
    if not LOG_ROOT.exists():
        return

    run_dirs = sorted(
        (path for path in LOG_ROOT.iterdir() if path.is_dir()),
        key=lambda p: p.name,
        reverse=True,
    )

    for old_run in run_dirs[keep:]:
        shutil.rmtree(old_run, ignore_errors=True)


def log_file_for_step(step: Step, run_dir: Path, index: int) -> Path:
    slug = (
        step.name.lower()
        .replace(" ", "-")
        .replace("/", "-")
        .replace("(", "")
        .replace(")", "")
        .replace(":", "")
    )
    return run_dir / f"{index:02d}-{slug}.log"


def _build_env(step_env: Dict[str, str]) -> Dict[str, str]:
    """Build subprocess environment from OS env + step overrides.

    An empty-string value means "remove this key from the environment" so that
    the child process cannot inherit it (useful for neutralising credentials).
    """
    env = os.environ.copy()
    for k, v in step_env.items():
        if v == "":
            env.pop(k, None)
        else:
            env[k] = v
    return env


def run_step(step: Step, run_dir: Path, index: int, dry_run: bool) -> StepResult:
    log_file = log_file_for_step(step, run_dir, index)
    cmd_display = display_command(step.command)

    print("")
    print(f"[STEP {index:02d}] {step.name}")
    print(f"  phase : {step.phase}")
    print(f"  cwd   : {step.cwd}")
    print(f"  cmd   : {cmd_display}")
    print(f"  log   : {log_file}")

    if dry_run:
        return StepResult(
            phase=step.phase,
            name=step.name,
            command=cmd_display,
            cwd=str(step.cwd),
            status="DRY-RUN",
            duration_seconds=0.0,
            log_file=str(log_file),
        )

    start = time.monotonic()
    env = _build_env(step.env)
    run_command = resolve_windows_command(step.command)

    return_code = 1
    attempts = step.retries + 1
    with log_file.open("w", encoding="utf-8", errors="replace") as handle:
        for attempt in range(1, attempts + 1):
            if attempt > 1:
                retry_note = (
                    f"[RETRY] Attempt {attempt}/{attempts} for step '{step.name}' "
                    "after previous failure."
                )
                print(retry_note)
                handle.write("\n" + "=" * 80 + "\n")
                handle.write(retry_note + "\n")

            try:
                process = subprocess.Popen(
                    run_command,
                    cwd=step.cwd,
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
            except FileNotFoundError as exc:
                elapsed = time.monotonic() - start
                message = f"[FAIL] Unable to start command: {exc}"
                print(message)
                handle.write(message + "\n")
                return StepResult(
                    phase=step.phase,
                    name=step.name,
                    command=cmd_display,
                    cwd=str(step.cwd),
                    status="FAIL",
                    duration_seconds=elapsed,
                    log_file=str(log_file),
                )

            assert process.stdout is not None
            for line in process.stdout:
                # Handle Windows console encoding issues (CP1252 can't display all Unicode)
                try:
                    print(line, end="")
                except UnicodeEncodeError:
                    # Fallback: replace unsupported chars in console encoding.
                    print(
                        line.encode(
                            sys.stdout.encoding or "utf-8", errors="replace"
                        ).decode(sys.stdout.encoding or "utf-8", errors="replace"),
                        end="",
                    )
                handle.write(line)

            return_code = process.wait()
            if return_code == 0:
                break
            if attempt < attempts:
                time.sleep(2)

    elapsed = time.monotonic() - start
    status = "PASS" if return_code == 0 else "FAIL"
    print(f"[{status}] {step.name} ({elapsed:.1f}s)")

    return StepResult(
        phase=step.phase,
        name=step.name,
        command=cmd_display,
        cwd=str(step.cwd),
        status=status,
        duration_seconds=elapsed,
        log_file=str(log_file),
    )


def run_parallel_step(
    step: Step, run_dir: Path, index: int, dry_run: bool
) -> StepResult:
    log_file = log_file_for_step(step, run_dir, index)
    cmd_display = display_command(step.command)

    if dry_run:
        return StepResult(
            phase=step.phase,
            name=step.name,
            command=cmd_display,
            cwd=str(step.cwd),
            status="DRY-RUN",
            duration_seconds=0.0,
            log_file=str(log_file),
        )

    start = time.monotonic()
    env = _build_env(step.env)
    run_command = resolve_windows_command(step.command)

    return_code = 1
    attempts = step.retries + 1
    with log_file.open("w", encoding="utf-8", errors="replace") as handle:
        for attempt in range(1, attempts + 1):
            if attempt > 1:
                handle.write("\n" + "=" * 80 + "\n")
                handle.write(
                    f"[RETRY] Attempt {attempt}/{attempts} for step '{step.name}' "
                    "after previous failure.\n"
                )
            try:
                completed = subprocess.run(
                    run_command,
                    cwd=step.cwd,
                    env=env,
                    stdout=handle,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                )
            except FileNotFoundError as exc:
                elapsed = time.monotonic() - start
                message = f"[FAIL] Unable to start command: {exc}"
                handle.write(message + "\n")
                return StepResult(
                    phase=step.phase,
                    name=step.name,
                    command=cmd_display,
                    cwd=str(step.cwd),
                    status="FAIL",
                    duration_seconds=elapsed,
                    log_file=str(log_file),
                )

            return_code = completed.returncode
            if return_code == 0:
                break
            if attempt < attempts:
                time.sleep(2)

    elapsed = time.monotonic() - start
    status = "PASS" if return_code == 0 else "FAIL"
    return StepResult(
        phase=step.phase,
        name=step.name,
        command=cmd_display,
        cwd=str(step.cwd),
        status=status,
        duration_seconds=elapsed,
        log_file=str(log_file),
    )


def run_parallel_group(
    steps: List[Step], run_dir: Path, start_index: int, dry_run: bool
) -> List[StepResult]:
    print("")
    print(f"[PARALLEL GROUP] {steps[0].parallel_group} ({len(steps)} steps)")
    indexed_steps = list(enumerate(steps, start=start_index))
    for index, step in indexed_steps:
        log_file = log_file_for_step(step, run_dir, index)
        cmd_display = display_command(step.command)
        print(f"  [STEP {index:02d}] {step.name}")
        print(f"    cwd : {step.cwd}")
        print(f"    cmd : {cmd_display}")
        print(f"    log : {log_file}")

    results_by_index: dict[int, StepResult] = {}
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=len(indexed_steps)
    ) as executor:
        future_to_index = {
            executor.submit(run_parallel_step, step, run_dir, index, dry_run): index
            for index, step in indexed_steps
        }

        for future in concurrent.futures.as_completed(future_to_index):
            index = future_to_index[future]
            result = future.result()
            results_by_index[index] = result
            print(f"[{result.status}] {result.name} ({result.duration_seconds:.1f}s)")

    return [results_by_index[index] for index, _ in indexed_steps]


def write_summary(
    results: List[StepResult],
    run_dir: Path,
    started_at: float,
    args: argparse.Namespace,
) -> None:
    summary_json = LOG_ROOT / "last-run-summary.json"
    summary_md = LOG_ROOT / "last-run-summary.md"

    total_seconds = time.monotonic() - started_at
    ok = all(r.status in ("PASS", "DRY-RUN") for r in results)
    payload = {
        "timestamp": datetime.now().isoformat(),
        "suite": args.suite,
        "fullstack_mode": args.fullstack_mode,
        "performance_mode": args.performance_mode,
        "performance_repeats": args.performance_repeats,
        "performance_max_error_rate_pct": args.performance_max_error_rate_pct,
        "performance_max_p95_ms": args.performance_max_p95_ms,
        "local_phase5": args.local_phase5,
        "dry_run": args.dry_run,
        "skip_fullstack": args.skip_fullstack,
        "skip_frontend_latency": args.skip_frontend_latency,
        "skip_performance": args.skip_performance,
        "skip_terraform": args.skip_terraform,
        "skip_openapi": args.skip_openapi,
        "run_dir": str(run_dir),
        "ok": ok,
        "total_seconds": round(total_seconds, 3),
        "steps": [
            {
                "phase": r.phase,
                "name": r.name,
                "status": r.status,
                "duration_seconds": round(r.duration_seconds, 3),
                "cwd": r.cwd,
                "command": r.command,
                "log_file": r.log_file,
            }
            for r in results
        ],
    }
    summary_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines: List[str] = []
    lines.append("# Local Test Pipeline Summary")
    lines.append("")
    lines.append(f"- Timestamp: `{datetime.now().isoformat()}`")
    lines.append(f"- Suite: `{args.suite}`")
    lines.append(f"- Fullstack mode: `{args.fullstack_mode}`")
    lines.append(f"- Performance mode: `{args.performance_mode}`")
    lines.append(f"- Performance repeats: `{args.performance_repeats}`")
    lines.append(
        f"- Performance SLO max error rate (%): `{args.performance_max_error_rate_pct}`"
    )
    lines.append(f"- Performance SLO max p95 (ms): `{args.performance_max_p95_ms}`")
    lines.append(f"- Local phase5 preset: `{args.local_phase5}`")
    lines.append(f"- Dry-run: `{args.dry_run}`")
    lines.append(f"- Success: `{ok}`")
    lines.append(f"- Total runtime (s): `{total_seconds:.1f}`")
    lines.append(f"- Run logs: `{run_dir}`")
    if args.suite == "all" and not args.skip_performance:
        lines.append(
            "- Performance proof artifacts: "
            "`build-logs/performance/<mode>-<timestamp>/concurrency-proof.{json,md}`"
        )
    lines.append("")
    lines.append("| Status | Duration (s) | Phase | Step |")
    lines.append("|---|---:|---|---|")
    for r in results:
        lines.append(
            f"| {r.status} | {r.duration_seconds:.1f} | {r.phase} | {r.name} |"
        )
    lines.append("")
    lines.append(f"Machine-readable summary: `{summary_json}`")
    summary_md.write_text("\n".join(lines), encoding="utf-8")


def print_summary(results: List[StepResult], started_at: float) -> None:
    print("")
    print("=" * 90)
    print("STEP TIMINGS")
    print("=" * 90)
    print(f"{'Status':<10} {'Seconds':>8}  {'Phase':<36} Step")
    print("-" * 90)
    for r in results:
        print(f"{r.status:<10} {r.duration_seconds:>8.1f}  {r.phase:<36} {r.name}")
    print("-" * 90)
    print(f"{'TOTAL':<10} {time.monotonic() - started_at:>8.1f}")
    print(
        f"Summary files: {LOG_ROOT / 'last-run-summary.md'} and {LOG_ROOT / 'last-run-summary.json'}"
    )
    print("=" * 90)


def compare_recovery_baseline(
    pre_stress_dir: Path,
    post_stress_dir: Path,
) -> int:
    """
    Compare pre-stress and post-stress baseline results for recovery mode.

    Fails if:
    - Post-stress p95 is >2x worse than pre-stress
    - Post-stress error rate is elevated beyond acceptable thresholds

    Returns:
        0 if recovery is acceptable
        1 if recovery shows degradation
    """
    print()
    print("=" * 80)
    print("RECOVERY ANALYSIS: Comparing pre-stress vs post-stress baseline")
    print("=" * 80)

    # Load summary.json from both baseline runs
    pre_summary_path = pre_stress_dir / "summary.json"
    post_summary_path = post_stress_dir / "summary.json"

    if not pre_summary_path.exists():
        print(f"[ERROR] Pre-stress summary not found: {pre_summary_path}")
        return 1

    if not post_summary_path.exists():
        print(f"[ERROR] Post-stress summary not found: {post_summary_path}")
        return 1

    try:
        with pre_summary_path.open("r", encoding="utf-8") as f:
            pre_summary = json.load(f)
        with post_summary_path.open("r", encoding="utf-8") as f:
            post_summary = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[ERROR] Failed to load summary JSON: {e}")
        return 1

    def _as_metric_value(metric: object, preferred_key: str = "avg") -> float:
        """
        Convert summary aggregate metric to scalar float.

        Supports both:
        - legacy scalar format: 123.4
        - aggregate object format: {"min": ..., "avg": ..., "max": ...}
        """
        if isinstance(metric, (int, float)):
            return float(metric)

        if isinstance(metric, dict):
            candidate = metric.get(preferred_key)
            if isinstance(candidate, (int, float)):
                return float(candidate)
            for key in ("max", "min"):
                fallback = metric.get(key)
                if isinstance(fallback, (int, float)):
                    return float(fallback)

        return 0.0

    # Extract aggregate metrics
    pre_agg = pre_summary.get("aggregate", {})
    post_agg = post_summary.get("aggregate", {})

    pre_p95 = _as_metric_value(pre_agg.get("p95_ms", 0.0), preferred_key="avg")
    post_p95 = _as_metric_value(post_agg.get("p95_ms", 0.0), preferred_key="avg")
    pre_error_rate = _as_metric_value(
        pre_agg.get("error_rate_pct", 0.0), preferred_key="avg"
    )
    post_error_rate = _as_metric_value(
        post_agg.get("error_rate_pct", 0.0), preferred_key="avg"
    )

    print()
    print(f"Pre-stress baseline:  p95={pre_p95:.2f}ms  error_rate={pre_error_rate:.3f}%")
    print(f"Post-stress baseline: p95={post_p95:.2f}ms  error_rate={post_error_rate:.3f}%")
    print()

    # Failure conditions
    failures = []

    # Check p95 degradation (>2x worse)
    if pre_p95 > 0 and post_p95 > pre_p95 * 2.0:
        p95_ratio = post_p95 / pre_p95
        failures.append(
            f"p95 degraded by {p95_ratio:.2f}x (pre: {pre_p95:.2f}ms, post: {post_p95:.2f}ms, threshold: 2.0x)"
        )

    # Check error rate elevation
    # Allow small absolute increase (0.5%) or small relative increase (2x)
    # but fail if both pre and post are above 0.5% and post is worse
    error_rate_delta = post_error_rate - pre_error_rate
    if error_rate_delta > 0.5:  # More than 0.5 percentage points increase
        failures.append(
            f"error rate elevated by {error_rate_delta:.3f} percentage points "
            f"(pre: {pre_error_rate:.3f}%, post: {post_error_rate:.3f}%)"
        )
    elif post_error_rate > 0.5 and pre_error_rate > 0 and post_error_rate > pre_error_rate * 2.0:
        error_ratio = post_error_rate / pre_error_rate
        failures.append(
            f"error rate elevated by {error_ratio:.2f}x "
            f"(pre: {pre_error_rate:.3f}%, post: {post_error_rate:.3f}%, threshold: 2.0x)"
        )

    if failures:
        print("[FAIL] Recovery validation failed:")
        for failure in failures:
            print(f"  - {failure}")
        print()
        print("Post-stress baseline shows degraded performance.")
        print("=" * 80)
        return 1

    print("[PASS] Recovery validation passed")
    print("System returned to healthy performance after stress was removed.")
    print("=" * 80)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local CI-equivalent checks with per-step timing."
    )
    parser.add_argument(
        "--suite",
        choices=("all", "backend", "frontend"),
        default="all",
        help="Which local suite to run (default: all).",
    )
    parser.add_argument(
        "--fullstack-mode",
        choices=("full", "smoke"),
        default="full",
        help="Mode for fullstack integration script (default: full).",
    )
    parser.add_argument(
        "--skip-fullstack",
        action="store_true",
        help="Skip fullstack integration layer (Layer 4).",
    )
    parser.add_argument(
        "--skip-frontend-latency",
        action="store_true",
        help="Skip frontend latency tests layer (Layer 5 - E2E with mocked backend).",
    )
    parser.add_argument(
        "--skip-terraform",
        action="store_true",
        help="Skip all Terraform checks from Layer 1 (fmt, validate, tflint, trivy, checkov, credential check).",
    )
    parser.add_argument(
        "--skip-openapi",
        action="store_true",
        help="Skip Spectral OpenAPI contract linting from Layer 1.",
    )
    parser.add_argument(
        "--skip-performance",
        action="store_true",
        help="Skip JMeter performance tests layer (Layer 7).",
    )
    parser.add_argument(
        "--performance-mode",
        choices=("baseline", "smoke", "concurrent", "burst", "stress", "full", "recovery", "full-with-recovery"),
        default="full",
        help=(
            "Mode for JMeter performance tests "
            "(default: full = concurrent+burst+stress; "
            "recovery = baseline+stress+baseline; "
            "full-with-recovery = baseline+concurrent+burst+stress+baseline)."
        ),
    )
    parser.add_argument(
        "--performance-repeats",
        type=int,
        default=1,
        help="Number of repeats per performance mode for Layer 7 (default: 1).",
    )
    parser.add_argument(
        "--performance-max-error-rate-pct",
        type=float,
        default=1.0,
        help="SLO threshold: max error rate percentage per repeat (default: 1.0).",
    )
    parser.add_argument(
        "--performance-max-p95-ms",
        type=float,
        default=5000.0,
        help="SLO threshold: max p95 latency in ms per repeat (default: 5000).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print all commands and timing sections without executing commands.",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help=(
            "Stop immediately on the first failed step. "
            "Default behavior is to continue running all steps and fail at the end."
        ),
    )
    parser.add_argument(
        "--local-phase5",
        action="store_true",
        help=(
            "Run the complete local pipeline through fullstack Phase 5 "
            "(forces suite=all, fullstack-mode=full, and skips Terraform/AWS checks)."
        ),
    )
    parser.add_argument(
        "--internal-recovery-compare",
        nargs=2,
        metavar=("PRE_DIR", "POST_DIR"),
        help="Internal: Compare pre-stress and post-stress baseline results for recovery mode.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Handle internal recovery comparison (invoked as a subprocess from the recovery step)
    if args.internal_recovery_compare:
        pre_dir = Path(args.internal_recovery_compare[0])
        post_dir = Path(args.internal_recovery_compare[1])
        return compare_recovery_baseline(pre_dir, post_dir)

    started_at = time.monotonic()

    if args.performance_repeats < 1:
        print("[FAIL] --performance-repeats must be >= 1")
        return 1

    if args.local_phase5:
        args.suite = "all"
        args.fullstack_mode = "full"
        args.skip_fullstack = False
        args.skip_frontend_latency = False
        args.skip_performance = False
        args.skip_terraform = True

    print("Running local CI-equivalent pipeline")
    print(f"Repository root: {REPO_ROOT}")
    print(f"Suite: {args.suite}")
    print(f"Fullstack mode: {args.fullstack_mode}")
    print(f"Performance mode: {args.performance_mode}")
    print(
        "Flags: "
        f"local_phase5={args.local_phase5}, "
        f"fail_fast={args.fail_fast}, "
        f"skip_fullstack={args.skip_fullstack}, "
        f"skip_frontend_latency={args.skip_frontend_latency}, "
        f"skip_performance={args.skip_performance}, "
        f"skip_terraform={args.skip_terraform}, "
        f"skip_openapi={args.skip_openapi}, "
        f"dry_run={args.dry_run}"
    )
    print(
        "Performance SLOs: "
        f"repeats={args.performance_repeats}, "
        f"max_error_rate_pct={args.performance_max_error_rate_pct}, "
        f"max_p95_ms={args.performance_max_p95_ms}"
    )

    try:
        steps = build_steps(args)
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    if not steps:
        print("[WARN] No steps to run for the selected options.")
        return 0

    run_dir = ensure_log_dirs()
    results: List[StepResult] = []
    current_phase = ""

    index = 0
    while index < len(steps):
        step = steps[index]

        if step.phase != current_phase:
            current_phase = step.phase
            print("")
            print("#" * 90)
            print(current_phase)
            print("#" * 90)

        if step.parallel_group:
            group: List[Step] = [step]
            group_index = index + 1
            next_index = index + 1
            while next_index < len(steps):
                next_step = steps[next_index]
                if (
                    next_step.phase != step.phase
                    or next_step.parallel_group != step.parallel_group
                ):
                    break
                group.append(next_step)
                next_index += 1

            group_results = run_parallel_group(
                group, run_dir, group_index, args.dry_run
            )
            results.extend(group_results)
            if any(result.status == "FAIL" for result in group_results) and args.fail_fast:
                print(
                    "[INFO] --fail-fast enabled: stopping after failure in "
                    f"parallel group '{step.parallel_group}'."
                )
                break
            index = next_index
            continue

        result = run_step(step, run_dir, index + 1, args.dry_run)
        results.append(result)
        if result.status == "FAIL" and args.fail_fast:
            print("[INFO] --fail-fast enabled: stopping after first failed step.")
            break
        index += 1

    write_summary(results, run_dir, started_at, args)
    prune_old_runs(keep=LOG_RETENTION_RUNS)
    print_summary(results, started_at)

    failed = any(r.status == "FAIL" for r in results)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
