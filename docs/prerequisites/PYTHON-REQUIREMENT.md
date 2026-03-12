# Python Requirement Guide

Python 3.12+ is required for project setup and test pipelines.

## Quick Check

Windows:

```powershell
python --version
python -m pip --version
```

Linux/macOS/WSL:

```bash
python3 --version
python3 -m pip --version
```

## Command Mapping

- Windows: use `python`
- Linux/macOS/WSL: use `python3`

## Common Windows Issue

If `python3` opens Microsoft Store, use `python` instead.

Install Python (Windows):

```powershell
winget install Python.Python.3.12
```

Then restart terminal and re-check versions.

## Common WSL Setup

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv
```

## Important

`scripts/pipelines/setup_dev_env.py` does not install Python. It expects Python to already exist.
