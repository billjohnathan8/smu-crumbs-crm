# Troubleshooting

## Python command not found

- Windows PowerShell: use `python`, not `python3`.
- Linux/macOS/WSL: use `python3`.
- If missing, follow [prerequisites/PYTHON-REQUIREMENT.md](prerequisites/PYTHON-REQUIREMENT.md).

## Setup script fails fast on missing tools

`scripts/pipelines/setup_dev_env.py` validates prerequisites first.
Install the missing tool, then rerun setup.

Check status quickly:

```bash
python scripts/pipelines/setup_dev_env.py --doctor
```

## `sudo` failures in WSL

Use your WSL account password (not your Windows PIN).
If needed, reset it:

```powershell
wsl -u root
passwd <your_wsl_username>
```

## Fullstack tests fail to start

Symptoms usually include failed health checks for gateway or LocalStack.

1. Ensure Docker is running.
2. Re-run `bash scripts/ci/run-fullstack-integration-e2e.sh`.
3. Check logs in `build-logs/fullstack-integration/`.
