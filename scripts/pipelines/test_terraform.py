#!/usr/bin/env python3
"""Standalone local Terraform verification pipeline.

This runner is intentionally isolated from test_all.py so the main local
pipeline does not execute it unless called explicitly.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TERRAFORM_DIR = REPO_ROOT / "platform" / "terraform"
BUILD_LAMBDA_ARTIFACTS = REPO_ROOT / "scripts" / "ci" / "build_lambda_artifacts.py"
CHECK_TERRAFORM_LOCKFILE = REPO_ROOT / "scripts" / "ci" / "check_terraform_lockfile.py"
RUN_OPENTOFU_VALIDATE_ISOLATED = (
    REPO_ROOT / "scripts" / "ci" / "run_opentofu_validate_isolated.py"
)


@dataclass
class Step:
    name: str
    cwd: Path
    command: List[str]
    env: Dict[str, str] = field(default_factory=dict)


def display_command(command: List[str]) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(command)
    return " ".join(command)


def run_step(step: Step, dry_run: bool) -> int:
    print(f"\n[STEP] {step.name}")
    print(f"       cwd: {step.cwd}")
    print(f"       cmd: {display_command(step.command)}")
    if dry_run:
        return 0

    env = os.environ.copy()
    for key, value in step.env.items():
        if value == "":
            env.pop(key, None)
        else:
            env[key] = value
    result = subprocess.run(step.command, cwd=step.cwd, env=env, check=False)
    return result.returncode


def build_tf_no_aws_env() -> Dict[str, str]:
    no_creds_path = str(REPO_ROOT / ".nonexistent-aws-creds")
    return {
        "AWS_ACCESS_KEY_ID": "",
        "AWS_SECRET_ACCESS_KEY": "",
        "AWS_SESSION_TOKEN": "",
        "AWS_PROFILE": "",
        "AWS_DEFAULT_PROFILE": "",
        "AWS_SHARED_CREDENTIALS_FILE": no_creds_path,
        "AWS_CONFIG_FILE": no_creds_path,
    }


def detect_opentofu() -> str | None:
    return shutil.which("opentofu") or shutil.which("tofu")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Terraform-only local pipeline checks (isolated from test_all.py)."
    )
    parser.add_argument(
        "--skip-tflint",
        action="store_true",
        help="Skip TFLint init/run checks.",
    )
    parser.add_argument(
        "--skip-checkov",
        action="store_true",
        help="Skip Checkov install/scan checks.",
    )
    parser.add_argument(
        "--skip-lambda-artifacts",
        action="store_true",
        help="Skip lambda artifact build + feature-flagged terraform validate.",
    )
    parser.add_argument(
        "--skip-opentofu",
        action="store_true",
        help="Skip OpenTofu validate-only steps.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned steps without executing commands.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    py = sys.executable

    if shutil.which("terraform") is None:
        print("[FAIL] terraform is not found in PATH.")
        return 1
    if not TERRAFORM_DIR.exists():
        print(f"[FAIL] Terraform directory does not exist: {TERRAFORM_DIR}")
        return 1

    tf_no_aws_env = build_tf_no_aws_env()
    tf_flags_env = {
        **tf_no_aws_env,
        "TF_VAR_enable_log_lambda": "true",
        "TF_VAR_enable_aml_lambda": "true",
        "TF_VAR_enable_sftp_transaction_collector": "true",
        "TF_VAR_enable_verification_pipeline": "true",
        "TF_VAR_enable_audit_pipeline": "true",
        "TF_VAR_enable_aml_pipeline": "true",
        "TF_VAR_ses_sender_email": "verification@crm.local",
    }

    tofu_cmd = None
    if args.skip_opentofu:
        print("[INFO] --skip-opentofu set; skipping OpenTofu validate-only steps.")
    else:
        tofu_cmd = detect_opentofu()
        if tofu_cmd is None:
            print("[WARN] OpenTofu not found in PATH; skipping OpenTofu validate-only steps.")

    steps: List[Step] = [
        Step(
            name="Terraform fmt check",
            cwd=TERRAFORM_DIR,
            command=["terraform", "fmt", "-check", "-recursive"],
        ),
        Step(
            name="Terraform init (no backend)",
            cwd=TERRAFORM_DIR,
            command=["terraform", "init", "-backend=false", "-lockfile=readonly"],
            env=tf_no_aws_env,
        ),
        Step(
            name="Check lockfile is Terraform-authored",
            cwd=REPO_ROOT,
            command=[py, str(CHECK_TERRAFORM_LOCKFILE)],
        ),
        Step(
            name="Terraform validate",
            cwd=TERRAFORM_DIR,
            command=["terraform", "validate"],
            env=tf_no_aws_env,
        ),
    ]

    if not args.skip_lambda_artifacts:
        steps.append(
            Step(
                name="Build operable lambda artifacts",
                cwd=REPO_ROOT,
                command=[py, str(BUILD_LAMBDA_ARTIFACTS)],
            )
        )
        steps.append(
            Step(
                name="Terraform validate (operable lambda feature flags)",
                cwd=TERRAFORM_DIR,
                command=["terraform", "validate"],
                env=tf_flags_env,
            )
        )

    if tofu_cmd is not None:
        steps.append(
            Step(
                name="OpenTofu validate",
                cwd=REPO_ROOT,
                command=[
                    py,
                    str(RUN_OPENTOFU_VALIDATE_ISOLATED),
                    "--tofu-bin",
                    tofu_cmd,
                ],
                env=tf_no_aws_env,
            )
        )
        if not args.skip_lambda_artifacts:
            steps.append(
                Step(
                    name="OpenTofu validate (operable lambda feature flags)",
                    cwd=REPO_ROOT,
                    command=[
                        py,
                        str(RUN_OPENTOFU_VALIDATE_ISOLATED),
                        "--tofu-bin",
                        tofu_cmd,
                    ],
                    env=tf_flags_env,
                )
            )
        steps.append(
            Step(
                name="Verify lockfile unchanged after OpenTofu validate",
                cwd=REPO_ROOT,
                command=[py, str(CHECK_TERRAFORM_LOCKFILE)],
            )
        )
        steps.append(
            Step(
                name="Verify no OpenTofu lockfile drift",
                cwd=TERRAFORM_DIR,
                command=["git", "diff", "--exit-code", "--", ".terraform.lock.hcl"],
            )
        )

    if not args.skip_tflint:
        if shutil.which("tflint") is None:
            print("[WARN] tflint not found in PATH; skipping TFLint checks.")
        else:
            steps.extend(
                [
                    Step(
                        name="TFLint init",
                        cwd=TERRAFORM_DIR,
                        command=["tflint", "--init"],
                    ),
                    Step(
                        name="TFLint run",
                        cwd=TERRAFORM_DIR,
                        command=["tflint", "--format", "compact"],
                    ),
                ]
            )

    if not args.skip_checkov:
        steps.extend(
            [
                Step(
                    name="Install Checkov",
                    cwd=TERRAFORM_DIR,
                    command=[py, "-m", "pip", "install", "checkov"],
                ),
                Step(
                    name="Checkov scan",
                    cwd=TERRAFORM_DIR,
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
                ),
            ]
        )

    print("Running Terraform-only local pipeline")
    print(f"Repository root: {REPO_ROOT}")
    print(f"Terraform dir: {TERRAFORM_DIR}")
    print(
        "Flags: "
        f"skip_tflint={args.skip_tflint}, "
        f"skip_checkov={args.skip_checkov}, "
        f"skip_lambda_artifacts={args.skip_lambda_artifacts}, "
        f"skip_opentofu={args.skip_opentofu}, "
        f"dry_run={args.dry_run}"
    )

    if not args.dry_run:
        terraform_cache = TERRAFORM_DIR / ".terraform"
        shutil.rmtree(terraform_cache, ignore_errors=True)
        if not terraform_cache.exists():
            print("\n[STEP] Terraform clean .terraform cache")
            print(f"       cleaned: {terraform_cache}")

    for step in steps:
        code = run_step(step, args.dry_run)
        if code != 0:
            print(f"\n[FAIL] {step.name} failed with exit code {code}.")
            return code

    print("\n[OK] Terraform-only local pipeline completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

