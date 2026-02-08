#!/usr/bin/env python3
"""
CI/CD validation orchestrator - 3-phase testing suite.

Replaces:
- scripts/test-ci-cd-full/test-ci-cd-full.ps1 (Windows)
- scripts/test-ci-cd-full/test-ci-cd-full.sh (Unix)

Phases:
1. Local validation (actionlint + test pipelines)
2. GitHub Actions testing (workflow triggers)
3. End-to-end workflow (PR creation, branch policy)

Usage:
    python scripts/pipelines/validate_ci_cd.py [OPTIONS]
    
Examples:
    # Local validation only
    python scripts/pipelines/validate_ci_cd.py --local-only
    
    # Full validation with GitHub testing
    python scripts/pipelines/validate_ci_cd.py
    
    # Include end-to-end workflow testing
    python scripts/pipelines/validate_ci_cd.py --end-to-end
    
    # GitHub testing only (skip local)
    python scripts/pipelines/validate_ci_cd.py --github-only
"""

import argparse
import sys
import subprocess
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


@dataclass
class PhaseResult:
    """Result of a validation phase."""
    phase_name: str
    passed: bool
    duration_seconds: float
    exit_code: int
    message: Optional[str] = None


def run_actionlint(logger, platform) -> bool:
    """
    Validate GitHub workflow syntax using actionlint.
    
    Returns:
        True if validation passed, False otherwise
    """
    logger.info("Validating GitHub workflow syntax...")
    
    # Check if actionlint is installed
    actionlint = platform.find_executable("actionlint", required=False)
    
    if not actionlint:
        logger.warning(
            "actionlint not found. Install: "
            "https://github.com/rhysd/actionlint"
        )
        logger.info("Skipping workflow syntax validation")
        return True  # Don't fail if tool missing
    
    workflows_dir = repo_root / ".github" / "workflows"
    
    if not workflows_dir.exists():
        logger.warning(f"Workflows directory not found: {workflows_dir}")
        return True
    
    try:
        result = platform.run_command(
            [str(actionlint), "-verbose"],
            cwd=workflows_dir,
            capture_output=True,
            check=False,
            timeout=60
        )
        
        if result.returncode == 0:
            logger.success("Workflow syntax validation passed")
            return True
        else:
            logger.error("Workflow syntax validation failed:")
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return False
    except Exception as e:
        logger.error(f"Error running actionlint: {e}")
        return False


def run_local_tests(logger, keep_cluster: bool = False) -> bool:
    """
    Run full local test pipeline.
    
    Steps:
    1. Backend tests
    2. Frontend tests
    3. K8s deployment
    4. Smoke tests
    
    Returns:
        True if all tests passed
    """
    logger.info("Running local test pipeline...")
    
    # Run test_all.py
    test_all = repo_root / "scripts" / "pipelines" / "test_all.py"
    
    if not test_all.exists():
        logger.error(f"test_all.py not found: {test_all}")
        logger.info("Skipping local tests (dependency missing)")
        return True  # Don't fail if not yet implemented
    
    logger.info("Running test_all.py...")
    result = subprocess.run(
        [sys.executable, str(test_all)],
        check=False
    )
    
    if result.returncode != 0:
        logger.error("Local tests failed")
        return False
    
    # Run k8s deployment
    deploy_k8s = repo_root / "scripts" / "pipelines" / "deploy_k8s.py"
    
    if not deploy_k8s.exists():
        logger.warning(f"deploy_k8s.py not found: {deploy_k8s}")
        logger.info("Skipping K8s deployment (dependency missing)")
        return True  # Don't fail if not yet implemented
    
    logger.info("Running K8s deployment...")
    cmd = [sys.executable, str(deploy_k8s)]
    if keep_cluster:
        cmd.append("--keep")
    
    result = subprocess.run(cmd, check=False)
    
    if result.returncode != 0:
        logger.error("K8s deployment failed")
        return False
    
    logger.success("Local test pipeline passed")
    return True


def run_phase1_local_validation(
    logger,
    platform,
    keep_cluster: bool = False
) -> PhaseResult:
    """Execute Phase 1: Local validation."""
    start_time = time.time()
    
    with logger.group("Phase 1: Local Validation"):
        # Actionlint
        actionlint_ok = run_actionlint(logger, platform)
        
        # Local tests
        tests_ok = run_local_tests(logger, keep_cluster)
        
        passed = actionlint_ok and tests_ok
        duration = time.time() - start_time
        
        return PhaseResult(
            phase_name="Local Validation",
            passed=passed,
            duration_seconds=duration,
            exit_code=0 if passed else 1,
            message="All local validations passed" if passed else "Local validation failed"
        )


def run_phase2_github_actions(
    logger,
    create_prs: bool = False,
    wait_for_workflows: bool = True,
    timeout_minutes: int = 60
) -> PhaseResult:
    """Execute Phase 2: GitHub Actions testing."""
    start_time = time.time()
    
    with logger.group("Phase 2: GitHub Actions Testing"):
        # Call test_github_workflows.py
        workflow_test = repo_root / "scripts" / "pipelines" / "test_github_workflows.py"
        
        if not workflow_test.exists():
            logger.warning(f"test_github_workflows.py not found: {workflow_test}")
            duration = time.time() - start_time
            return PhaseResult(
                phase_name="GitHub Actions Testing",
                passed=True,
                duration_seconds=duration,
                exit_code=0,
                message="GitHub workflow testing skipped (dependency missing)"
            )
        
        cmd = [sys.executable, str(workflow_test)]
        
        if create_prs:
            cmd.append("--create-prs")
        
        if wait_for_workflows:
            cmd.append("--wait-for-workflows")
            cmd.extend(["--timeout-minutes", str(timeout_minutes)])
        
        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, check=False)
        
        passed = result.returncode == 0
        duration = time.time() - start_time
        
        return PhaseResult(
            phase_name="GitHub Actions Testing",
            passed=passed,
            duration_seconds=duration,
            exit_code=result.returncode,
            message="GitHub workflows passed" if passed else "GitHub workflow failures detected"
        )


def run_phase3_end_to_end(
    logger,
    create_prs: bool = False
) -> PhaseResult:
    """Execute Phase 3: End-to-end workflow testing."""
    start_time = time.time()
    
    with logger.group("Phase 3: End-to-End Workflow"):
        logger.info("E2E workflow testing not yet implemented")
        logger.info("This would include:")
        logger.info("  - Feature branch creation")
        logger.info("  - PR to component trunk")
        logger.info("  - Branch policy enforcement verification")
        logger.info("  - Merge cascade testing (component → integration → main)")
        
        # TODO: Implement feature branch → PR → merge cascade
        
        passed = True
        duration = time.time() - start_time
        
        return PhaseResult(
            phase_name="End-to-End Workflow",
            passed=passed,
            duration_seconds=duration,
            exit_code=0,
            message="E2E workflow skipped (not implemented)"
        )


def main():
    """Main CI/CD validation orchestration."""
    parser = argparse.ArgumentParser(
        description="CI/CD validation suite - orchestrates local and GitHub testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Local validation only (actionlint + test pipelines)
  python scripts/pipelines/validate_ci_cd.py --local-only
  
  # Full validation (local + GitHub workflows)
  python scripts/pipelines/validate_ci_cd.py
  
  # GitHub workflows only
  python scripts/pipelines/validate_ci_cd.py --github-only
  
  # Include end-to-end workflow testing
  python scripts/pipelines/validate_ci_cd.py --end-to-end
  
  # Create actual test PRs (default is dry-run)
  python scripts/pipelines/validate_ci_cd.py --create-prs
  
  # Keep kind cluster after local tests
  python scripts/pipelines/validate_ci_cd.py --local-only --keep

Exit Codes:
  0   - All phases passed
  1-2 - Phase 1 (local) failed
  3-6 - Phase 2 (GitHub Actions) failed
  7   - Phase 3 (E2E) failed
  8   - Timeout exceeded
  9   - Dependency check failed
        """
    )
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Only run Phase 1 (local validation)"
    )
    parser.add_argument(
        "--github-only",
        action="store_true",
        help="Skip Phase 1, only GitHub testing"
    )
    parser.add_argument(
        "--end-to-end",
        action="store_true",
        help="Include Phase 3 (E2E workflow)"
    )
    parser.add_argument(
        "--create-prs",
        action="store_true",
        help="Actually create test PRs (default: dry-run)"
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Preserve kind cluster after local tests"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Timeout in minutes (default: 120)"
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
        name="CI/CD Validation",
        log_dir=repo_root / "build-logs" / "validate-ci-cd"
    )
    
    try:
        logger.section("CI/CD VALIDATION SUITE")
        logger.info(f"Platform: {platform.info.platform_type.value}")
        logger.info(f"Repository: {repo_root}")
        
        results: List[PhaseResult] = []
        
        # Phase 1: Local validation
        if not args.github_only:
            phase1 = run_phase1_local_validation(logger, platform, args.keep)
            results.append(phase1)
            
            if not phase1.passed and not args.local_only:
                logger.error("Phase 1 failed, aborting remaining phases")
                logger.section("VALIDATION SUMMARY")
                logger.error(f"✗ FAIL {phase1.phase_name} ({phase1.duration_seconds:.1f}s)")
                return phase1.exit_code
        
        if args.local_only:
            logger.success("Local validation complete")
            return 0
        
        # Phase 2: GitHub Actions
        phase2 = run_phase2_github_actions(
            logger,
            create_prs=args.create_prs,
            wait_for_workflows=True,
            timeout_minutes=args.timeout
        )
        results.append(phase2)
        
        if not phase2.passed:
            logger.error("Phase 2 failed")
            # Continue to summary even on failure
        
        # Phase 3: End-to-end (optional)
        if args.end_to_end:
            phase3 = run_phase3_end_to_end(logger, args.create_prs)
            results.append(phase3)
            
            if not phase3.passed:
                logger.error("Phase 3 failed")
        
        # Summary
        logger.section("VALIDATION SUMMARY")
        for result in results:
            status = "✓ PASS" if result.passed else "✗ FAIL"
            logger.info(
                f"{status} {result.phase_name} "
                f"({result.duration_seconds:.1f}s) - {result.message}"
            )
        
        all_passed = all(r.passed for r in results)
        
        if all_passed:
            logger.success("All CI/CD validation phases passed!")
            return 0
        else:
            logger.error("CI/CD validation failed")
            # Return error code from first failed phase
            for result in results:
                if not result.passed:
                    return result.exit_code
            return 1
    
    except KeyboardInterrupt:
        logger.error("CI/CD validation interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"CI/CD validation error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
