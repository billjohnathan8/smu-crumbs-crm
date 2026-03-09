#!/usr/bin/env python3
"""
utils.py: Cross-platform utilities for Python scripts

This module provides utilities for:
- Finding executables across Windows, WSL, Linux, macOS
- Running commands with proper .exe handling
- Platform detection
- Path conversion (WSL <-> Windows)
- Logging with consistent format
- Repository root detection
"""

import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Union, Dict

# Import platform module from stdlib, avoiding local 'platform' package conflicts
# There's a scripts/platform/ package in this repo that shadows stdlib's platform module
# Strategy: Temporarily filter sys.path to exclude local directories during import
_saved_sys_path = sys.path.copy()
_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_filtered_path = [
    p for p in sys.path
    if not (p == '' or p == '.' or p.startswith(_repo_root) or p == 'scripts')
]
sys.path = _filtered_path
try:
    import platform as stdlib_platform
finally:
    sys.path = _saved_sys_path
del _saved_sys_path, _filtered_path, _repo_root


class PlatformInfo:
    """Platform detection and utilities."""

    def __init__(self):
        self._system = stdlib_platform.system()
        self._uname = stdlib_platform.uname()
        self._is_wsl = self._detect_wsl()
        self._is_git_bash = self._detect_git_bash()
        self._is_windows = self._system == "Windows"
        self._is_linux = self._system == "Linux" and not self._is_wsl
        self._is_macos = self._system == "Darwin"

    def _detect_wsl(self) -> bool:
        """Detect if running in Windows Subsystem for Linux."""
        try:
            with open("/proc/version", "r") as f:
                version = f.read().lower()
                return "microsoft" in version or "wsl" in version
        except (FileNotFoundError, PermissionError):
            return False

    def _detect_git_bash(self) -> bool:
        """Detect if running in Git Bash/MINGW."""
        return (
            "WINDIR" in os.environ or
            any(x in self._system.upper() for x in ["MINGW", "MSYS", "CYGWIN"])
        )

    @property
    def is_wsl(self) -> bool:
        return self._is_wsl

    @property
    def is_git_bash(self) -> bool:
        return self._is_git_bash

    @property
    def is_windows(self) -> bool:
        return self._is_windows

    @property
    def is_linux(self) -> bool:
        return self._is_linux

    @property
    def is_macos(self) -> bool:
        return self._is_macos

    def needs_exe_extension(self) -> bool:
        """Check if we need to look for .exe executables."""
        return self._is_wsl or self._is_git_bash or self._is_windows

    def to_native_path(self, path: Union[str, Path]) -> str:
        r"""
        Convert path to native format for the current platform.

        In WSL: Converts /mnt/c/... to C:\... for Windows executables
        In other environments: Returns path unchanged
        """
        path_str = str(path)

        # Only convert in WSL when calling Windows executables
        if self.is_wsl and path_str.startswith("/"):
            try:
                # Use wslpath to convert Linux path to Windows path
                result = subprocess.run(
                    ["wslpath", "-w", path_str],
                    capture_output=True,
                    text=True,
                    check=True
                )
                return result.stdout.strip()
            except (subprocess.CalledProcessError, FileNotFoundError):
                # wslpath not available or failed, return as-is
                return path_str

        return path_str


class Logger:
    """Cross-platform logger with timestamps and color support."""

    def __init__(self, prefix: str = ""):
        self.prefix = prefix
        self._supports_color = self._check_color_support()

    def _check_color_support(self) -> bool:
        """Check if the terminal supports ANSI color codes."""
        # For now, disable colors to avoid dependency on colorama
        # Can be enabled later if needed
        return False

    def _format_message(self, message: str, level: str = "INFO") -> str:
        """Format log message with timestamp and prefix."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix_str = f"[{self.prefix}] " if self.prefix else ""
        return f"[{timestamp}] [{level}] {prefix_str}{message}"

    def log(self, message: str, level: str = "INFO"):
        """Log a message with given level."""
        print(self._format_message(message, level), flush=True)

    def info(self, message: str):
        """Log an info message."""
        self.log(message, "INFO")

    def success(self, message: str):
        """Log a success message."""
        self.log(message, "SUCCESS")

    def warning(self, message: str):
        """Log a warning message."""
        self.log(message, "WARNING")

    def error(self, message: str):
        """Log an error message."""
        self.log(message, "ERROR")

    def debug(self, message: str):
        """Log a debug message."""
        self.log(message, "DEBUG")


class ExecutableFinder:
    """Find executables across platforms with .exe handling."""

    def __init__(self, platform_info: PlatformInfo, repo_root: Optional[Path] = None):
        self.platform_info = platform_info
        self.repo_root = repo_root or self._find_repo_root()
        self._setup_path()

    def _find_repo_root(self) -> Path:
        """Find the repository root by looking for .git directory."""
        current = Path.cwd().resolve()

        # Try current directory and parents
        for path in [current] + list(current.parents):
            if (path / ".git").exists():
                return path

        # Fallback to current directory
        return current

    def _setup_path(self):
        """Add common tool directories to PATH."""
        paths_to_add = []

        # Add .devtools/bin (portable tools installed by dev-setup)
        devtools_bin = self.repo_root / ".devtools" / "bin"
        if devtools_bin.exists():
            paths_to_add.append(str(devtools_bin))

        # Add platform-specific paths
        if self.platform_info.is_wsl:
            # WSL: Add Windows tool paths
            paths_to_add.extend([
                "/mnt/c/ProgramData/chocolatey/bin",
                "/mnt/c/Program Files/Docker/Docker/resources/bin"
            ])
        elif self.platform_info.is_git_bash:
            # Git Bash: Add Windows paths with /c/ style
            paths_to_add.extend([
                "/c/ProgramData/chocolatey/bin",
                "/c/Program Files/Docker/Docker/resources/bin"
            ])

        # Add to PATH
        current_path = os.environ.get("PATH", "")
        for path in paths_to_add:
            if os.path.exists(path) and path not in current_path:
                os.environ["PATH"] = f"{path}{os.pathsep}{current_path}"
                current_path = os.environ["PATH"]

    def find(self, name: str) -> Optional[str]:
        """
        Find an executable by name.

        Handles .exe extensions automatically on Windows/WSL/Git Bash.
        Returns absolute path if found, None otherwise.
        """
        # Try finding without .exe first
        exe = shutil.which(name)
        if exe:
            return exe

        # Try with .exe extension if on Windows-related platform
        if self.platform_info.needs_exe_extension():
            exe_with_ext = shutil.which(f"{name}.exe")
            if exe_with_ext:
                return exe_with_ext

        return None

    def require(self, name: str) -> str:
        """
        Find an executable or raise an error if not found.

        Args:
            name: Name of the executable to find

        Returns:
            Absolute path to the executable

        Raises:
            FileNotFoundError: If executable is not found
        """
        exe = self.find(name)
        if not exe:
            raise FileNotFoundError(
                f"Required executable '{name}' not found in PATH.\n"
                f"Please ensure it is installed and available."
            )
        return exe


class CommandRunner:
    """Run commands with proper cross-platform handling."""

    def __init__(
        self,
        platform_info: PlatformInfo,
        logger: Optional[Logger] = None
    ):
        self.platform_info = platform_info
        self.logger = logger or Logger()

    def run(
        self,
        cmd: List[str],
        check: bool = True,
        capture_output: bool = False,
        text: bool = True,
        cwd: Optional[Union[str, Path]] = None,
        env: Optional[Dict[str, str]] = None,
        stdin: Optional[int] = None,
        **kwargs
    ) -> subprocess.CompletedProcess:
        """
        Run a command with proper platform handling.

        Args:
            cmd: Command as list of strings
            check: Raise exception on non-zero exit code
            capture_output: Capture stdout and stderr
            text: Return output as text (not bytes)
            cwd: Working directory
            env: Environment variables
            stdin: Standard input file descriptor
            **kwargs: Additional arguments to subprocess.run

        Returns:
            CompletedProcess instance

        Raises:
            subprocess.CalledProcessError: If check=True and command fails
        """
        # Merge environment variables
        run_env = os.environ.copy()
        if env:
            run_env.update(env)

        # Run the command
        try:
            result = subprocess.run(
                cmd,
                check=check,
                capture_output=capture_output,
                text=text,
                cwd=cwd,
                env=run_env,
                stdin=stdin,
                **kwargs
            )
            return result
        except subprocess.CalledProcessError as e:
            # Re-raise with more context
            raise subprocess.CalledProcessError(
                e.returncode,
                e.cmd,
                e.output,
                e.stderr
            ) from e

    def run_silent(
        self,
        cmd: List[str],
        check: bool = False,
        **kwargs
    ) -> subprocess.CompletedProcess:
        """
        Run a command silently (suppress output).

        Useful for commands where we don't care about output or want to
        check if a command succeeds without showing errors.
        """
        return self.run(
            cmd,
            check=check,
            capture_output=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **kwargs
        )


def get_repo_root() -> Path:
    """
    Find the repository root directory.

    Returns:
        Path to repository root
    """
    current = Path.cwd().resolve()

    # Try current directory and parents
    for path in [current] + list(current.parents):
        if (path / ".git").exists():
            return path

    # Fallback to current directory
    return current


def validate_yaml(file_path: Union[str, Path]) -> bool:
    """
    Validate a YAML file using Python's YAML parser.

    Args:
        file_path: Path to YAML file

    Returns:
        True if valid, False otherwise
    """
    try:
        import yaml
        with open(file_path, "r") as f:
            yaml.safe_load(f)
        return True
    except ImportError:
        # PyYAML not installed, do basic read check
        try:
            with open(file_path, "r") as f:
                f.read()
            return True
        except Exception:
            return False
    except Exception:
        return False


# Convenience functions for quick access
def create_logger(prefix: str = "") -> Logger:
    """Create a logger instance."""
    return Logger(prefix)


def create_platform_info() -> PlatformInfo:
    """Create a platform info instance."""
    return PlatformInfo()


def create_executable_finder(repo_root: Optional[Path] = None) -> ExecutableFinder:
    """Create an executable finder instance."""
    platform_info = create_platform_info()
    return ExecutableFinder(platform_info, repo_root)


def create_command_runner(logger: Optional[Logger] = None) -> CommandRunner:
    """Create a command runner instance."""
    platform_info = create_platform_info()
    return CommandRunner(platform_info, logger)


if __name__ == "__main__":
    # Quick test of the utilities
    print("=== Platform Info ===")
    pinfo = create_platform_info()
    print(f"System: {stdlib_platform.system()}")
    print(f"Is WSL: {pinfo.is_wsl}")
    print(f"Is Git Bash: {pinfo.is_git_bash}")
    print(f"Is Windows: {pinfo.is_windows}")
    print(f"Is Linux: {pinfo.is_linux}")
    print(f"Is macOS: {pinfo.is_macos}")

    print("\n=== Repository Root ===")
    print(f"Repo root: {get_repo_root()}")

    print("\n=== Executable Finder ===")
    finder = create_executable_finder()
    for tool in ["docker", "git", "java", "node", "python3", "python"]:
        exe = finder.find(tool)
        if exe:
            print(f"Found {tool}: {exe}")
        else:
            print(f"Not found: {tool}")
