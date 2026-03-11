# New Developer Setup

This guide is the required starting point for new contributors.

## Prerequisites

- Git
- Docker Desktop (or Docker Engine)
- Java 21
- Node.js 22+
- Python 3.12+
- Make

For Python-specific checks and troubleshooting, see [../prerequisites/PYTHON-REQUIREMENT.md](../prerequisites/PYTHON-REQUIREMENT.md).

## Step 1: Verify Python before running project scripts

On Windows PowerShell:

```powershell
python --version
python -m pip --version
```

On Linux/macOS/WSL:

```bash
python3 --version
python3 -m pip --version
```

If these commands fail, install Python first. The project setup script does not install Python itself.

## Step 2: Run bootstrap

From repository root on Windows:

```powershell
.\scripts\setup\setup-dev.ps1
```

Direct script invocation:

```bash
python scripts/pipelines/setup_dev_env.py
```

If `python` is unavailable on Linux/macOS/WSL:

```bash
python3 scripts/pipelines/setup_dev_env.py
```

## Step 3: Verify local pipeline

```bash
python scripts/pipelines/test_all.py
```

Use `python3` instead of `python` when needed.

Common local options:

```bash
# Skip fullstack integration layer when bash/localstack/docker are not ready
python scripts/pipelines/test_all.py --skip-fullstack

# Use PR-equivalent fullstack mode
python scripts/pipelines/test_all.py --fullstack-mode smoke
```

## Windows + WSL note

- Installing Python in WSL does not make `python`/`python3` available in Windows PowerShell.
- Installing Python in Windows does not make it available inside WSL.
- You may need to install Python in both environments if you use both.
