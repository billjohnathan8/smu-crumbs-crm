# New Developer Setup

Run all commands from the repository root.

## Prerequisites

- Git
- Docker Desktop (or Docker Engine)
- Java 21
- Node.js 22+
- Python 3.12+
- Make

Python command mapping:
- Windows PowerShell: `python`
- Linux/macOS/WSL: `python3`

## 1. Verify Python

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

If this fails, see [../prerequisites/PYTHON-REQUIREMENT.md](../prerequisites/PYTHON-REQUIREMENT.md).

## 2. Run setup

Windows (recommended):

```powershell
.\scripts\setup\setup-dev.ps1
```

Cross-platform:

```bash
python scripts/pipelines/setup_dev_env.py
```

Use `python3` where required.

## 3. Run validation

```bash
python scripts/pipelines/test_all.py
```

Useful options:

```bash
python scripts/pipelines/test_all.py --skip-fullstack
python scripts/pipelines/test_all.py --fullstack-mode smoke
python scripts/pipelines/test_all.py --dry-run
```

## Windows + WSL

Python installation is per environment. If you use both Windows and WSL shells, install Python in both.
