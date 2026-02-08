# Platform Abstraction Layer - Phase 1

## Overview

This is the foundation module for cross-platform pipeline support. It provides:

1. **Platform Detection** - Fast, cached detection of OS and execution context
2. **Platform-Specific Adapters** - Windows, Unix, and GitHub Actions utilities
3. **Unified Logging** - Console + HTML reports with timing
4. **Fail-Fast Philosophy** - Detect issues early with clear error messages

## Architecture

```
scripts/
├── core/                          # Platform-agnostic core
│   ├── platform.py               # Platform detection & abstractions
│   ├── logging.py                # Unified logging with HTML reports
│   └── validate_platform.py      # Validation & testing
│
└── platform/                      # Platform-specific adapters
    ├── windows.py                # Windows UTF-8 encoding, PowerShell
    ├── unix.py                   # macOS/Linux shell, package managers
    └── github_actions.py         # GitHub Actions workflow commands
```

## Key Features

### 🚀 Fast Platform Detection (Cached)

```python
from scripts.core.platform import get_platform_info, is_windows, is_unix

# Get platform info (cached, happens once)
info = get_platform_info()
print(f"Running on: {info.platform_type.value}")
print(f"Context: {info.execution_context.value}")

# Quick checks
if is_windows():
    # Windows-specific code
    pass
elif is_unix():
    # Unix-specific code
    pass
```

### ⚡ Fail-Fast Validation

```python
from scripts.core.platform import require_unix, require_windows

# Fail immediately if not on correct platform
require_unix()  # Raises EnvironmentError on Windows

# Find executables with fail-fast
platform = get_platform()
kubectl = platform.find_executable("kubectl", required=True)  # Fails if missing
```

### 📝 Unified Logging

```python
from scripts.core.logging import create_logger

# Auto-generates timestamped log + HTML report
logger = create_logger(name="Build Pipeline")

logger.info("Starting build...")
logger.success("Build completed!")
logger.warning("Deprecated API used")
logger.error("Build failed!")

# Grouping (GitHub Actions compatible)
with logger.group("Running Tests"):
    logger.info("Test 1 passed")
    logger.info("Test 2 passed")

# Timing
with logger.timer("Compilation"):
    # ... long operation ...
    pass

# Fail fast
if error_occurred:
    logger.fail_fast("Critical error detected", exit_code=1)
```

### 🖥️ Platform-Specific Utilities

#### Windows
```python
from scripts.platform.windows import (
    setup_windows_encoding,     # UTF-8 console setup
    run_powershell,             # Run PowerShell with UTF-8
    WindowsConsoleManager,      # Context manager for UTF-8
)

# One-time setup
setup_windows_encoding()

# Run PowerShell script
result = run_powershell("Get-ChildItem | Select-Object Name")

# Temporary UTF-8 context
with WindowsConsoleManager().utf8_console():
    # Run commands that need UTF-8
    pass
```

#### Unix (macOS/Linux)
```python
from scripts.platform.unix import (
    detect_package_manager,     # Detect brew/apt/dnf/etc
    require_tools,              # Fail fast if tools missing
    run_bash,                   # Run bash script
    make_executable,            # chmod +x
)

# Fail fast if tools missing
require_tools("kubectl", "helm", "kind")

# Detect package manager
pkg_mgr = detect_package_manager()
print(f"Using: {pkg_mgr.value}")
```

#### GitHub Actions
```python
from scripts.platform.github_actions import (
    get_github_context,
    set_output,
    log_error,
    GitHubGroup,
)

# Get workflow context
context = get_github_context()
print(f"Workflow: {context.workflow_name}")

# Set outputs
set_output("status", "success")

# Annotations
log_error("Build failed", file="main.py", line=42)

# Collapsible groups
with GitHubGroup("Building Application"):
    # ... build steps ...
    pass
```

## Usage

### Validation Test

Run the validation script to verify everything works:

```powershell
# Windows
python scripts\core\validate_platform.py

# Unix
python scripts/core/validate_platform.py
```

This will test:
- ✓ Platform detection
- ✓ Path operations
- ✓ Executable finding
- ✓ Logging system
- ✓ Platform-specific utilities

### Example Pipeline Script

```python
#!/usr/bin/env python3
"""Example pipeline using platform abstraction."""

import sys
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.core.platform import get_platform, is_windows
from scripts.core.logging import create_logger
from scripts.platform.windows import setup_windows_encoding

def main():
    # Setup encoding for Windows
    if is_windows():
        setup_windows_encoding()
    
    # Create logger
    logger = create_logger(name="Example Pipeline")
    
    try:
        platform = get_platform()
        
        logger.section("PLATFORM INFORMATION")
        logger.info(f"Platform: {platform.info.platform_type.value}")
        logger.info(f"Context: {platform.info.execution_context.value}")
        
        # Find required tools
        with logger.timer("Finding required tools"):
            git = platform.find_executable("git", required=True)
            logger.success(f"Found git: {git}")
        
        # Run platform-specific commands
        with logger.group("Running Tests"):
            if is_windows():
                from scripts.platform.windows import run_powershell
                result = run_powershell("Write-Host 'Hello from PowerShell'")
                logger.info(f"PowerShell output: {result.stdout.strip()}")
            else:
                from scripts.platform.unix import run_bash
                result = run_bash("echo 'Hello from Bash'")
                logger.info(f"Bash output: {result.stdout.strip()}")
        
        logger.success("Pipeline completed successfully!")
        return 0
    
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        logger.fail_fast("Exiting due to error", exit_code=1)

if __name__ == "__main__":
    sys.exit(main())
```

## Performance Characteristics

- **Platform Detection**: O(1) after first call (cached)
- **Path Normalization**: O(1) for most operations
- **Executable Finding**: O(n) where n = number of PATH entries
- **Logging**: Real-time console output, deferred HTML generation

## Fail-Fast Patterns

### 1. Required Executables
```python
# ✓ Good: Fail immediately if kubectl missing
kubectl = platform.find_executable("kubectl", required=True)

# ✗ Bad: Check later and get confusing error
kubectl = shutil.which("kubectl")
# ... 100 lines later ...
subprocess.run([kubectl, "get", "pods"])  # Fails with unclear error
```

### 2. Platform Requirements
```python
# ✓ Good: Fail fast with clear message
require_unix()  # "This operation requires Unix, but running on Windows"

# ✗ Bad: Fail later with obscure error
subprocess.run(["bash", "script.sh"])  # Windows: bash not found
```

### 3. Missing Tools
```python
# ✓ Good: Check all tools upfront
require_tools("kubectl", "helm", "kind")  # One clear error message

# ✗ Bad: Fail during execution
subprocess.run(["kubectl", ...])  # Fails
subprocess.run(["helm", ...])     # Also fails
subprocess.run(["kind", ...])     # Also fails (3 separate errors)
```

## Next Steps (Phase 2+)

With this foundation in place, we can now refactor pipelines:

1. **Phase 2**: K8s deployment pipeline (highest impact)
2. **Phase 3**: Backend testing pipeline
3. **Phase 4**: Frontend testing pipeline
4. **Phase 5**: Unified build-and-test-all
5. **Phase 6**: Dev setup pipeline
6. **Phase 7**: CI/CD validation

Each pipeline will use these core modules for cross-platform support.

## Troubleshooting

### Import Errors

If you see `ModuleNotFoundError: No module named 'scripts'`:

```python
# Add this at the top of your script
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
```

### Windows Encoding Issues

If you see encoding errors on Windows:

```python
# Call this once at script start
from scripts.platform.windows import setup_windows_encoding
setup_windows_encoding()
```

### Permission Errors (Unix)

If scripts aren't executable:

```python
from scripts.platform.unix import make_executable
make_executable(Path("script.sh"))
```

## Design Principles

1. **Fail Fast**: Detect issues early with clear errors
2. **Cache Results**: Expensive operations happen once
3. **Platform Agnostic**: Core logic works everywhere
4. **Type Safe**: Use enums and dataclasses
5. **Zero External Dependencies**: Core uses only stdlib
6. **Real-Time Output**: No buffering, see progress immediately
7. **Rich Reports**: HTML reports for CI/local debugging
