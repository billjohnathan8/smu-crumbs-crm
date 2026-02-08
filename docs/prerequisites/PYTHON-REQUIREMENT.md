# Python Prerequisite

## Quick Answer

**Yes, you need Python 3.8 or higher installed** to use the new cross-platform build scripts.

## Why Python?

The project's build system has been modernized to use Python scripts that work identically on Windows, macOS, and Linux, replacing 6000+ lines of duplicate PowerShell and Bash scripts.

**Benefits:**
- ✅ **Already required** - Backend has a Python service (`services/backend/log`)
- ✅ **Cross-platform** - Same script runs everywhere
- ✅ **42% less code** - 3500 lines vs 6000+ lines (PowerShell + Bash)
- ✅ **Single source of truth** - No more .ps1/.sh duplication
- ✅ **Better maintainability** - Easier to test and debug

## Installing Python

### Windows

**Option 1 - winget (Recommended):**
```powershell
winget install Python.Python.3.12
```

**Option 2 - Chocolatey:**
```powershell
choco install python
```

**Option 3 - Manual:**
1. Download from [python.org](https://www.python.org/downloads/)
2. **Important**: Check "Add Python to PATH" during installation
3. Restart your terminal

### macOS

**Option 1 - Homebrew (Recommended):**
```bash
brew install python@3.12
```

**Option 2 - Manual:**
Download from [python.org](https://www.python.org/downloads/)

### Linux

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

**Fedora/RHEL:**
```bash
sudo dnf install python3 python3-pip
```

**Arch:**
```bash
sudo pacman -S python python-pip
```

## Verify Installation

```powershell
# Check Python is installed
python --version
# Should show: Python 3.8.x or higher

# Verify it's in PATH
where python     # Windows
which python3    # macOS/Linux
```

## First-Time Setup

After installing Python, run the bootstrap script:

**Windows:**
```powershell
.\scripts\wrappers\bootstrap-setup.cmd --doctor
```

**macOS/Linux:**
```bash
chmod +x scripts/wrappers/bootstrap-setup.sh
./scripts/wrappers/bootstrap-setup.sh --doctor
```

This will:
1. ✅ Verify Python installation
2. ✅ Check all other dependencies (Docker, Node.js, Java, etc.)
3. ✅ Guide you through installing missing tools
4. ✅ Run the full developer setup

## Alternative: Use Old Scripts (Deprecated)

If you absolutely cannot install Python, the old PowerShell/Bash scripts still exist in `scripts/legacy/` but:
- ⚠️ They are **deprecated** and will be removed in 6 months
- ⚠️ They won't receive bug fixes or updates
- ⚠️ GitHub Actions workflows no longer use them

**Not recommended** - just install Python instead!

## FAQ

**Q: Why not use PowerShell Core (cross-platform)?**  
A: Python is already a project dependency (backend service), more developers know it, and it's better suited for this type of automation.

**Q: Why not use Node.js (already have it for frontend)?**  
A: Python is more natural for system administration tasks, has better cross-platform path handling, and is already required for the backend.

**Q: Can I use Python from Windows Store?**  
A: Yes, but `winget` installation is recommended for better PATH integration.

**Q: What about Python 2?**  
A: Python 2 is end-of-life. You **must** use Python 3.8+.

**Q: Do CI/CD workflows need Python?**  
A: Yes, but GitHub Actions runners have Python pre-installed, so no action needed there.

## Minimum Versions

| Requirement | Minimum Version | Why |
|-------------|----------------|-----|
| Python | 3.8 | Type hints, pathlib improvements |
| Docker | 20.10 | kind compatibility |
| Node.js | 18.x | Frontend React 18 |
| Java | 21 | Backend Spring Boot 3.x |

## Summary

**Python is now a core dependency** for local development, just like Docker, Node.js, and Java. The one-time installation effort pays off with:
- Faster iteration (no more maintaining duplicate scripts)
- Better developer experience (same commands across all platforms)  
- Reduced maintenance burden (42% less code)

Install Python once, benefit forever! 🐍
