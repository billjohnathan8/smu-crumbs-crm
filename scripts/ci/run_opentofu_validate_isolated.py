#!/usr/bin/env python3
"""Run OpenTofu init/validate in an isolated temporary workspace.

This preserves repository lockfile policy while still exercising OpenTofu.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> int:
    print(f"[RUN] cwd={cwd}")
    print(f"[RUN] cmd={' '.join(cmd)}")
    completed = subprocess.run(cmd, cwd=cwd, check=False)
    return completed.returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run OpenTofu init/validate in an isolated temp copy of platform/terraform."
    )
    parser.add_argument(
        "--terraform-dir",
        default=str(Path(__file__).resolve().parents[2] / "platform" / "terraform"),
        help="Path to terraform root to copy into isolated workspace.",
    )
    parser.add_argument(
        "--tofu-bin",
        default="tofu",
        help="OpenTofu binary path/name (e.g. tofu, opentofu, full path).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = Path(args.terraform_dir).resolve()
    if not source_dir.exists():
        print(f"[FAIL] Terraform directory not found: {source_dir}")
        return 1

    temp_root = Path(tempfile.mkdtemp(prefix="tofu-validate-"))
    isolated_dir = temp_root / "terraform"
    try:
        shutil.copytree(
            source_dir,
            isolated_dir,
            ignore=shutil.ignore_patterns(
                ".terraform",
                ".tfplan",
                ".infracost",
            ),
        )

        init_code = run([args.tofu_bin, "init", "-backend=false"], isolated_dir)
        if init_code != 0:
            print(f"[FAIL] OpenTofu init failed with exit code {init_code}")
            return init_code

        validate_code = run([args.tofu_bin, "validate"], isolated_dir)
        if validate_code != 0:
            print(f"[FAIL] OpenTofu validate failed with exit code {validate_code}")
            return validate_code
    finally:
        # Windows can briefly lock provider executables; cleanup is best-effort.
        cleaned = False
        for _ in range(4):
            try:
                shutil.rmtree(temp_root, ignore_errors=False)
                cleaned = True
                break
            except PermissionError:
                time.sleep(0.5)
        if not cleaned and temp_root.exists():
            print(f"[WARN] Could not fully clean temp directory: {temp_root}")

    print("[OK] OpenTofu isolated validate completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
