"""Bootstrap script for pre-commit hooks.

This script is intended for new developers onboarding to the project.
It will:

1. Install the Python tooling listed in the top-level ``requirements.txt``
   (including ``pre-commit`` itself).
2. Install the git hooks defined in ``.pre-commit-config.yaml`` for both
   ``pre-commit`` and ``pre-push`` stages.

Typical usage (from the repository root):

	python scripts/pipelines/setup_precommit.py

The script is safe to run multiple times.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
	"""Run a command, echoing it and raising on failure."""

	cmd_display = " ".join(cmd)
	print(f"\n[setup-precommit] Running: {cmd_display}")

	try:
		subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)
	except subprocess.CalledProcessError as exc:
		print(f"[setup-precommit] Command failed with exit code {exc.returncode}.")
		sys.exit(exc.returncode)


def find_repo_root() -> Path:
	"""Return the repository root (directory containing this file's top-level)."""

	# This file lives at: <repo_root>/scripts/pipelines/setup_precommit.py
	this_file = Path(__file__).resolve()
	repo_root = this_file.parents[2]
	return repo_root


def ensure_venv(repo_root: Path) -> Path:
	"""Ensure a .venv exists and return its python executable.

	The venv is created at ``<repo_root>/.venv`` if it does not already exist.
	"""

	venv_dir = repo_root / ".venv"
	if not venv_dir.exists():
		print(f"[setup-precommit] Creating virtual environment at: {venv_dir}")
		run([sys.executable, "-m", "venv", str(venv_dir)])
	else:
		print(f"[setup-precommit] Using existing virtual environment at: {venv_dir}")

	if os.name == "nt":
		venv_python = venv_dir / "Scripts" / "python.exe"
	else:
		venv_python = venv_dir / "bin" / "python"

	if not venv_python.is_file():
		print(
			"[setup-precommit] ERROR: Could not find python executable in virtual "
			f"environment at {venv_python}."
		)
		sys.exit(1)

	print(f"[setup-precommit] Virtualenv python: {venv_python}")
	return venv_python


def ensure_requirements_installed(repo_root: Path, python_exe: Path) -> None:
	"""Install Python dependencies required for pre-commit.

	Uses the repository's top-level requirements.txt, which already pins
	``pre-commit``, ``black``, ``flake8`` and their helper packages.
	"""

	requirements_path = repo_root / "requirements.txt"

	if not requirements_path.is_file():
		print(
			"[setup-precommit] ERROR: requirements.txt not found at "
			f"{requirements_path}. Cannot install tooling."
		)
		sys.exit(1)

	print(f"[setup-precommit] Using requirements file: {requirements_path}")

	# Use the venv Python executable.
	run([str(python_exe), "-m", "pip", "install", "--upgrade", "pip"])
	run([str(python_exe), "-m", "pip", "install", "-r", str(requirements_path)])


def install_precommit_hooks(repo_root: Path, python_exe: Path) -> None:
	"""Install git hooks via pre-commit.

	We install both the default ``pre-commit`` hook and the ``pre-push`` hook
	because the configuration file defines hooks for both stages
	(e.g. Java Checkstyle runs on pre-push).
	"""

	config_path = repo_root / ".pre-commit-config.yaml"
	if not config_path.is_file():
		print(
			"[setup-precommit] WARNING: .pre-commit-config.yaml not found; "
			"skipping hook installation."
		)
		return

	print(f"[setup-precommit] Found config: {config_path}")

	# Install default pre-commit hook.
	run([str(python_exe), "-m", "pre_commit", "install"], cwd=repo_root)

	# Also install hooks configured for pre-push stage.
	run(
		[
			str(python_exe),
			"-m",
			"pre_commit",
			"install",
			"--hook-type",
			"pre-push",
		],
		cwd=repo_root,
	)

	# Optionally, download hook environments up-front so the first commit is fast.
	run([str(python_exe), "-m", "pre_commit", "gc"], cwd=repo_root)


def main() -> None:
	repo_root = find_repo_root()
	print(f"[setup-precommit] Repository root detected at: {repo_root}")
	venv_python = ensure_venv(repo_root)

	ensure_requirements_installed(repo_root, venv_python)
	install_precommit_hooks(repo_root, venv_python)

	print("\n[setup-precommit] Pre-commit tooling and hooks are installed and ready to use.")


if __name__ == "__main__":
	main()

