"""
Unix-specific platform utilities (macOS/Linux).

Handles Unix-specific concerns:
- Shell script execution (bash, zsh)
- Package manager detection
- Unix path handling
- WSL detection and handling

Fail-fast philosophy: Detect missing tools early.
"""

import os
import subprocess
import sys
from enum import Enum
from pathlib import Path
from typing import Union
from typing import Dict, List, Optional, Tuple


def require_unix():
    """Fail fast if not running on Unix-like system."""
    from scripts.core.detect import get_platform_info
    info = get_platform_info()
    if not info.is_unix:
        raise EnvironmentError(
            f"This operation requires Unix-like system (macOS/Linux), "
            f"but running on {info.platform_type.value}"
        )


def is_wsl() -> bool:
    """Check if running under WSL."""
    from scripts.core.detect import get_platform_info
    return get_platform_info().is_wsl


class PackageManager(Enum):
    """Supported Unix package managers."""
    HOMEBREW = "brew"           # macOS, Linux
    APT = "apt"                 # Debian, Ubuntu
    YUM = "yum"                 # RedHat, CentOS
    DNF = "dnf"                 # Fedora
    PACMAN = "pacman"           # Arch
    UNKNOWN = "unknown"


def detect_package_manager() -> PackageManager:
    """
    Detect available package manager.
    Fast: Checks in order of likelihood.
    
    Returns:
        PackageManager enum
    """
    require_unix()
    
    # Check in order of likelihood for our target environments
    managers = [
        ("brew", PackageManager.HOMEBREW),
        ("apt-get", PackageManager.APT),
        ("apt", PackageManager.APT),
        ("dnf", PackageManager.DNF),
        ("yum", PackageManager.YUM),
        ("pacman", PackageManager.PACMAN),
    ]
    
    import shutil
    for cmd, manager in managers:
        if shutil.which(cmd):
            return manager
    
    return PackageManager.UNKNOWN


def run_bash(
    script: str,
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    capture_output: bool = True,
    check: bool = True,
    timeout: Optional[int] = None,
) -> subprocess.CompletedProcess:
    """
    Run bash script with proper error handling.
    
    Args:
        script: Bash script content
        cwd: Working directory
        env: Environment variables
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        timeout: Timeout in seconds
        
    Returns:
        CompletedProcess instance
    """
    require_unix()
    
    # Build bash command with -euo pipefail for fail-fast
    # -e: Exit on error
    # -u: Exit on undefined variable
    # -o pipefail: Pipeline fails if any command fails
    cmd = ["bash", "-c", f"set -euo pipefail; {script}"]
    
    # Merge environment
    run_env = {**os.environ}
    if env:
        run_env.update(env)
    
    result = subprocess.run(
        cmd,
        cwd=cwd,
        env=run_env,
        capture_output=capture_output,
        check=check,
        timeout=timeout,
        text=True,
        encoding='utf-8',
        errors='replace',
    )
    
    return result


def run_shell_command(
    command: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    capture_output: bool = True,
    check: bool = True,
    timeout: Optional[int] = None,
    shell: bool = False,
) -> subprocess.CompletedProcess:
    """
    Run Unix command with proper error handling.
    
    Args:
        command: Command and arguments
        cwd: Working directory
        env: Environment variables
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        timeout: Timeout in seconds
        shell: Use shell=True (avoid unless necessary)
        
    Returns:
        CompletedProcess instance
    """
    require_unix()
    
    # Merge environment
    run_env = {**os.environ}
    if env:
        run_env.update(env)
    
    result = subprocess.run(
        command,
        cwd=cwd,
        env=run_env,
        capture_output=capture_output,
        check=check,
        timeout=timeout,
        text=True,
        encoding='utf-8',
        errors='replace',
        shell=shell,
    )
    
    return result


def make_executable(script_path: Path) -> None:
    """
    Make script executable (chmod +x).
    
    Args:
        script_path: Path to script file
        
    Raises:
        FileNotFoundError: If script doesn't exist
    """
    require_unix()
    
    if not script_path.exists():
        raise FileNotFoundError(f"Script not found: {script_path}")
    
    # Add execute permission for user, group, others (read permissions)
    import stat
    current_permissions = script_path.stat().st_mode
    new_permissions = current_permissions | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
    script_path.chmod(new_permissions)


def normalize_unix_path(path: Union[str, Path]) -> str:
    """
    Normalize path for Unix.
    
    - Expands ~ to home directory
    - Resolves relative paths
    - Converts to forward slashes
    - Returns string suitable for Unix commands
    """
    require_unix()
    
    p = Path(path).expanduser()
    
    # Resolve to absolute path
    if not p.is_absolute():
        p = Path.cwd() / p
    
    try:
        p = p.resolve()
    except (OSError, RuntimeError):
        p = p.absolute()
    
    return str(p)


def get_wsl_windows_path() -> Optional[Path]:
    """
    Get Windows system path when running in WSL.
    Useful for finding Windows executables from WSL.
    
    Returns:
        Path to Windows system directory or None if not in WSL
    """
    if not is_wsl():
        return None
    
    # In WSL, Windows paths are mounted at /mnt/c/...
    windows_root = Path("/mnt/c")
    if not windows_root.exists():
        return None
    
    # Common Windows system paths
    system32 = windows_root / "Windows" / "System32"
    if system32.exists():
        return system32
    
    return windows_root


def find_windows_tool_in_wsl(tool_name: str) -> Optional[Path]:
    """
    Find Windows tool when running in WSL.
    
    Example: Find docker.exe from WSL
    
    Args:
        tool_name: Tool name (will add .exe if needed)
        
    Returns:
        Path to Windows tool or None if not found
    """
    if not is_wsl():
        return None
    
    # Add .exe if not present
    if not tool_name.endswith(".exe"):
        tool_name = f"{tool_name}.exe"
    
    # Check common Windows paths
    win_paths = [
        Path("/mnt/c/Windows/System32"),
        Path("/mnt/c/Program Files/Docker/Docker/resources/bin"),
        Path("/mnt/c/Program Files/"),
        Path(os.path.expanduser("~/.local/bin")),
    ]
    
    import shutil
    
    # First try which (might find it in WSL PATH)
    tool_path = shutil.which(tool_name)
    if tool_path:
        return Path(tool_path)
    
    # Search common Windows paths
    for base_path in win_paths:
        if not base_path.exists():
            continue
        
        # Search recursively (limited depth)
        for exe_path in base_path.rglob(tool_name):
            if exe_path.is_file():
                return exe_path
    
    return None


def get_shell() -> str:
    """
    Get current shell (bash, zsh, sh).
    
    Returns:
        Shell name
    """
    require_unix()
    
    shell = os.getenv("SHELL", "/bin/bash")
    return os.path.basename(shell)


def is_tool_installed(tool_name: str) -> bool:
    """
    Check if tool is installed (fast check).
    
    Args:
        tool_name: Tool name
        
    Returns:
        True if tool is in PATH
    """
    require_unix()
    
    import shutil
    return shutil.which(tool_name) is not None


def require_tools(*tool_names: str) -> None:
    """
    Fail fast if required tools are not installed.
    
    Args:
        *tool_names: Tool names to check
        
    Raises:
        FileNotFoundError: If any tool is missing
    """
    require_unix()
    
    missing = [tool for tool in tool_names if not is_tool_installed(tool)]
    
    if missing:
        pkg_mgr = detect_package_manager()
        install_hint = ""
        
        if pkg_mgr == PackageManager.HOMEBREW:
            install_hint = f"\n\nInstall with: brew install {' '.join(missing)}"
        elif pkg_mgr == PackageManager.APT:
            install_hint = f"\n\nInstall with: sudo apt-get install {' '.join(missing)}"
        elif pkg_mgr == PackageManager.DNF:
            install_hint = f"\n\nInstall with: sudo dnf install {' '.join(missing)}"
        elif pkg_mgr == PackageManager.YUM:
            install_hint = f"\n\nInstall with: sudo yum install {' '.join(missing)}"
        
        raise FileNotFoundError(
            f"Required tools not found: {', '.join(missing)}{install_hint}"
        )


def get_cpu_count() -> int:
    """
    Get number of CPU cores for parallel execution.
    
    Returns:
        Number of CPU cores
    """
    require_unix()
    
    import multiprocessing
    return multiprocessing.cpu_count()


def setup_unix_env() -> Dict[str, str]:
    """
    Setup environment variables for Unix execution.
    
    Returns:
        Environment dictionary with Unix-specific settings
    """
    require_unix()
    
    env = os.environ.copy()
    
    # Ensure UTF-8 locale
    env.setdefault("LANG", "en_US.UTF-8")
    env.setdefault("LC_ALL", "en_US.UTF-8")
    
    # Disable Python buffering for real-time output
    env["PYTHONUNBUFFERED"] = "1"
    
    return env
