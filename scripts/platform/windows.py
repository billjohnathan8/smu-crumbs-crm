"""
Windows-specific platform utilities.

Handles Windows-specific concerns:
- UTF-8 console encoding and codepage management
- PowerShell process execution
- Windows path handling
- Process creation with proper encoding

Fail-fast philosophy: Detect Windows encoding issues early.
"""

import ctypes
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Optional, Generator


def require_windows():
    """Fail fast if not running on Windows."""
    from scripts.core.detect import get_platform_info
    info = get_platform_info()
    if not info.is_windows:
        raise EnvironmentError(
            f"This operation requires Windows, but running on {info.platform_type.value}"
        )


class WindowsConsoleManager:
    """
    Manages Windows console codepage for UTF-8 support.
    
    Windows PowerShell 5.1 has complex encoding behavior:
    - Console input/output codepages affect external process output
    - .NET Console class has separate encodings
    - PowerShell $OutputEncoding affects pipeline serialization
    
    This manager consolidates the fix into a reusable context manager.
    """
    
    def __init__(self):
        require_windows()
        self._kernel32 = None
        self._original_input_cp = None
        self._original_output_cp = None
        self._setup_kernel32()
    
    def _setup_kernel32(self):
        """Load Windows kernel32.dll for codepage management."""
        try:
            self._kernel32 = ctypes.windll.kernel32
        except (AttributeError, OSError) as e:
            raise RuntimeError(f"Failed to load kernel32.dll: {e}")
    
    def get_console_input_cp(self) -> int:
        """Get current console input codepage."""
        return self._kernel32.GetConsoleCP()
    
    def get_console_output_cp(self) -> int:
        """Get current console output codepage."""
        return self._kernel32.GetConsoleOutputCP()
    
    def set_console_input_cp(self, codepage: int) -> bool:
        """Set console input codepage. Returns True on success."""
        return bool(self._kernel32.SetConsoleCP(codepage))
    
    def set_console_output_cp(self, codepage: int) -> bool:
        """Set console output codepage. Returns True on success."""
        return bool(self._kernel32.SetConsoleOutputCP(codepage))
    
    @contextmanager
    def utf8_console(self) -> Generator[None, None, None]:
        """
        Context manager to temporarily set console to UTF-8 (CP 65001).
        Restores original codepages on exit.
        
        Usage:
            with WindowsConsoleManager().utf8_console():
                # Run commands that need UTF-8
                pass
        """
        # Save original codepages
        self._original_input_cp = self.get_console_input_cp()
        self._original_output_cp = self.get_console_output_cp()
        
        try:
            # Set UTF-8 codepage
            self.set_console_input_cp(65001)
            self.set_console_output_cp(65001)
            
            # Set Python's stdio encodings
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
                sys.stderr.reconfigure(encoding='utf-8', errors='replace')
                if hasattr(sys.stdin, 'reconfigure'):
                    sys.stdin.reconfigure(encoding='utf-8', errors='replace')
            
            yield
        finally:
            # Restore original codepages
            if self._original_input_cp is not None:
                self.set_console_input_cp(self._original_input_cp)
            if self._original_output_cp is not None:
                self.set_console_output_cp(self._original_output_cp)


def setup_windows_encoding():
    """
    One-time setup of Windows encoding for the current process.
    Call this at the start of your script.
    
    Sets:
    - Console codepages to UTF-8
    - Python stdio to UTF-8
    - PYTHONIOENCODING environment variable
    """
    require_windows()
    
    manager = WindowsConsoleManager()
    manager.set_console_input_cp(65001)
    manager.set_console_output_cp(65001)
    
    # Set Python environment
    import os
    os.environ["PYTHONIOENCODING"] = "utf-8"
    
    # Reconfigure stdio
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stdin, 'reconfigure'):
            sys.stdin.reconfigure(encoding='utf-8', errors='replace')


def run_powershell(
    script: str,
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    capture_output: bool = True,
    check: bool = True,
    timeout: Optional[int] = None,
) -> subprocess.CompletedProcess:
    """
    Run PowerShell script with proper UTF-8 encoding.
    
    Args:
        script: PowerShell script content
        cwd: Working directory
        env: Environment variables
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        timeout: Timeout in seconds
        
    Returns:
        CompletedProcess instance
    """
    require_windows()
    
    # Prepare PowerShell command
    # -NoProfile: Don't load user profile (faster, more predictable)
    # -NonInteractive: Don't prompt for input
    # -ExecutionPolicy Bypass: Allow script execution
    # -Command: Execute the script
    cmd = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command", script
    ]
    
    # Merge environment with UTF-8 settings
    run_env = env.copy() if env else {}
    run_env["PYTHONIOENCODING"] = "utf-8"
    
    with WindowsConsoleManager().utf8_console():
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env={**subprocess.os.environ, **run_env},
            capture_output=capture_output,
            check=check,
            timeout=timeout,
            text=True,
            encoding='utf-8',
            errors='replace',
        )
    
    return result


def run_cmd(
    command: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    capture_output: bool = True,
    check: bool = True,
    timeout: Optional[int] = None,
) -> subprocess.CompletedProcess:
    """
    Run cmd.exe command with proper UTF-8 encoding.
    
    Args:
        command: Command and arguments (will be joined for cmd.exe)
        cwd: Working directory
        env: Environment variables
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        timeout: Timeout in seconds
        
    Returns:
        CompletedProcess instance
    """
    require_windows()
    
    # Build cmd.exe command: cmd /c "command"
    cmd_line = " ".join(f'"{arg}"' if " " in arg else arg for arg in command)
    cmd = ["cmd.exe", "/c", cmd_line]
    
    # Merge environment with UTF-8 settings
    run_env = env.copy() if env else {}
    run_env["PYTHONIOENCODING"] = "utf-8"
    
    with WindowsConsoleManager().utf8_console():
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env={**subprocess.os.environ, **run_env},
            capture_output=capture_output,
            check=check,
            timeout=timeout,
            text=True,
            encoding='utf-8',
            errors='replace',
        )
    
    return result


def normalize_windows_path(path: str | Path) -> str:
    """
    Normalize path for Windows.
    
    - Converts forward slashes to backslashes
    - Resolves relative paths
    - Handles UNC paths
    - Returns string suitable for Windows commands
    """
    require_windows()
    
    p = Path(path)
    
    # Resolve to absolute path
    if not p.is_absolute():
        p = Path.cwd() / p
    
    try:
        p = p.resolve()
    except (OSError, RuntimeError):
        p = p.absolute()
    
    # Convert to string with backslashes
    return str(p)


def find_wsl_exe() -> Optional[Path]:
    """
    Find wsl.exe on Windows.
    Useful for running Linux commands from Windows.
    
    Returns:
        Path to wsl.exe or None if not found
    """
    require_windows()
    
    import shutil
    wsl_path = shutil.which("wsl.exe")
    return Path(wsl_path) if wsl_path else None


def run_in_wsl(
    command: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    capture_output: bool = True,
    check: bool = True,
    timeout: Optional[int] = None,
) -> subprocess.CompletedProcess:
    """
    Run command in WSL from Windows.
    
    Requires WSL to be installed on Windows.
    Useful for running bash scripts from Windows.
    
    Args:
        command: Command and arguments (will run in WSL bash)
        cwd: Working directory (Windows path, converted to WSL path)
        env: Environment variables
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        timeout: Timeout in seconds
        
    Returns:
        CompletedProcess instance
        
    Raises:
        FileNotFoundError: If WSL is not installed
    """
    require_windows()
    
    wsl = find_wsl_exe()
    if not wsl:
        raise FileNotFoundError(
            "WSL (wsl.exe) not found. "
            "Please install Windows Subsystem for Linux to use this feature."
        )
    
    # Build WSL command
    wsl_cmd = [str(wsl), "--"] + command
    
    # Convert Windows path to WSL path if needed
    wsl_cwd = None
    if cwd:
        # WSL uses /mnt/c/... for Windows paths
        win_path = Path(cwd).resolve()
        drive = win_path.drive.replace(":", "").lower()
        path_parts = win_path.parts[1:]  # Skip drive
        wsl_cwd = f"/mnt/{drive}/{'/'.join(path_parts)}"
    
    # Merge environment
    run_env = env.copy() if env else {}
    run_env["PYTHONIOENCODING"] = "utf-8"
    
    with WindowsConsoleManager().utf8_console():
        if wsl_cwd:
            # WSL doesn't support cwd directly, use cd in command
            bash_cmd = f"cd {wsl_cwd} && {' '.join(command)}"
            wsl_cmd = [str(wsl), "bash", "-c", bash_cmd]
        
        result = subprocess.run(
            wsl_cmd,
            env={**subprocess.os.environ, **run_env},
            capture_output=capture_output,
            check=check,
            timeout=timeout,
            text=True,
            encoding='utf-8',
            errors='replace',
        )
    
    return result


def is_elevated() -> bool:
    """
    Check if running with administrator privileges on Windows.
    
    Returns:
        True if running as administrator, False otherwise
    """
    require_windows()
    
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def require_elevated():
    """
    Fail fast if not running with administrator privileges.
    
    Raises:
        PermissionError: If not running as administrator
    """
    if not is_elevated():
        raise PermissionError(
            "This operation requires administrator privileges. "
            "Please run PowerShell as Administrator."
        )
