#!/usr/bin/env python3
"""
Backend test pipeline for polyglot services.

Replaces:
- scripts/build-and-test-backend/build-and-test-backend.ps1 (Windows)
- scripts/build-and-test-backend/build-and-test-backend.sh (Unix)

Auto-discovers and tests:
- Gradle-based Java services (Spring Boot microservices)
- Python-based services

Usage:
    python scripts/pipelines/test_backend.py [--service NAME] [--skip-coverage-report]
"""

import argparse
import sys
import subprocess
from pathlib import Path
from typing import Optional, Literal

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


ServiceType = Literal["gradle", "python"]


def detect_service_type(service_path: Path) -> Optional[ServiceType]:
    """
    Detect service type based on presence of build files.
    
    Returns:
        "gradle" if gradlew/gradlew.bat found
        "python" if run-local-test-pipeline.py found
        None if type cannot be determined
    """
    if (service_path / "gradlew").exists() or (service_path / "gradlew.bat").exists():
        return "gradle"
    
    if (service_path / "run-local-test-pipeline.py").exists():
        return "python"
    
    return None


def discover_backend_services(backend_dir: Path, logger) -> dict[str, ServiceType]:
    """
    Scan services/backend/ and detect service types.
    
    Returns:
        Dict mapping service name to service type
    """
    logger.info(f"Discovering backend services in: {backend_dir}")
    
    services = {}
    
    for path in sorted(backend_dir.iterdir()):
        if not path.is_dir() or path.name.startswith('.'):
            continue
        
        service_type = detect_service_type(path)
        if service_type:
            services[path.name] = service_type
            logger.info(f"  ✓ {path.name} ({service_type})")
        else:
            logger.warning(f"  ? {path.name} (unknown type, skipping)")
    
    if not services:
        logger.fail_fast(f"No backend services found in {backend_dir}")
    
    logger.success(f"Discovered {len(services)} backend service(s)")
    return services


def run_gradle_tests(service_name: str, service_path: Path, logger, platform):
    """
    Run tests for Gradle-based Java service.
    
    Steps:
    1. Find gradlew wrapper
    2. Make executable (Unix)
    3. Run: ./gradlew clean test jacocoTestReport
    4. Verify coverage report generated
    """
    logger.info(f"[{service_name}] Running Gradle tests...")
    
    # Find gradle wrapper
    if is_windows():
        gradlew = service_path / "gradlew.bat"
        if not gradlew.exists():
            logger.fail_fast(f"[{service_name}] gradlew.bat not found")
    else:
        gradlew = service_path / "gradlew"
        if not gradlew.exists():
            logger.fail_fast(f"[{service_name}] gradlew not found")
        
        # Make executable
        import stat
        gradlew.chmod(gradlew.stat().st_mode | stat.S_IEXEC)
    
    # Run tests with coverage
    cmd = [str(gradlew), "clean", "test", "jacocoTestReport", "--no-daemon", "--console=plain"]
    
    result = platform.run_command(
        cmd,
        cwd=service_path,
        capture_output=False,  # Stream output
        check=False,
        timeout=600  # 10 minutes max
    )
    
    if result.returncode != 0:
        logger.fail_fast(
            f"[{service_name}] Gradle tests failed with exit code {result.returncode}",
            exit_code=1
        )
    
    # Verify coverage report
    coverage_report = service_path / "build" / "reports" / "jacoco" / "test" / "html" / "index.html"
    if not coverage_report.exists():
        logger.warning(f"[{service_name}] Coverage report not found: {coverage_report}")
    else:
        logger.info(f"[{service_name}] Coverage report: {coverage_report}")
    
    logger.success(f"[{service_name}] Gradle tests passed")


def run_python_tests(service_name: str, service_path: Path, logger, platform):
    """
    Run tests for Python-based service.
    
    Steps:
    1. Find run-local-test-pipeline.py
    2. Run: python run-local-test-pipeline.py
    3. Verify coverage report generated
    """
    logger.info(f"[{service_name}] Running Python tests...")
    
    # Find test script
    test_script = service_path / "run-local-test-pipeline.py"
    if not test_script.exists():
        logger.fail_fast(f"[{service_name}] run-local-test-pipeline.py not found")
    
    # Run tests
    result = platform.run_command(
        [sys.executable, str(test_script)],
        cwd=service_path,
        capture_output=False,  # Stream output
        check=False,
        timeout=600  # 10 minutes max
    )
    
    if result.returncode != 0:
        logger.fail_fast(
            f"[{service_name}] Python tests failed with exit code {result.returncode}",
            exit_code=1
        )
    
    # Verify coverage report
    coverage_report = service_path / "build" / "reports" / "coverage" / "html" / "index.html"
    if not coverage_report.exists():
        logger.warning(f"[{service_name}] Coverage report not found: {coverage_report}")
    else:
        logger.info(f"[{service_name}] Coverage report: {coverage_report}")
    
    logger.success(f"[{service_name}] Python tests passed")


def generate_coverage_index(repo_root: Path, logger):
    """
    Generate aggregated coverage index HTML report.
    
    Calls: scripts/build-and-test-backend/generate-coverage-index.py
    """
    index_script = repo_root / "scripts" / "build-and-test-backend" / "generate-coverage-index.py"
    
    if not index_script.exists():
        logger.warning(f"Coverage index generator not found: {index_script}")
        return
    
    logger.info("Generating backend coverage index...")
    
    result = subprocess.run(
        [sys.executable, str(index_script)],
        capture_output=True,
        check=False,
        timeout=30
    )
    
    if result.returncode == 0:
        logger.success("Backend coverage index generated")
    else:
        logger.warning("Coverage index generation failed")


def main():
    """Main backend test orchestration."""
    parser = argparse.ArgumentParser(
        description="Build and test all backend services"
    )
    parser.add_argument(
        "--service",
        help="Test specific service only (e.g., 'agent', 'client')"
    )
    parser.add_argument(
        "--skip-coverage-report",
        action="store_true",
        help="Skip coverage index generation"
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
        name="Backend Test Pipeline",
        log_dir=repo_root / "build-logs" / "build-and-test-backend"
    )
    
    try:
        backend_dir = repo_root / "services" / "backend"
        
        if not backend_dir.exists():
            logger.fail_fast(f"Backend directory not found: {backend_dir}")
        
        # Service discovery
        with logger.group("Service Discovery"):
            all_services = discover_backend_services(backend_dir, logger)
        
        # Filter to specific service if requested
        if args.service:
            if args.service not in all_services:
                logger.fail_fast(
                    f"Service '{args.service}' not found. "
                    f"Available: {', '.join(all_services.keys())}"
                )
            services_to_test = {args.service: all_services[args.service]}
        else:
            services_to_test = all_services
        
        # Run tests for each service
        for service_name, service_type in services_to_test.items():
            service_path = backend_dir / service_name
            
            with logger.timer(f"{service_name} ({service_type})"):
                if service_type == "gradle":
                    run_gradle_tests(service_name, service_path, logger, platform)
                elif service_type == "python":
                    run_python_tests(service_name, service_path, logger, platform)
        
        # Generate coverage index
        if not args.skip_coverage_report:
            with logger.timer("Coverage Report Generation"):
                generate_coverage_index(repo_root, logger)
        
        logger.success(
            f"All {len(services_to_test)} backend service(s) passed tests"
        )
        return 0
    
    except Exception as e:
        logger.error(f"Backend testing failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
