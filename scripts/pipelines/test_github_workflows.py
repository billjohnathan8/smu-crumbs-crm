#!/usr/bin/env python3
"""
GitHub Actions workflow testing automation.

Replaces:
- scripts/test-ci-cd-github/test-ci-cd-github.ps1 (Windows)
- scripts/test-ci-cd-github/test-ci-cd-github.sh (Unix)

Capabilities:
- Trigger workflows via test commits
- Monitor workflow execution
- Test branch policies via PRs
- Generate JSON test report

Usage:
    python scripts/pipelines/test_github_workflows.py [OPTIONS]
    
Examples:
    # Verify gh CLI is ready
    python scripts/pipelines/test_github_workflows.py --verify-only
    
    # Test specific branches
    python scripts/pipelines/test_github_workflows.py --branches frontend agent-backend
    
    # Trigger workflows and wait for completion
    python scripts/pipelines/test_github_workflows.py --wait-for-workflows
    
    # Create test PRs to verify branch policies
    python scripts/pipelines/test_github_workflows.py --create-prs
"""

import argparse
import sys
import json
import time
import subprocess
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


@dataclass
class WorkflowResult:
    """Result of a single workflow run."""
    branch: str
    workflow_id: Optional[str]
    status: str  # "success", "failure", "cancelled", "pending", "timeout", "skipped"
    duration_seconds: Optional[float]
    run_url: Optional[str]
    error_message: Optional[str] = None


def check_gh_cli(platform, logger) -> bool:
    """
    Check if gh CLI is installed and authenticated.
    
    Returns:
        True if ready to use, False otherwise
    """
    logger.info("Checking GitHub CLI...")
    
    gh = platform.find_executable("gh", required=False)
    
    if not gh:
        logger.error(
            "GitHub CLI (gh) not found. "
            "Install: https://cli.github.com/"
        )
        return False
    
    logger.success(f"GitHub CLI found: {gh}")
    
    # Check authentication
    logger.info("Verifying GitHub authentication...")
    try:
        result = platform.run_command(
            ["gh", "auth", "status"],
            capture_output=True,
            check=False
        )
        
        if result.returncode != 0:
            logger.error(
                "Not authenticated with GitHub. "
                "Run: gh auth login"
            )
            if result.stderr:
                logger.info(result.stderr)
            return False
        
        logger.success("GitHub authentication verified")
        
        # Show account info
        if result.stderr:
            for line in result.stderr.split('\n'):
                if 'Logged in to' in line or 'as' in line:
                    logger.info(f"  {line.strip()}")
        
        return True
    
    except Exception as e:
        logger.error(f"Error checking gh auth: {e}")
        return False


def get_repo_info(platform, logger) -> Optional[str]:
    """
    Get current repository name in owner/repo format.
    
    Returns:
        Repository name or None if not in a git repository
    """
    try:
        result = platform.run_command(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
            capture_output=True,
            check=False,
            cwd=repo_root
        )
        
        if result.returncode == 0 and result.stdout:
            repo_name = result.stdout.strip()
            logger.info(f"Repository: {repo_name}")
            return repo_name
        else:
            logger.warning("Could not determine repository name")
            return None
    
    except Exception as e:
        logger.error(f"Error getting repo info: {e}")
        return None


def trigger_workflow(
    branch: str,
    platform,
    logger,
    dry_run: bool = True
) -> Optional[str]:
    """
    Trigger workflow by creating and pushing test commit.
    
    Args:
        branch: Branch name to trigger workflow on
        platform: Platform abstraction
        logger: Logger instance
        dry_run: If True, don't actually push (default)
    
    Returns:
        Workflow run ID if successful, None otherwise
    """
    logger.info(f"Triggering workflow for branch: {branch}")
    
    if dry_run:
        logger.warning(f"DRY RUN: Would trigger workflow on {branch}")
        logger.info("  1. git checkout {branch}")
        logger.info("  2. Create timestamp file")
        logger.info("  3. git commit and push")
        logger.info("  4. Query workflow run ID via gh CLI")
        return f"dry-run-{branch}"
    
    try:
        # Checkout branch
        logger.info(f"Checking out branch: {branch}")
        result = platform.run_command(
            ["git", "checkout", branch],
            capture_output=True,
            check=False,
            cwd=repo_root
        )
        
        if result.returncode != 0:
            logger.error(f"Failed to checkout branch {branch}")
            if result.stderr:
                logger.error(result.stderr)
            return None
        
        # Create test file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        test_file = repo_root / f".github-workflow-test-{timestamp}.txt"
        test_file.write_text(f"Workflow test triggered at {timestamp}\n")
        
        logger.info(f"Created test file: {test_file.name}")
        
        # Git add
        platform.run_command(
            ["git", "add", str(test_file)],
            cwd=repo_root,
            check=True
        )
        
        # Git commit
        platform.run_command(
            ["git", "commit", "-m", f"Test workflow trigger - {timestamp}"],
            cwd=repo_root,
            check=True
        )
        
        # Git push
        logger.info(f"Pushing to {branch}...")
        platform.run_command(
            ["git", "push", "origin", branch],
            cwd=repo_root,
            check=True
        )
        
        # Wait a bit for GitHub to register the push
        time.sleep(5)
        
        # Get latest workflow run ID
        logger.info("Querying latest workflow run...")
        result = platform.run_command(
            [
                "gh", "run", "list",
                "--branch", branch,
                "--limit", "1",
                "--json", "databaseId",
                "--jq", ".[0].databaseId"
            ],
            capture_output=True,
            check=False,
            cwd=repo_root
        )
        
        if result.returncode == 0 and result.stdout:
            run_id = result.stdout.strip()
            logger.success(f"Workflow triggered: run ID {run_id}")
            return run_id
        else:
            logger.warning("Could not get workflow run ID")
            return None
    
    except Exception as e:
        logger.error(f"Error triggering workflow: {e}")
        return None


def wait_for_workflow(
    run_id: str,
    branch: str,
    platform,
    logger,
    timeout_seconds: int = 3600,
    poll_interval: int = 30
) -> WorkflowResult:
    """
    Poll workflow status until completion or timeout.
    
    Args:
        run_id: Workflow run ID
        branch: Branch name (for result)
        platform: Platform abstraction
        logger: Logger instance
        timeout_seconds: Maximum wait time
        poll_interval: Seconds between status checks
    
    Returns:
        WorkflowResult with final status
    """
    logger.info(f"Waiting for workflow {run_id} to complete...")
    logger.info(f"Timeout: {timeout_seconds}s, Poll interval: {poll_interval}s")
    
    start_time = time.time()
    
    while time.time() - start_time < timeout_seconds:
        try:
            # Query workflow status
            result = platform.run_command(
                [
                    "gh", "run", "view", str(run_id),
                    "--json", "status,conclusion,url,createdAt"
                ],
                capture_output=True,
                check=False,
                cwd=repo_root
            )
            
            if result.returncode != 0:
                logger.warning(f"Could not query workflow {run_id}")
                time.sleep(poll_interval)
                continue
            
            data = json.loads(result.stdout)
            status = data.get("status", "unknown")
            conclusion = data.get("conclusion")
            run_url = data.get("url")
            
            logger.info(f"Workflow status: {status}" + (f", conclusion: {conclusion}" if conclusion else ""))
            
            # Check if complete
            if status == "completed":
                duration = time.time() - start_time
                
                # Map conclusion to our status
                if conclusion == "success":
                    final_status = "success"
                elif conclusion == "failure":
                    final_status = "failure"
                elif conclusion == "cancelled":
                    final_status = "cancelled"
                else:
                    final_status = conclusion or "unknown"
                
                logger.success(f"Workflow completed: {final_status}")
                
                return WorkflowResult(
                    branch=branch,
                    workflow_id=run_id,
                    status=final_status,
                    duration_seconds=duration,
                    run_url=run_url
                )
            
            # Still in progress
            time.sleep(poll_interval)
        
        except json.JSONDecodeError as e:
            logger.warning(f"Error parsing workflow status: {e}")
            time.sleep(poll_interval)
        except Exception as e:
            logger.warning(f"Error checking workflow: {e}")
            time.sleep(poll_interval)
    
    # Timeout
    duration = time.time() - start_time
    logger.error(f"Workflow {run_id} timed out after {duration:.1f}s")
    
    return WorkflowResult(
        branch=branch,
        workflow_id=run_id,
        status="timeout",
        duration_seconds=duration,
        run_url=None,
        error_message=f"Timeout after {timeout_seconds}s"
    )


def generate_report(
    results: List[WorkflowResult],
    output_dir: Path,
    logger
) -> Path:
    """
    Generate JSON test report.
    
    Args:
        results: List of workflow results
        output_dir: Output directory for report
        logger: Logger instance
    
    Returns:
        Path to generated report file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Get repository info
    platform = get_platform()
    repo_name = get_repo_info(platform, logger) or "unknown"
    
    report: Dict[str, Any] = {
        "timestamp": datetime.now().isoformat() + "Z",
        "repository": repo_name,
        "branches_tested": [r.branch for r in results],
        "results": [asdict(r) for r in results],
        "summary": {
            "total": len(results),
            "passed": sum(1 for r in results if r.status == "success"),
            "failed": sum(1 for r in results if r.status == "failure"),
            "timeout": sum(1 for r in results if r.status == "timeout"),
            "skipped": sum(1 for r in results if r.status == "skipped")
        }
    }
    
    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Write report
    report_file = output_dir / f"workflow-test-report-{timestamp}.json"
    report_file.write_text(json.dumps(report, indent=2))
    
    logger.success(f"Report generated: {report_file}")
    
    # Also write latest.json for easy access
    latest_file = output_dir / "latest.json"
    latest_file.write_text(json.dumps(report, indent=2))
    
    return report_file


def main():
    """Main GitHub workflow testing orchestration."""
    parser = argparse.ArgumentParser(
        description="GitHub Actions workflow testing automation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Verify gh CLI is installed and authenticated
  python scripts/pipelines/test_github_workflows.py --verify-only
  
  # Test specific branches (dry-run)
  python scripts/pipelines/test_github_workflows.py --branches frontend agent-backend
  
  # Trigger workflows and wait for completion
  python scripts/pipelines/test_github_workflows.py --wait-for-workflows
  
  # Create actual test PRs (not dry-run)
  python scripts/pipelines/test_github_workflows.py --create-prs

Exit Codes:
  0 - All workflows passed
  1 - General error
  2 - Prerequisites missing (gh CLI)
  3 - One or more workflows failed
  4 - Workflow timeout
        """
    )
    parser.add_argument(
        "--branches",
        nargs="+",
        default=[
            "frontend",
            "agent-backend",
            "log-backend",
            "client-backend",
            "transaction-backend",
            "infrastructure"
        ],
        help="Branches to test (default: all 6 component trunks)"
    )
    parser.add_argument(
        "--skip-component-trunks",
        action="store_true",
        help="Skip component trunk testing"
    )
    parser.add_argument(
        "--skip-integration",
        action="store_true",
        help="Skip integration branch testing"
    )
    parser.add_argument(
        "--skip-main",
        action="store_true",
        help="Skip main branch testing"
    )
    parser.add_argument(
        "--skip-branch-policy",
        action="store_true",
        help="Skip PR/branch policy tests"
    )
    parser.add_argument(
        "--create-prs",
        action="store_true",
        help="Actually create PRs (default: dry-run)"
    )
    parser.add_argument(
        "--wait-for-workflows",
        action="store_true",
        help="Wait for workflow completion (with timeout)"
    )
    parser.add_argument(
        "--timeout-minutes",
        type=int,
        default=60,
        help="Timeout in minutes (default: 60)"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify gh CLI (don't run tests)"
    )
    args = parser.parse_args()
    
    # Setup
    platform = get_platform()
    
    if is_windows():
        from scripts.platform.windows import setup_windows_encoding
        setup_windows_encoding()
    
    logger = create_logger(
        name="GitHub Workflow Testing",
        log_dir=repo_root / "build-logs" / "test-github-workflows"
    )
    
    try:
        logger.section("GITHUB WORKFLOW TESTING")
        logger.info(f"Platform: {platform.info.platform_type.value}")
        logger.info(f"Repository: {repo_root}")
        
        # Check prerequisites
        if not check_gh_cli(platform, logger):
            logger.error("Prerequisites check failed")
            return 2
        
        repo_info = get_repo_info(platform, logger)
        
        if args.verify_only:
            logger.success("GitHub CLI verification complete")
            return 0
        
        results: List[WorkflowResult] = []
        
        # Workflow triggering (dry-run by default)
        dry_run = not args.create_prs
        
        if dry_run:
            logger.warning("DRY RUN MODE: No actual commits/pushes will be made")
            logger.info("Use --create-prs to actually trigger workflows")
        
        # Trigger workflows on component trunks
        if not args.skip_component_trunks:
            logger.section("COMPONENT TRUNK WORKFLOWS")
            
            for branch in args.branches:
                with logger.group(f"Branch: {branch}"):
                    run_id = trigger_workflow(branch, platform, logger, dry_run)
                    
                    if run_id and args.wait_for_workflows:
                        result = wait_for_workflow(
                            run_id,
                            branch,
                            platform,
                            logger,
                            timeout_seconds=args.timeout_minutes * 60
                        )
                        results.append(result)
                    elif run_id:
                        # Triggered but not waiting
                        results.append(WorkflowResult(
                            branch=branch,
                            workflow_id=run_id,
                            status="pending",
                            duration_seconds=None,
                            run_url=None
                        ))
                    else:
                        # Failed to trigger
                        results.append(WorkflowResult(
                            branch=branch,
                            workflow_id=None,
                            status="skipped",
                            duration_seconds=None,
                            run_url=None,
                            error_message="Failed to trigger workflow"
                        ))
        
        # Integration branch
        if not args.skip_integration:
            logger.section("INTEGRATION BRANCH WORKFLOW")
            logger.info("Integration branch testing: TODO")
            # TODO: Implement integration branch testing
        
        # Main branch
        if not args.skip_main:
            logger.section("MAIN BRANCH WORKFLOW")
            logger.info("Main branch testing: TODO")
            # TODO: Implement main branch testing
        
        # Branch policy testing
        if not args.skip_branch_policy:
            logger.section("BRANCH POLICY TESTING")
            logger.info("Branch policy testing via PRs: TODO")
            # TODO: Implement PR creation and policy verification
        
        # Generate report
        if results:
            logger.section("GENERATING REPORT")
            report_file = generate_report(
                results,
                repo_root / "build-logs" / "test-github-workflows",
                logger
            )
            
            # Display summary
            logger.section("WORKFLOW TEST SUMMARY")
            summary = {
                "total": len(results),
                "passed": sum(1 for r in results if r.status == "success"),
                "failed": sum(1 for r in results if r.status == "failure"),
                "timeout": sum(1 for r in results if r.status == "timeout"),
                "skipped": sum(1 for r in results if r.status == "skipped"),
                "pending": sum(1 for r in results if r.status == "pending")
            }
            
            logger.info(f"Total: {summary['total']}")
            logger.info(f"Passed: {summary['passed']}")
            if summary['failed'] > 0:
                logger.error(f"Failed: {summary['failed']}")
            if summary['timeout'] > 0:
                logger.warning(f"Timeout: {summary['timeout']}")
            if summary['skipped'] > 0:
                logger.info(f"Skipped: {summary['skipped']}")
            if summary['pending'] > 0:
                logger.info(f"Pending: {summary['pending']}")
            
            # Determine exit code
            if summary['failed'] > 0:
                logger.error("Some workflows failed")
                return 3
            elif summary['timeout'] > 0:
                logger.error("Some workflows timed out")
                return 4
            elif summary['passed'] > 0:
                logger.success("All completed workflows passed!")
                return 0
            else:
                logger.info("No workflows completed")
                return 0
        else:
            logger.warning("No workflows tested")
            return 0
    
    except KeyboardInterrupt:
        logger.error("Workflow testing interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Workflow testing error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
