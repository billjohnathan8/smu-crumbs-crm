#!/usr/bin/env python3
"""
Developer environment setup - one-command onboarding.

Replaces:
- scripts/dev-setup/setup.ps1 (Windows)
- scripts/dev-setup/setup.sh (Unix)

Principles:
- Portable by default (downloads to .devtools/bin)
- Idempotent (safe to re-run)
- Self-diagnosing (--doctor mode)
- Cross-platform

Usage:
    python scripts/pipelines/setup_dev_env.py [OPTIONS]
"""

import argparse
import os
import platform as stdlib_platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Add repo root to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger
from scripts.pipelines.generate_inframap import install_portable_inframap


@dataclass
class DependencyStatus:
    """Status of a single dependency."""
    name: str
    required: bool
    found: bool
    version: Optional[str] = None
    path: Optional[Path] = None
    message: Optional[str] = None
    install_cmd: Optional[str] = None


class EnvironmentChecker:
    """Check and report on development environment."""
    
    def __init__(self, platform, logger):
        self.platform = platform
        self.logger = logger
        self.results = []
    
    def check_tool(
        self,
        name: str,
        executable: str,
        required: bool = True,
        version_flag: str = "--version",
        min_version: Optional[str] = None
    ) -> DependencyStatus:
        """
        Check if a tool is installed and get version.
        
        Args:
            name: Display name of tool
            executable: Executable name
            required: Whether tool is required
            version_flag: Flag to get version
            min_version: Minimum version requirement
            
        Returns:
            DependencyStatus object
        """
        exe_path = self.platform.find_executable(executable, required=False)
        
        if not exe_path:
            # Generate install command hint
            install_cmd = self._get_install_command(executable)
            
            status = DependencyStatus(
                name=name,
                required=required,
                found=False,
                message=f"{name} not found",
                install_cmd=install_cmd
            )
            self.results.append(status)
            return status
        
        # Get version
        version = None
        try:
            result = self.platform.run_command(
                [str(exe_path), version_flag],
                capture_output=True,
                check=False,
                timeout=5
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0]
        except Exception:
            pass
        
        status = DependencyStatus(
            name=name,
            required=required,
            found=True,
            version=version,
            path=exe_path
        )
        self.results.append(status)
        return status
    
    def _get_install_command(self, tool: str) -> str:
        """Get platform-specific installation command hint."""
        if is_windows():
            install_cmds = {
                "docker": "winget install Docker.DockerDesktop",
                "git": "winget install Git.Git",
                "java": "winget install EclipseAdoptium.Temurin.21.JDK",
                "node": "winget install OpenJS.NodeJS.LTS",
                "python": "winget install Python.Python.3.12",
                "make": "winget install GnuWin32.Make",
                "dot": "winget install Graphviz.Graphviz",
                "inframap": "Use setup script portable install or download from GitHub releases",
            }
        elif stdlib_platform.system() == "Darwin":
            install_cmds = {
                "docker": "brew install --cask docker",
                "git": "brew install git",
                "java": "brew install openjdk@21",
                "node": "brew install node",
                "python": "brew install python@3.12",
                "make": "brew install make",
                "dot": "brew install graphviz",
                "inframap": "Use setup script portable install or download from GitHub releases",
            }
        else:  # Linux
            install_cmds = {
                "docker": "sudo apt-get install docker.io",
                "git": "sudo apt-get install git",
                "java": "sudo apt-get install openjdk-21-jdk",
                "node": "sudo apt-get install nodejs npm",
                "python": "sudo apt-get install python3.12 python3.12-venv",
                "make": "sudo apt-get install make",
                "dot": "sudo apt-get install graphviz",
                "inframap": "Use setup script portable install or download from GitHub releases",
            }
        
        return install_cmds.get(tool, f"Install {tool} from official website")
    
    def check_docker_daemon(self) -> bool:
        """Check if Docker daemon is running."""
        try:
            result = self.platform.run_command(
                ["docker", "info"],
                capture_output=True,
                check=False,
                timeout=10
            )
            return result.returncode == 0
        except Exception:
            return False
    
    def check_java_version(self, status: DependencyStatus) -> bool:
        """Check if Java version meets minimum requirement (21+)."""
        if not status.found or not status.version:
            return False
        
        # Extract version number from output
        version_match = re.search(r'(\d+)\.(\d+)\.(\d+)', status.version)
        if version_match:
            major = int(version_match.group(1))
            return major >= 21
        
        # Try alternative format (openjdk version "21.0.1")
        version_match = re.search(r'"(\d+)\.\d+\.\d+', status.version)
        if version_match:
            major = int(version_match.group(1))
            return major >= 21
        
        return False
    
    def check_node_version(self, status: DependencyStatus) -> bool:
        """Check if Node.js version meets minimum requirement (22+)."""
        if not status.found or not status.version:
            return False
        
        # Extract version number (e.g., "v18.17.0" or "18.17.0")
        version_match = re.search(r'v?(\d+)\.(\d+)\.(\d+)', status.version)
        if version_match:
            major = int(version_match.group(1))
            return major >= 22
        
        return False

    def check_python_version(self, status: DependencyStatus) -> bool:
        """Check if Python version meets minimum requirement (3.12+)."""
        if not status.found or not status.version:
            return False

        version_match = re.search(r'Python\s+(\d+)\.(\d+)\.(\d+)', status.version)
        if version_match:
            major = int(version_match.group(1))
            minor = int(version_match.group(2))
            return (major, minor) >= (3, 12)

        version_match = re.search(r'(\d+)\.(\d+)\.(\d+)', status.version)
        if version_match:
            major = int(version_match.group(1))
            minor = int(version_match.group(2))
            return (major, minor) >= (3, 12)

        return False
    
    def report(self):
        """Print environment check report."""
        self.logger.section("ENVIRONMENT STATUS")

        for dep in self.results:
            if dep.found:
                symbol = "[OK]"
                msg = f"{dep.name}: {dep.version or 'installed'}"
                if dep.path:
                    msg += f" ({dep.path})"
                self.logger.success(f"{symbol} {msg}")
            else:
                symbol = "[ERROR]" if dep.required else "[WARN]"
                msg = f"{dep.name}: NOT FOUND"
                if dep.install_cmd:
                    msg += f"\n    Install: {dep.install_cmd}"
                if dep.required:
                    self.logger.error(f"{symbol} {msg}")
                else:
                    self.logger.warning(f"{symbol} {msg}")


class ToolInstaller:
    """Install missing development tools."""
    
    TOOL_VERSIONS = {
        "actionlint": "v1.7.5",
        "inframap": "latest",
    }
    
    def __init__(self, platform, logger, portable: bool = True):
        self.platform = platform
        self.logger = logger
        self.portable = portable
        self.devtools_bin = repo_root / ".devtools" / "bin"
        self.installed_count = 0
    
    def ensure_devtools_dir(self):
        """Create .devtools/bin if it doesn't exist."""
        self.devtools_bin.mkdir(parents=True, exist_ok=True)
        self.logger.info(f"Using portable tools directory: {self.devtools_bin}")
    
    def _get_platform_arch(self) -> tuple[str, str]:
        """Get platform OS and architecture for downloads."""
        # OS mapping
        os_name = stdlib_platform.system().lower()
        if os_name == "darwin":
            os_name = "darwin"
        elif os_name == "linux":
            os_name = "linux"
        elif os_name == "windows":
            os_name = "windows"
        
        # Architecture mapping
        machine = stdlib_platform.machine().lower()
        if machine in ("x86_64", "amd64"):
            arch = "amd64"
        elif machine in ("arm64", "aarch64"):
            arch = "arm64"
        else:
            arch = "amd64"  # Default fallback
        
        return os_name, arch
    
    def download_actionlint(self, version: Optional[str] = None):
        """Download actionlint to .devtools/bin."""
        version = version or self.TOOL_VERSIONS["actionlint"]
        os_name, arch = self._get_platform_arch()
        
        # Remove 'v' prefix for version number in filename
        version_number = version.lstrip('v')
        
        # actionlint uses different OS naming
        if os_name == "darwin":
            os_suffix = "darwin"
        elif os_name == "linux":
            os_suffix = "linux"
        else:  # windows
            os_suffix = "windows"
        
        filename = f"actionlint_{version_number}_{os_suffix}_{arch}"
        if os_name == "windows":
            archive_url = f"https://github.com/rhysd/actionlint/releases/download/{version}/{filename}.zip"
            archive_file = self.devtools_bin / f"{filename}.zip"
        else:
            archive_url = f"https://github.com/rhysd/actionlint/releases/download/{version}/{filename}.tar.gz"
            archive_file = self.devtools_bin / f"{filename}.tar.gz"
        
        self.logger.info(f"Downloading actionlint {version}...")
        self._download_file(archive_url, archive_file)
        
        # Extract
        self.logger.info("Extracting actionlint...")
        dest = self.devtools_bin / ("actionlint.exe" if os_name == "windows" else "actionlint")
        
        if os_name == "windows":
            with zipfile.ZipFile(archive_file, 'r') as zip_ref:
                # Extract actionlint.exe
                for member in zip_ref.namelist():
                    if member.endswith("actionlint.exe"):
                        source = zip_ref.open(member)
                        with open(dest, 'wb') as f:
                            f.write(source.read())
        else:
            with tarfile.open(archive_file, 'r:gz') as tar_ref:
                # Extract actionlint binary
                for member in tar_ref.getmembers():
                    if member.name.endswith("/actionlint") or member.name == "actionlint":
                        member.name = "actionlint"
                        tar_ref.extract(member, self.devtools_bin)
            
            dest.chmod(dest.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        
        # Cleanup archive
        archive_file.unlink()
        
        self.logger.success(f"actionlint installed to {dest}")
        self.installed_count += 1

    def download_inframap(self):
        """Download inframap to .devtools/bin via the shared installer."""
        self.logger.info("Downloading inframap latest release...")
        binary_path = install_portable_inframap()
        self.logger.success(f"inframap installed to {binary_path}")
        self.installed_count += 1
    
    def _download_file(self, url: str, dest: Path):
        """Download file with progress indication."""
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                total_size = int(response.headers.get('content-length', 0))
                
                with open(dest, 'wb') as f:
                    downloaded = 0
                    block_size = 8192
                    
                    while True:
                        buffer = response.read(block_size)
                        if not buffer:
                            break
                        
                        downloaded += len(buffer)
                        f.write(buffer)
                        
                        # Show progress
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            print(f"\r  Progress: {progress:.1f}%", end='', flush=True)
                
                print()  # New line after progress
        except Exception as e:
            self.logger.error(f"Failed to download {url}: {e}")
            raise
    
    def install_missing_tools(self, checker: EnvironmentChecker):
        """Install tools that were not found by the environment checker."""
        missing_portable = []
        
        for dep in checker.results:
            if not dep.found and not dep.required:
                # This is a portable tool
                tool_name = dep.name.lower()
                if tool_name in self.TOOL_VERSIONS:
                    missing_portable.append(tool_name)
        
        if not missing_portable:
            self.logger.info("All portable tools are already installed")
            return
        
        self.logger.info(f"Installing {len(missing_portable)} portable tool(s)...")
        
        for tool in missing_portable:
            try:
                if tool == "actionlint":
                    self.download_actionlint()
                elif tool == "inframap":
                    self.download_inframap()
            except Exception as e:
                self.logger.warning(f"Failed to install {tool}: {e}")
    
    def update_path(self, persist: bool = False):
        """
        Add .devtools/bin to PATH.
        
        Args:
            persist: If True, add to user PATH permanently
        """
        # Current session
        devtools_bin_str = str(self.devtools_bin)
        current_path = os.environ.get("PATH", "")
        
        if devtools_bin_str not in current_path:
            os.environ["PATH"] = f"{devtools_bin_str}{os.pathsep}{current_path}"
            self.logger.info(f"Added {devtools_bin_str} to PATH for current session")
        
        if persist:
            self.logger.warning("Persistent PATH update not implemented yet")
            self.logger.warning("Add to your shell profile manually:")
            if is_windows():
                self.logger.warning(f"  setx PATH \"%PATH%;{devtools_bin_str}\"")
            else:
                self.logger.warning(f"  export PATH=\"{devtools_bin_str}:$PATH\"")

    def install_graphviz_system(self):
        """
        Install Graphviz (dot) using the platform package manager.
        This is intentionally opt-in because it modifies system packages.
        """
        if is_windows():
            command = [
                "winget",
                "install",
                "--id",
                "Graphviz.Graphviz",
                "-e",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ]
        elif stdlib_platform.system() == "Darwin":
            command = ["brew", "install", "graphviz"]
        else:
            command = ["sudo", "apt-get", "install", "-y", "graphviz"]

        self.logger.info(f"Installing Graphviz using: {' '.join(command)}")
        result = self.platform.run_command(
            command,
            capture_output=False,
            check=False,
            timeout=600
        )
        if result.returncode == 0:
            self.logger.success("Graphviz installation completed")
        else:
            self.logger.warning("Graphviz installation failed; install manually and re-run setup")


def configure_backend_dependencies(logger, platform):
    """Configure Gradle and Python backend dependencies."""
    backend_dir = repo_root / "services" / "backend"
    
    if not backend_dir.exists():
        logger.warning("Backend directory not found, skipping")
        return
    
    # Gradle services
    gradle_services = ["agent", "client", "transaction"]
    configured_count = 0
    
    for service_name in gradle_services:
        service_path = backend_dir / service_name
        if not service_path.exists():
            continue
        
        logger.info(f"[{service_name}] Prefetching Gradle dependencies...")
        
        gradlew = "gradlew.bat" if is_windows() else "gradlew"
        gradlew_path = service_path / gradlew
        
        if not gradlew_path.exists():
            logger.warning(f"[{service_name}] {gradlew} not found, skipping")
            continue
        
        try:
            result = platform.run_command(
                [str(gradlew_path), "dependencies"],
                cwd=service_path,
                capture_output=True,
                check=False,
                timeout=300
            )
            
            if result.returncode == 0:
                logger.success(f"[{service_name}] Gradle dependencies ready")
                configured_count += 1
            else:
                logger.warning(f"[{service_name}] Gradle dependencies fetch failed: {result.stderr}")
        except Exception as e:
            logger.warning(f"[{service_name}] Error fetching dependencies: {e}")
    
    # Python service
    log_service = backend_dir / "log"
    if log_service.exists():
        logger.info("[log] Setting up Python virtual environment...")
        
        venv_dir = log_service / "venv"
        requirements_file = log_service / "requirements.txt"
        
        if not requirements_file.exists():
            logger.warning("[log] requirements.txt not found, skipping")
        else:
            try:
                # Create venv if it doesn't exist
                if not venv_dir.exists():
                    logger.info("[log] Creating virtual environment...")
                    result = platform.run_command(
                        [sys.executable, "-m", "venv", str(venv_dir)],
                        cwd=log_service,
                        capture_output=True,
                        check=False,
                        timeout=60
                    )
                    
                    if result.returncode != 0:
                        logger.warning(f"[log] Failed to create venv: {result.stderr}")
                        return
                
                # Get pip path
                if is_windows():
                    pip_path = venv_dir / "Scripts" / "pip.exe"
                else:
                    pip_path = venv_dir / "bin" / "pip"
                
                if pip_path.exists():
                    logger.info("[log] Installing Python dependencies...")
                    result = platform.run_command(
                        [str(pip_path), "install", "-r", str(requirements_file)],
                        cwd=log_service,
                        capture_output=True,
                        check=False,
                        timeout=300
                    )
                    
                    if result.returncode == 0:
                        logger.success("[log] Python dependencies installed")
                        configured_count += 1
                    else:
                        logger.warning(f"[log] Failed to install dependencies: {result.stderr}")
            except Exception as e:
                logger.warning(f"[log] Error setting up Python environment: {e}")
    
    logger.info(f"Configured {configured_count} backend service(s)")


def configure_frontend_dependencies(logger, platform):
    """Install npm dependencies for frontend."""
    frontend_path = repo_root / "services" / "frontend" / "crm-ui"
    
    if not frontend_path.exists():
        logger.warning("Frontend service not found, skipping")
        return
    
    package_json = frontend_path / "package.json"
    if not package_json.exists():
        logger.warning("Frontend package.json not found, skipping")
        return
    
    logger.info("[crm-ui] Installing npm dependencies...")
    
    try:
        result = platform.run_command(
            ["npm", "ci"],
            cwd=frontend_path,
            capture_output=False,
            check=False,
            timeout=600
        )
        
        if result.returncode == 0:
            logger.success("[crm-ui] npm dependencies installed")
        else:
            logger.error("[crm-ui] npm install failed")
            logger.warning("Try running manually: cd services/frontend/crm-ui && npm ci")
    except Exception as e:
        logger.error(f"[crm-ui] Error installing npm dependencies: {e}")


def run_verification(mode: str, logger) -> bool:
    """
    Run verification pipelines.
    
    Args:
        mode: "tests"
        
    Returns:
        True if verification succeeded
    """
    if mode == "tests":
        test_all = repo_root / "scripts" / "pipelines" / "test_all.py"
        
        if not test_all.exists():
            logger.warning("test_all.py not found, skipping verification")
            return True
        
        logger.info("Running test_all.py verification...")
        result = subprocess.run(
            [sys.executable, str(test_all)],
            check=False
        )
        return result.returncode == 0
    
    return True


def main():
    """Main developer setup orchestration."""
    parser = argparse.ArgumentParser(
        description="Developer environment setup - one-command onboarding",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/pipelines/setup_dev_env.py --doctor
  python scripts/pipelines/setup_dev_env.py
  python scripts/pipelines/setup_dev_env.py --verify-only
        """
    )
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="Check environment without making changes"
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Skip verification after setup"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only run verification (skip setup)"
    )
    parser.add_argument(
        "--system",
        action="store_true",
        help="Install tools globally (vs portable to .devtools/bin)"
    )
    parser.add_argument(
        "--persist-path",
        action="store_true",
        help="Add .devtools/bin to PATH permanently"
    )
    parser.add_argument(
        "--install-graphviz",
        action="store_true",
        help="Install Graphviz (dot) via the system package manager"
    )
    args = parser.parse_args()
    
    # Setup platform
    platform = get_platform()
    
    # Windows UTF-8 setup
    if is_windows():
        from scripts.platform.windows import setup_windows_encoding
        setup_windows_encoding()
    
    # Create logger
    logger = create_logger(
        name="Developer Setup",
        log_dir=repo_root / "build-logs" / "dev-setup"
    )
    
    start_time = time.time()
    
    try:
        # Environment check
        with logger.group("Environment Check"):
            checker = EnvironmentChecker(platform, logger)
            
            # Check global dependencies
            docker_status = checker.check_tool("Docker", "docker", required=True)
            docker_running = False
            if docker_status.found:
                docker_running = checker.check_docker_daemon()
                if not docker_running:
                    logger.warning("[WARN] Docker daemon is not running")
                else:
                    logger.success("[OK] Docker daemon is running")
            
            git_status = checker.check_tool("Git", "git", required=True)
            
            java_status = checker.check_tool("Java", "java", required=True)
            if java_status.found:
                if checker.check_java_version(java_status):
                    logger.success("[OK] Java version >=21")
                else:
                    logger.warning("[WARN] Java version <21 (requires Java 21+)")
            
            node_status = checker.check_tool("Node.js", "node", required=True)
            if node_status.found:
                if checker.check_node_version(node_status):
                    logger.success("[OK] Node.js version >=22")
                else:
                    logger.warning("[WARN] Node.js version <22 (requires Node.js 22+)")

            python_executable = "python" if is_windows() else "python3"
            python_status = checker.check_tool("Python", python_executable, required=True)
            if python_status.found:
                if checker.check_python_version(python_status):
                    logger.success("[OK] Python version >=3.12")
                else:
                    logger.warning("[WARN] Python version <3.12 (requires Python 3.12+)")
            
            checker.check_tool("npm", "npm", required=True)
            checker.check_tool("Make", "make", required=True)
            
            # Check portable tools
            checker.check_tool("actionlint", "actionlint", required=False)
            checker.check_tool("inframap", "inframap", required=False)
            checker.check_tool("graphviz-dot", "dot", required=False)
            
            checker.report()
            
            # Check for missing required tools
            missing_required = [dep for dep in checker.results if dep.required and not dep.found]
            if missing_required:
                logger.error(f"Missing {len(missing_required)} required tool(s)")
                if not args.doctor:
                    logger.fail_fast("Please install required tools and re-run setup")
        
        if args.doctor:
            logger.info("Doctor mode: environment check complete (no changes made)")
            logger.info("Re-run without --doctor to install missing tools and configure dependencies")
            return 0
        
        # Install missing tools
        if not args.verify_only:
            with logger.group("Tool Installation"):
                installer = ToolInstaller(platform, logger, portable=not args.system)
                installer.ensure_devtools_dir()
                installer.install_missing_tools(checker)

                graphviz_status = next((dep for dep in checker.results if dep.name == "graphviz-dot"), None)
                if args.install_graphviz:
                    if graphviz_status and graphviz_status.found:
                        logger.info("Graphviz (dot) already installed")
                    else:
                        installer.install_graphviz_system()
                
                if installer.installed_count > 0:
                    installer.update_path(persist=args.persist_path)
                    logger.success(f"Installed {installer.installed_count} portable tool(s)")
                else:
                    logger.info("No tools needed installation")
            
            # Configure dependencies
            with logger.group("Backend Dependencies"):
                configure_backend_dependencies(logger, platform)
            
            with logger.group("Frontend Dependencies"):
                configure_frontend_dependencies(logger, platform)
        
        # Verification
        if not args.skip_verify:
            with logger.group("Verification"):
                success = run_verification("tests", logger)
                
                if not success:
                    logger.error("Verification failed")
                    return 1
        
        # Summary
        elapsed = time.time() - start_time
        logger.section("SETUP COMPLETE")
        logger.success(f"Developer environment setup complete in {elapsed:.1f}s")
        
        logger.info("")
        logger.info("Next steps:")
        logger.info("  - Run full local CI-equivalent checks: python scripts/pipelines/test_all.py")
        logger.info("  - Run backend tests:  python scripts/pipelines/test_backend.py")
        logger.info("  - Run frontend tests: python scripts/pipelines/test_frontend.py")
        logger.info("  - VS Code: Open workspace and install recommended extensions")
        
        return 0
    
    except KeyboardInterrupt:
        logger.warning("Setup interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Setup failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
