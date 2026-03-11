# Python Requirement Guide

The project requires Python 3.12+.

## Required checks

Run these before any project bootstrap/test scripts.

Windows PowerShell:

```powershell
python --version
python -m pip --version
```

Linux/macOS/WSL:

```bash
python3 --version
python3 -m pip --version
```

## Common issue: `python3` not found in Windows PowerShell

If you see a Microsoft Store message when running `python3` on Windows:

- Use `python` on Windows instead of `python3`.
- Ensure Python is installed from `python.org` or `winget`.

Install on Windows:

```powershell
winget install Python.Python.3.12
```

Then open a new terminal and re-run:

```powershell
python --version
python -m pip --version
```

## WSL-specific setup (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv
python3 --version
python3 -m pip --version
```

## Command mapping by environment

- Windows: `python ...`
- Linux/macOS/WSL: `python3 ...`

Examples:

- Windows (recommended): `.\scripts\setup\setup-dev.ps1`
- Windows: `python scripts/pipelines/setup_dev_env.py`
- Linux/macOS/WSL: `python3 scripts/pipelines/setup_dev_env.py`

## Important

`scripts/pipelines/setup_dev_env.py` assumes Python already exists. It validates prerequisites and fails fast when required tools are missing.
