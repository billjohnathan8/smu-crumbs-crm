"""
Platform detection and abstraction layer.

Provides fast, cached platform detection and abstractions for:
- OS detection (Windows, macOS, Linux, WSL, GitHub Actions)
- Path normalization
- Command execution
- Environment variable handling

Design principles:
- Fail fast: Detect incompatibilities early
- Cache results: Platform detection happens once
- Type-safe: Use enums and dataclasses
- Zero external dependencies in core module
"""

import os
import platform as stdlib_platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class PlatformType(Enum):
    """Supported platform types."""
    WINDOWS = "windows"
    MACOS = "macos"
    LINUX = "linux"
    WSL = "wsl"
    UNKNOWN = "unknown"


class ExecutionContext(Enum):
    """Execution environment context."""
    LOCAL = "local"
    GITHUB_ACTIONS = "github_actions"
    DOCKER = "docker"


@dataclass(frozen=True)
class PlatformInfo:
    """Immutable platform information (cached)."""
    platform_type: PlatformType
    execution_context: ExecutionContext
    is_windows: bool
    is_unix: bool
    is_wsl: bool
    is_github_actions: bool
    is_docker: bool
    os_name: str
    os_version: str
    architecture: str
    python_version: str
    shell: str
    path_separator: str
    line_ending: str
    
    def require_unix(self) -> None:
        """Fail fast if not running on Unix-like system."""
        if not self.is_unix:
            raise EnvironmentError(
                f"This operation requires a Unix-like system (macOS/Linux), "
                f"but running on {self.platform_type.value}"
            )
    
    def require_windows(self) -> None:
        """Fail fast if not running on Windows."""
        if not self.is_windows:
            raise EnvironmentError(
                f"This operation requires Windows, "
                f"but running on {self.platform_type.value}"
            )
    
    def require_local(self) -> None:
        """Fail fast if not running in local environment."""
        if self.execution_context != ExecutionContext.LOCAL:
            raise EnvironmentError(
                f"This operation requires local execution, "
                f"but running in {self.execution_context.value}"
            )


class Platform:
    """
    Platform detection and abstraction singleton.
    
    Fast, cached detection with fail-fast semantics.
    """
    
    _instance: Optional['Platform'] = None
    _info: Optional[PlatformInfo] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @property
    def info(self) -> PlatformInfo:
        """Get cached platform information. Detection happens only once."""
        if self._info is None:
            self._info = self._detect_platform()
        return self._info
    
    def _detect_platform(self) -> PlatformInfo:
        """
        Detect platform once and cache result.
        Designed for speed - checks are ordered by likelihood.
        """
        # Detect platform type
        system = stdlib_platform.system().lower()
        is_wsl = self._detect_wsl()
        
        if system == "windows" or os.name == "nt":
            platform_type = PlatformType.WINDOWS
        elif system == "darwin":
            platform_type = PlatformType.MACOS
        elif system == "linux":
            platform_type = PlatformType.WSL if is_wsl else PlatformType.LINUX
        else:
            platform_type = PlatformType.UNKNOWN
        
        # Detect execution context
        is_github_actions = os.getenv("GITHUB_ACTIONS") == "true"
        is_docker = os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv")
        
        if is_github_actions:
            execution_context = ExecutionContext.GITHUB_ACTIONS
        elif is_docker:
            execution_context = ExecutionContext.DOCKER
        else:
            execution_context = ExecutionContext.LOCAL
        
        # Compute derived flags
        is_windows = platform_type == PlatformType.WINDOWS
        is_unix = platform_type in (PlatformType.MACOS, PlatformType.LINUX, PlatformType.WSL)
        
        # Detect shell
        shell = self._detect_shell()
        
        return PlatformInfo(
            platform_type=platform_type,
            execution_context=execution_context,
            is_windows=is_windows,
            is_unix=is_unix,
            is_wsl=is_wsl,
            is_github_actions=is_github_actions,
            is_docker=is_docker,
            os_name=stdlib_platform.system(),
            os_version=stdlib_platform.release(),
            architecture=stdlib_platform.machine(),
            python_version=sys.version.split()[0],
            shell=shell,
            path_separator=os.pathsep,
            line_ending="\r\n" if is_windows else "\n",
        )
    
    def _detect_wsl(self) -> bool:
        """Detect if running under WSL (Windows Subsystem for Linux)."""
        # Fast path: Check common WSL indicators
        if os.path.exists("/proc/version"):
            try:
                with open("/proc/version", "r") as f:
                    version_text = f.read().lower()
                    return "microsoft" in version_text or "wsl" in version_text
            except (IOError, OSError):
                pass
        
        # Alternative: Check uname
        if stdlib_platform.system().lower() == "linux":
            try:
                uname_r = stdlib_platform.uname().release.lower()
                return "microsoft" in uname_r or "wsl" in uname_r
            except Exception:
                pass
        
        return False
    
    def _detect_shell(self) -> str:
        """Detect current shell."""
        shell = os.getenv("SHELL", "")
        if shell:
            return os.path.basename(shell)
        
        # Windows default (use os.name to avoid circular dependency)
        if os.name == "nt":
            if os.getenv("PSModulePath"):
                return "powershell"
            return "cmd"
        
        return "unknown"
    
    def normalize_path(self, path: str | Path) -> Path:
        """
        Normalize path for current platform.
        Handles Windows/Unix path separators, resolves relative paths.
        """
        p = Path(path)
        
        # Convert to absolute if relative
        if not p.is_absolute():
            p = Path.cwd() / p
        
        # Resolve symlinks and .. references
        try:
            p = p.resolve()
        except (OSError, RuntimeError):
            # Fallback if resolve fails (e.g., path doesn't exist yet)
            p = p.absolute()
        
        return p
    
    def find_executable(self, name: str, required: bool = True) -> Optional[Path]:
        """
        Find executable in PATH. Fail fast if required and not found.
        
        Args:
            name: Executable name (without .exe/.cmd on Windows)
            required: If True, raise error if not found
            
        Returns:
            Path to executable or None if not found and not required
            
        Raises:
            FileNotFoundError: If required=True and executable not found
        """
        # Add extensions for Windows
        if self.info.is_windows and not any(name.endswith(ext) for ext in [".exe", ".cmd", ".bat"]):
            search_names = [name, f"{name}.exe", f"{name}.cmd", f"{name}.bat"]
        else:
            search_names = [name]
        
        for search_name in search_names:
            exe_path = shutil.which(search_name)
            if exe_path:
                return Path(exe_path)
        
        if required:
            raise FileNotFoundError(
                f"Required executable '{name}' not found in PATH. "
                f"Please install {name} or add it to your PATH."
            )
        
        return None
    
    def run_command(
        self,
        cmd: List[str],
        cwd: Optional[Path] = None,
        env: Optional[Dict[str, str]] = None,
        capture_output: bool = True,
        check: bool = True,
        timeout: Optional[int] = None,
    ) -> subprocess.CompletedProcess:
        """
        Run command with platform-appropriate settings.
        
        Args:
            cmd: Command and arguments
            cwd: Working directory
            env: Environment variables (merged with os.environ)
            capture_output: Capture stdout/stderr
            check: Raise CalledProcessError on non-zero exit
            timeout: Timeout in seconds
            
        Returns:
            CompletedProcess instance
            
        Raises:
            subprocess.CalledProcessError: If check=True and command fails
            subprocess.TimeoutExpired: If timeout exceeded
        """
        # Merge environment
        run_env = os.environ.copy()
        if env:
            run_env.update(env)
        
        # Windows-specific encoding setup
        if self.info.is_windows:
            # Ensure UTF-8 for subprocess on Windows
            run_env["PYTHONIOENCODING"] = "utf-8"
        
        # Windows: Use shell=True for .cmd and .bat files
        use_shell = False
        if self.info.is_windows and cmd:
            first_arg = str(cmd[0]).lower()
            if first_arg.endswith(('.cmd', '.bat')):
                use_shell = True
        
        try:
            result = subprocess.run(
                cmd,
                cwd=cwd,
                env=run_env,
                capture_output=capture_output,
                check=check,
                timeout=timeout,
                text=True,
                encoding="utf-8",
                errors="replace",  # Replace encoding errors instead of failing
                shell=use_shell,
            )
            return result
        except subprocess.CalledProcessError as e:
            # Enhance error message with command details
            cmd_str = " ".join(str(c) for c in cmd)
            raise subprocess.CalledProcessError(
                e.returncode,
                e.cmd,
                output=e.output,
                stderr=e.stderr,
            ) from e
    
    def get_repo_root(self) -> Path:
        """
        Get repository root directory.
        Fast: Uses cached detection based on script location.
        
        Returns:
            Absolute path to repository root
            
        Raises:
            RuntimeError: If repository root cannot be determined
        """
        # Strategy 1: Use git to find repo root (most reliable)
        try:
            result = self.run_command(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                check=True,
                timeout=5,
            )
            repo_root = Path(result.stdout.strip())
            if repo_root.exists():
                return repo_root
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass
        
        # Strategy 2: Walk up from current file looking for .git
        current = Path(__file__).resolve()
        for parent in [current] + list(current.parents):
            if (parent / ".git").exists():
                return parent
        
        # Strategy 3: Assume scripts/core structure
        # This file is in scripts/core, so repo root is 2 levels up
        assumed_root = Path(__file__).resolve().parent.parent.parent
        if assumed_root.exists():
            return assumed_root
        
        raise RuntimeError(
            "Could not determine repository root. "
            "Ensure you're running from within the git repository."
        )
    
    def create_env_dict(self, **kwargs) -> Dict[str, str]:
        """
        Create environment dictionary with platform-appropriate values.
        
        Args:
            **kwargs: Key-value pairs for environment variables
            
        Returns:
            Dictionary suitable for subprocess.run(env=...)
        """
        env = os.environ.copy()
        
        # Add platform-specific defaults
        if self.info.is_windows:
            env.setdefault("PYTHONIOENCODING", "utf-8")
        
        # Add user-provided values
        for key, value in kwargs.items():
            env[key] = str(value)
        
        return env


# Global singleton instance
_platform = Platform()


def get_platform() -> Platform:
    """Get the global Platform singleton instance."""
    return _platform


def get_platform_info() -> PlatformInfo:
    """Get cached platform information (shorthand)."""
    return _platform.info


# Convenience functions for common checks
def is_windows() -> bool:
    """Check if running on Windows."""
    return get_platform_info().is_windows


def is_unix() -> bool:
    """Check if running on Unix-like system (macOS/Linux/WSL)."""
    return get_platform_info().is_unix


def is_wsl() -> bool:
    """Check if running under WSL."""
    return get_platform_info().is_wsl


def is_github_actions() -> bool:
    """Check if running in GitHub Actions."""
    return get_platform_info().is_github_actions


def require_windows() -> None:
    """Fail fast if not on Windows."""
    get_platform_info().require_windows()


def require_unix() -> None:
    """Fail fast if not on Unix-like system."""
    get_platform_info().require_unix()


def require_local() -> None:
    """Fail fast if not in local execution context."""
    get_platform_info().require_local()
