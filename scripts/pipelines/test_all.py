#!/usr/bin/env python3
"""
Local CI-equivalent runner for the main GitHub Actions pipeline.

This script is local-only and does not modify any GitHub Actions workflow.
It runs the same logical layers as `.github/workflows/ci-main.yml`:

1) Lint / format / typecheck
2) Unit/component tests
3) Frontend mocked E2E
4) Fullstack integration E2E (LocalStack + containers + Playwright)
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


@dataclass
class Step:
    phase: str
    name: str
    cwd: Path
    command: List[str]
    env: Dict[str, str] = field(default_factory=dict)
    parallel_group: Optional[str] = None


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
    infracost_available = shutil.which("infracost") is not None

    services_backend = REPO_ROOT / "services" / "backend"
    frontend_dir = REPO_ROOT / "services" / "frontend" / "crm-ui"
    terraform_dir = REPO_ROOT / "platform" / "terraform"

    steps: List[Step] = []

    run_backend = args.suite in ("all", "backend")
    run_frontend = args.suite in ("all", "frontend")

    phase = "Layer 1 - Lint / Format / Typecheck"
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
        phase = "Layer 1 - Lint / Format / Typecheck"

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

        for label, svc_dir in [
            ("log", log_dir),
            ("aml", aml_dir),
            ("sftp-transaction-collector", sftp_transaction_collector_dir),
            ("verification", verification_dir),
        ]:
            steps.append(
                Step(
                    phase=phase,
                    name=f"Python deps install ({label})",
                    cwd=svc_dir,
                    command=[py, "-m", "pip", "install", "-r", "requirements.txt"],
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
                    command=["terraform", "init", "-backend=false"],
                    env=_tf_no_aws_env,
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
                    env={
                        **_tf_no_aws_env,
                        "TF_VAR_enable_log_lambda": "true",
                        "TF_VAR_enable_aml_lambda": "true",
                        "TF_VAR_enable_sftp_transaction_collector": "true",
                        "TF_VAR_enable_verification_pipeline": "true",
                        "TF_VAR_ses_sender_email": "verification@crm.local",
                    },
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
            if infracost_available and os.environ.get("INFRACOST_API_KEY"):
                steps.append(
                    Step(
                        phase=phase,
                        name="Infracost breakdown",
                        cwd=terraform_dir,
                        command=["infracost", "breakdown", "--path=.", "--format=table"],
                    )
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

    if run_frontend:
        phase = "Layer 1 - Lint / Format / Typecheck"
        if is_windows():
            # On Windows, node.exe (Vite dev server, previous builds) can hold a file lock
            # on esbuild.exe inside node_modules, causing npm ci to fail with EPERM.
            # Terminate any stale node processes before reinstalling.
            steps.append(
                Step(
                    phase=phase,
                    name="Kill stale node processes (Windows pre-npm-ci)",
                    cwd=frontend_dir,
                    command=[
                        "cmd.exe",
                        "/c",
                        "taskkill /F /IM node.exe /T 2>nul & exit 0",
                    ],
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
                command=["npm", "audit", "fix"],
            )
        )
        steps.append(
            Step(
                phase=phase,
                name="Frontend npm audit",
                cwd=frontend_dir,
                command=["npm", "audit"],
            )
        )

    if not args.skip_openapi:
        phase = "Layer 1 - Lint / Format / Typecheck"
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

    if run_backend:
        phase = "Layer 2 - Unit / Component Tests"
        backend_parallel_group = "backend-unit-tests"

        log_dir = services_backend / "log"
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

    if run_frontend:
        phase = "Layer 2 - Unit / Component Tests"
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

        if not args.skip_mocked_e2e:
            phase = "Layer 3 - Frontend Mocked E2E"
            steps.append(
                Step(
                    phase=phase,
                    name="Frontend npm ci (mocked e2e stage)",
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
                    name="Install Playwright browser (mocked e2e)",
                    cwd=frontend_dir,
                    command=playwright_install,
                )
            )
            steps.append(
                Step(
                    phase=phase,
                    name="Run mocked E2E",
                    cwd=frontend_dir,
                    command=["npm", "run", "e2e:mocked"],
                )
            )

    if args.suite == "all" and not args.skip_fullstack:
        if not bash:
            raise RuntimeError(
                "Unable to find 'bash' required for fullstack integration script. "
                "Install Git Bash (Windows) or a Unix shell, or run with --skip-fullstack."
            )

        phase = "Layer 4 - Fullstack Integration E2E"
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
                env={"FULLSTACK_MODE": args.fullstack_mode},
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

    with log_file.open("w", encoding="utf-8", errors="replace") as handle:
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
            print(line, end="")
            handle.write(line)

        return_code = process.wait()

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

    with log_file.open("w", encoding="utf-8", errors="replace") as handle:
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

    elapsed = time.monotonic() - start
    status = "PASS" if completed.returncode == 0 else "FAIL"
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
        "local_phase5": args.local_phase5,
        "dry_run": args.dry_run,
        "skip_fullstack": args.skip_fullstack,
        "skip_mocked_e2e": args.skip_mocked_e2e,
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
    lines.append(f"- Local phase5 preset: `{args.local_phase5}`")
    lines.append(f"- Dry-run: `{args.dry_run}`")
    lines.append(f"- Success: `{ok}`")
    lines.append(f"- Total runtime (s): `{total_seconds:.1f}`")
    lines.append(f"- Run logs: `{run_dir}`")
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
        "--skip-mocked-e2e",
        action="store_true",
        help="Skip mocked frontend E2E layer (Layer 3).",
    )
    parser.add_argument(
        "--skip-terraform",
        action="store_true",
        help="Skip all Terraform checks from Layer 1 (fmt, validate, tflint, checkov, credential check).",
    )
    parser.add_argument(
        "--skip-openapi",
        action="store_true",
        help="Skip Spectral OpenAPI contract linting from Layer 1.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print all commands and timing sections without executing commands.",
    )
    parser.add_argument(
        "--local-phase5",
        action="store_true",
        help=(
            "Run the complete local pipeline through fullstack Phase 5 "
            "(forces suite=all, fullstack-mode=full, and skips Terraform/AWS checks)."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started_at = time.monotonic()

    if args.local_phase5:
        args.suite = "all"
        args.fullstack_mode = "full"
        args.skip_fullstack = False
        args.skip_mocked_e2e = False
        args.skip_terraform = True

    print("Running local CI-equivalent pipeline")
    print(f"Repository root: {REPO_ROOT}")
    print(f"Suite: {args.suite}")
    print(f"Fullstack mode: {args.fullstack_mode}")
    print(
        "Flags: "
        f"local_phase5={args.local_phase5}, "
        f"skip_fullstack={args.skip_fullstack}, "
        f"skip_mocked_e2e={args.skip_mocked_e2e}, "
        f"skip_terraform={args.skip_terraform}, "
        f"skip_openapi={args.skip_openapi}, "
        f"dry_run={args.dry_run}"
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
            if any(result.status == "FAIL" for result in group_results):
                break
            index = next_index
            continue

        result = run_step(step, run_dir, index + 1, args.dry_run)
        results.append(result)
        if result.status == "FAIL":
            break
        index += 1

    write_summary(results, run_dir, started_at, args)
    prune_old_runs(keep=LOG_RETENTION_RUNS)
    print_summary(results, started_at)

    failed = any(r.status == "FAIL" for r in results)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
