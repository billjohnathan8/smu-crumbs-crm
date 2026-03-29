#!/usr/bin/env python3
"""Convenience wrapper for frontend-focused local checks."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent.parent
    test_all = repo_root / "scripts" / "pipelines" / "test_all.py"
    cmd = [sys.executable, str(test_all), "--suite", "frontend", *sys.argv[1:]]
    return subprocess.call(cmd)


if __name__ == "__main__":
    sys.exit(main())
