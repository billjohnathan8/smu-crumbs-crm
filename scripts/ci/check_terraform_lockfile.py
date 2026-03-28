#!/usr/bin/env python3
"""Validate that platform/terraform lockfile stays Terraform-authored."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    lockfile = repo_root / "platform" / "terraform" / ".terraform.lock.hcl"

    if not lockfile.exists():
        print(f"[FAIL] Missing lockfile: {lockfile}")
        return 1

    content = lockfile.read_text(encoding="utf-8")
    failures: list[str] = []

    if '"tofu init"' in content:
        failures.append('lockfile contains "tofu init" header')
    if "registry.opentofu.org/" in content:
        failures.append("lockfile contains registry.opentofu.org provider sources")
    if "registry.terraform.io/" not in content:
        failures.append("lockfile does not contain registry.terraform.io provider sources")

    if failures:
        print(f"[FAIL] Terraform lockfile policy violation: {lockfile}")
        for issue in failures:
            print(f" - {issue}")
        return 1

    print(f"[OK] Terraform lockfile policy check passed: {lockfile}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
