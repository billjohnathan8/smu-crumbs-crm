# Troubleshooting

## Python command not found

Symptoms:

- Windows PowerShell shows Microsoft Store alias message for `python3`.
- Linux/macOS/WSL says `python` or `python3` is not found.

Fix:

1. Follow [prerequisites/PYTHON-REQUIREMENT.md](prerequisites/PYTHON-REQUIREMENT.md).
2. Use the correct command per environment:
   - Windows: `python`
   - Linux/macOS/WSL: `python3`

## Setup script fails fast on missing tools

`scripts/pipelines/setup_dev_env.py` validates prerequisites first.
Install missing required tools, then re-run setup.

## `sudo` failures in WSL

If `sudo` asks for a password and fails, use your WSL user password (not your Windows PIN/password manager autofill).
If needed, reset WSL user password from an elevated shell:

```powershell
wsl -u root
passwd <your_wsl_username>
```
