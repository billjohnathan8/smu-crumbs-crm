#!/usr/bin/env python3
"""
Unified build and test pipeline - orchestrates backend and frontend testing.

Replaces:
- scripts/build-and-test-all/build-and-test-all.ps1 (Windows)
- scripts/build-and-test-all/build-and-test-all.sh (Unix)

Orchestrates:
1. Backend testing (Gradle Java + Python services)
2. Frontend testing (React TypeScript)
3. Aggregated coverage report generation

Usage:
    python scripts/pipelines/test_all.py [--parallel] [--skip-frontend] [--skip-backend]
"""

import argparse
import sys
import subprocess
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


class PipelineResult:
    """Result of a pipeline execution."""
    def __init__(self, name: str, exit_code: int, duration_seconds: float):
        self.name = name
        self.exit_code = exit_code
        self.duration_seconds = duration_seconds
        self.success = exit_code == 0


def run_pipeline(
    script_path: Path,
    pipeline_name: str,
    logger,
    extra_args: Optional[list[str]] = None
) -> PipelineResult:
    """
    Run a test pipeline script and return result.
    
    Args:
        script_path: Path to pipeline script (e.g., test_backend.py)
        pipeline_name: Human-readable name for logging
        logger: Logger instance
        extra_args: Additional CLI arguments to pass to pipeline
    
    Returns:
        PipelineResult with exit code and duration
    """
    logger.info(f"[{pipeline_name}] Starting...")
    
    cmd = [sys.executable, str(script_path)]
    if extra_args:
        cmd.extend(extra_args)
    
    import time
    start_time = time.time()
    
    result = subprocess.run(
        cmd,
        capture_output=False,  # Stream output to console
        check=False,
        timeout=3600  # 1 hour max per pipeline
    )
    
    duration = time.time() - start_time
    
    if result.returncode == 0:
        logger.success(f"[{pipeline_name}] Completed in {duration:.1f}s")
    else:
        logger.error(
            f"[{pipeline_name}] Failed with exit code {result.returncode} "
            f"after {duration:.1f}s"
        )
    
    return PipelineResult(pipeline_name, result.returncode, duration)


def run_pipelines_sequential(
    backend_script: Path,
    frontend_script: Path,
    logger,
    skip_backend: bool = False,
    skip_frontend: bool = False
) -> list[PipelineResult]:
    """
    Run pipelines sequentially (fail fast on first error).
    
    Returns:
        List of PipelineResult objects
    """
    results = []
    
    # Backend
    if not skip_backend:
        with logger.timer("Backend Pipeline"):
            backend_result = run_pipeline(backend_script, "Backend", logger)
            results.append(backend_result)
            
            if not backend_result.success:
                logger.error("Backend pipeline failed, aborting")
                return results
    else:
        logger.info("Skipping backend pipeline (--skip-backend)")
    
    # Frontend
    if not skip_frontend:
        with logger.timer("Frontend Pipeline"):
            frontend_result = run_pipeline(frontend_script, "Frontend", logger)
            results.append(frontend_result)
            
            if not frontend_result.success:
                logger.error("Frontend pipeline failed")
                return results
    else:
        logger.info("Skipping frontend pipeline (--skip-frontend)")
    
    return results


def run_pipelines_parallel(
    backend_script: Path,
    frontend_script: Path,
    logger,
    skip_backend: bool = False,
    skip_frontend: bool = False
) -> list[PipelineResult]:
    """
    Run pipelines in parallel for faster execution.
    
    Returns:
        List of PipelineResult objects
    """
    logger.info("Running pipelines in parallel...")
    
    results = []
    futures = {}
    
    with ThreadPoolExecutor(max_workers=2) as executor:
        # Submit backend
        if not skip_backend:
            backend_future = executor.submit(
                run_pipeline, backend_script, "Backend", logger
            )
            futures[backend_future] = "Backend"
        
        # Submit frontend
        if not skip_frontend:
            frontend_future = executor.submit(
                run_pipeline, frontend_script, "Frontend", logger
            )
            futures[frontend_future] = "Frontend"
        
        # Wait for completion
        for future in as_completed(futures):
            pipeline_name = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                logger.error(f"[{pipeline_name}] Exception: {e}")
                results.append(PipelineResult(pipeline_name, 1, 0))
    
    return results


def generate_aggregated_coverage_index(repo_root: Path, logger):
    """
    Generate aggregated coverage index combining backend and frontend.
    
    Calls: scripts/build-and-test-all/generate-aggregated-coverage-index.py
    """
    index_script = (
        repo_root / "scripts" / "build-and-test-all" / 
        "generate-aggregated-coverage-index.py"
    )
    
    if not index_script.exists():
        logger.warning(f"Aggregated coverage generator not found: {index_script}")
        return
    
    logger.info("Generating aggregated coverage index...")
    
    result = subprocess.run(
        [sys.executable, str(index_script)],
        capture_output=True,
        check=False,
        timeout=60
    )
    
    if result.returncode == 0:
        output_file = repo_root / "build-logs" / "build-and-test-all" / "index.html"
        logger.success(f"Aggregated coverage index: {output_file}")
    else:
        logger.warning("Aggregated coverage index generation failed")


def main():
    """Main unified build orchestration."""
    parser = argparse.ArgumentParser(
        description="Build and test all services (backend + frontend)"
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Run backend and frontend pipelines in parallel (faster)"
    )
    parser.add_argument(
        "--skip-backend",
        action="store_true",
        help="Skip backend pipeline"
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip frontend pipeline"
    )
    args = parser.parse_args()
    
    # Validate flags
    if args.skip_backend and args.skip_frontend:
        print("Error: Cannot skip both backend and frontend pipelines")
        return 1
    
    # Setup platform
    platform = get_platform()
    repo_root = platform.get_repo_root()
    
    # Windows UTF-8 setup
    if is_windows():
        from scripts.platform.windows import setup_windows_encoding
        setup_windows_encoding()
    
    # Create logger
    logger = create_logger(
        name="Unified Build Pipeline",
        log_dir=repo_root / "build-logs" / "build-and-test-all"
    )
    
    try:
        # Pipeline script paths
        backend_script = repo_root / "scripts" / "pipelines" / "test_backend.py"
        frontend_script = repo_root / "scripts" / "pipelines" / "test_frontend.py"
        
        # Verify pipelines exist
        if not args.skip_backend and not backend_script.exists():
            logger.fail_fast(
                f"Backend pipeline not found: {backend_script}\n"
                "Run Phase 3 first to create test_backend.py"
            )
        
        if not args.skip_frontend and not frontend_script.exists():
            logger.fail_fast(
                f"Frontend pipeline not found: {frontend_script}\n"
                "Run Phase 4 first to create test_frontend.py"
            )
        
        # Run pipelines
        if args.parallel:
            logger.info("Mode: Parallel execution")
            results = run_pipelines_parallel(
                backend_script,
                frontend_script,
                logger,
                skip_backend=args.skip_backend,
                skip_frontend=args.skip_frontend
            )
        else:
            logger.info("Mode: Sequential execution (fail fast)")
            results = run_pipelines_sequential(
                backend_script,
                frontend_script,
                logger,
                skip_backend=args.skip_backend,
                skip_frontend=args.skip_frontend
            )
        
        # Check results
        all_passed = all(r.success for r in results)
        
        if not all_passed:
            logger.error("One or more pipelines failed:")
            for result in results:
                status = "✓ PASS" if result.success else "✗ FAIL"
                logger.info(
                    f"  {status} {result.name} "
                    f"(exit code: {result.exit_code}, "
                    f"duration: {result.duration_seconds:.1f}s)"
                )
            return 1
        
        # All passed - generate aggregated report
        logger.success("All pipelines passed!")
        
        for result in results:
            logger.info(
                f"  ✓ {result.name} ({result.duration_seconds:.1f}s)"
            )
        
        with logger.timer("Aggregated Report"):
            generate_aggregated_coverage_index(repo_root, logger)
        
        logger.success("Unified build completed successfully")
        return 0
    
    except Exception as e:
        logger.error(f"Unified build failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
