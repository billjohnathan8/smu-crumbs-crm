#!/usr/bin/env python3
"""
Frontend test pipeline for React/TypeScript applications.

Replaces:
- scripts/build-and-test-frontend/build-and-test-frontend.ps1 (Windows)
- scripts/build-and-test-frontend/build-and-test-frontend.sh (Unix)

Pipeline steps:
1. Install dependencies (npm ci)
2. Type checking (tsc)
3. Linting (eslint)
4. Format checking (prettier)
5. Build (vite build)
6. Unit tests with coverage (vitest)
7. E2E tests (playwright)

Usage:
    python scripts/pipelines/test_frontend.py [--skip-e2e] [--fix]
"""

import argparse
import sys
import subprocess
import traceback
from pathlib import Path

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


def check_node_and_npm(platform, logger):
    """
    Verify Node.js and npm are installed.
    
    Fail fast if missing or version too old.
    """
    logger.info("Checking Node.js and npm...")
    
    # Check Node.js
    node = platform.find_executable("node", required=True)
    result = platform.run_command(
        [str(node), "--version"],
        capture_output=True,
        check=False
    )
    if result.returncode == 0:
        version = result.stdout.strip()
        logger.info(f"  Node.js: {version}")
    
    # Check npm
    npm = platform.find_executable("npm", required=True)
    result = platform.run_command(
        [str(npm), "--version"],
        capture_output=True,
        check=False
    )
    if result.returncode == 0:
        version = result.stdout.strip()
        logger.info(f"  npm: {version}")
    
    logger.success("Node.js and npm available")


def run_npm_command(command: list[str], cwd: Path, logger, platform, step_name: str):
    """
    Run npm command and fail fast on error.
    
    Args:
        command: npm command as list (e.g., ["npm", "run", "test"])
        cwd: Working directory
        logger: Logger instance
        platform: Platform instance
        step_name: Human-readable step name for logging
    """
    logger.info(f"[{step_name}] Running: {' '.join(command)}")
    
    # Get full path to npm executable (needed for Windows .cmd files)
    if command[0] == "npm":
        npm_path = platform.find_executable("npm", required=True)
        command = [str(npm_path)] + command[1:]
    
    result = platform.run_command(
        command,
        cwd=cwd,
        capture_output=False,  # Stream output to console
        check=False,
        timeout=1800  # 30 minutes max (e2e can be slow)
    )
    
    if result.returncode != 0:
        logger.fail_fast(
            f"[{step_name}] Failed with exit code {result.returncode}",
            exit_code=1
        )
    
    logger.success(f"[{step_name}] Completed")


def install_dependencies(service_path: Path, logger, platform):
    """Install npm dependencies using 'npm ci' (clean install)."""
    logger.info("Installing dependencies...")
    run_npm_command(
        ["npm", "ci"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="Dependencies"
    )


def run_typecheck(service_path: Path, logger, platform):
    """Run TypeScript type checking."""
    logger.info("Running type checking...")
    run_npm_command(
        ["npm", "run", "typecheck"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="Type Checking"
    )


def run_lint(service_path: Path, logger, platform):
    """Run ESLint."""
    logger.info("Running linter...")
    run_npm_command(
        ["npm", "run", "lint"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="Linting"
    )


def run_format_check(service_path: Path, logger, platform, auto_fix: bool = False):
    """
    Run Prettier format checking.
    
    Args:
        auto_fix: If True and check fails, run format fix
    """
    logger.info("Checking code formatting...")
    
    # Get full path to npm executable
    npm_path = platform.find_executable("npm", required=True)
    
    result = platform.run_command(
        [str(npm_path), "run", "format:check"],
        cwd=service_path,
        capture_output=False,
        check=False,
        timeout=60
    )
    
    if result.returncode != 0:
        if auto_fix:
            logger.warning("Format check failed, attempting auto-fix...")
            run_npm_command(
                ["npm", "run", "format"],
                cwd=service_path,
                logger=logger,
                platform=platform,
                step_name="Format Fix"
            )
        else:
            logger.fail_fast(
                "Format check failed. Run with --fix to auto-fix, or run: npm run format",
                exit_code=1
            )
    else:
        logger.success("[Format Check] Completed")


def run_build(service_path: Path, logger, platform):
    """Run Vite production build."""
    logger.info("Building application...")
    run_npm_command(
        ["npm", "run", "build"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="Build"
    )
    
    # Verify build output
    dist_dir = service_path / "dist"
    if not dist_dir.exists():
        logger.warning(f"Build output directory not found: {dist_dir}")
    else:
        logger.info(f"Build output: {dist_dir}")


def run_unit_tests(service_path: Path, logger, platform):
    """Run Vitest unit tests with coverage."""
    logger.info("Running unit tests with coverage...")
    run_npm_command(
        ["npm", "run", "test:coverage"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="Unit Tests"
    )
    
    # Verify coverage report
    coverage_report = service_path / "coverage" / "index.html"
    if not coverage_report.exists():
        logger.warning(f"Coverage report not found: {coverage_report}")
    else:
        logger.info(f"Coverage report: {coverage_report}")


def run_e2e_tests(service_path: Path, logger, platform):
    """Run Playwright end-to-end tests."""
    logger.info("Running end-to-end tests...")
    run_npm_command(
        ["npm", "run", "e2e"],
        cwd=service_path,
        logger=logger,
        platform=platform,
        step_name="E2E Tests"
    )


def generate_frontend_index(repo_root: Path, logger):
    """
    Generate frontend test summary HTML report.
    
    Calls: scripts/build-and-test-frontend/generate-frontend-index.py
    """
    index_script = repo_root / "scripts" / "build-and-test-frontend" / "generate-frontend-index.py"
    
    if not index_script.exists():
        logger.warning(f"Frontend index generator not found: {index_script}")
        return
    
    logger.info("Generating frontend summary index...")
    
    result = subprocess.run(
        [sys.executable, str(index_script)],
        capture_output=True,
        check=False,
        timeout=30
    )
    
    if result.returncode == 0:
        logger.success("Frontend summary index generated")
    else:
        logger.warning("Frontend index generation failed")


def main():
    """Main frontend test orchestration."""
    parser = argparse.ArgumentParser(
        description="Build and test frontend application"
    )
    parser.add_argument(
        "--skip-e2e",
        action="store_true",
        help="Skip end-to-end tests (faster for local development)"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Auto-fix formatting issues if format check fails"
    )
    args = parser.parse_args()
    
    # Setup platform
    platform = get_platform()
    repo_root = platform.get_repo_root()
    
    # Windows UTF-8 setup
    if is_windows():
        from scripts.platform.windows import setup_windows_encoding
        setup_windows_encoding()
    
    # Create logger
    logger = create_logger(
        name="Frontend Test Pipeline",
        log_dir=repo_root / "build-logs" / "build-and-test-frontend"
    )
    
    try:
        # Find frontend service
        service_path = repo_root / "services" / "frontend" / "crm-ui"
        
        if not service_path.exists():
            logger.fail_fast(f"Frontend service not found: {service_path}")
        
        # Check Node.js/npm
        with logger.group("Dependency Check"):
            check_node_and_npm(platform, logger)
        
        # Install dependencies
        with logger.timer("Install Dependencies"):
            install_dependencies(service_path, logger, platform)
        
        # Type checking
        with logger.timer("Type Checking"):
            run_typecheck(service_path, logger, platform)
        
        # Linting
        with logger.timer("Linting"):
            run_lint(service_path, logger, platform)
        
        # Format checking
        with logger.timer("Format Check"):
            run_format_check(service_path, logger, platform, auto_fix=args.fix)
        
        # Build
        with logger.timer("Build"):
            run_build(service_path, logger, platform)
        
        # Unit tests
        with logger.timer("Unit Tests"):
            run_unit_tests(service_path, logger, platform)
        
        # E2E tests (optional)
        if not args.skip_e2e:
            with logger.timer("E2E Tests"):
                run_e2e_tests(service_path, logger, platform)
        else:
            logger.info("Skipping E2E tests (--skip-e2e flag)")
        
        # Generate summary report
        with logger.timer("Report Generation"):
            generate_frontend_index(repo_root, logger)
        
        logger.success("Frontend pipeline completed successfully")
        return 0
    
    except Exception as e:
        logger.error(f"Frontend testing failed: {e}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
