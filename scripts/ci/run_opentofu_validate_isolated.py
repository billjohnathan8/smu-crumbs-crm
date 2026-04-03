#!/usr/bin/env python3
"""Run OpenTofu init/validate in an isolated temporary workspace.

This preserves repository lockfile policy while still exercising OpenTofu.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def run(cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> int:
    print(f"[RUN] cwd={cwd}")
    print(f"[RUN] cmd={' '.join(cmd)}")
    completed = subprocess.run(cmd, cwd=cwd, env=env, check=False)
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
    mirror_root = temp_root / "provider-mirror"
    tofu_cli_config = temp_root / "tofu.tfrc"
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

        providers_dir = source_dir / ".terraform" / "providers"
        env = os.environ.copy()
        if providers_dir.exists():
            shutil.copytree(providers_dir, mirror_root)

            terraform_host = mirror_root / "registry.terraform.io"
            opentofu_host = mirror_root / "registry.opentofu.org"
            if terraform_host.exists() and not opentofu_host.exists():
                shutil.copytree(terraform_host, opentofu_host)

            tofu_cli_config.write_text(
                (
                    "provider_installation {\n"
                    "  filesystem_mirror {\n"
                    f"    path = \"{mirror_root.as_posix()}\"\n"
                    "    include = [\n"
                    '      "registry.terraform.io/hashicorp/*",\n'
                    '      "registry.opentofu.org/hashicorp/*",\n'
                    "    ]\n"
                    "  }\n"
                    "  direct {\n"
                    "    exclude = [\n"
                    '      "registry.terraform.io/hashicorp/*",\n'
                    '      "registry.opentofu.org/hashicorp/*",\n'
                    "    ]\n"
                    "  }\n"
                    "}\n"
                ),
                encoding="utf-8",
            )
            env["TF_CLI_CONFIG_FILE"] = str(tofu_cli_config)
            print(f"[INFO] Using provider mirror from {providers_dir}")
        else:
            print(f"[WARN] No provider cache found at {providers_dir}; using direct registry access.")

        init_code = run([args.tofu_bin, "init", "-backend=false"], isolated_dir, env=env)
        if init_code != 0:
            print(f"[FAIL] OpenTofu init failed with exit code {init_code}")
            return init_code

        validate_code = run([args.tofu_bin, "validate"], isolated_dir, env=env)
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
