"""
GitHub Actions-specific platform utilities.

Handles GitHub Actions-specific concerns:
- Environment detection and variables
- Workflow commands (::set-output, ::error, etc.)
- Artifact handling hints
- Job summaries and annotations
- Action outputs

Fail-fast philosophy: Detect GitHub Actions misconfiguration early.
"""

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


def require_github_actions():
    """Fail fast if not running in GitHub Actions."""
    from scripts.core.detect import is_github_actions
    if not is_github_actions():
        raise EnvironmentError(
            "This operation requires GitHub Actions execution context"
        )


@dataclass
class GitHubContext:
    """GitHub Actions context information."""
    workflow_name: str
    run_id: str
    run_number: str
    job_name: str
    action: str
    actor: str
    repository: str
    ref: str
    sha: str
    workspace: Path
    runner_os: str
    runner_arch: str
    artifact_dir: Optional[Path] = None


def get_github_context() -> GitHubContext:
    """
    Get GitHub Actions context from environment variables.
    
    Returns:
        GitHubContext with workflow information
        
    Raises:
        EnvironmentError: If not running in GitHub Actions
        KeyError: If required environment variables are missing
    """
    require_github_actions()
    
    # Common artifact directory
    workspace = Path(os.getenv("GITHUB_WORKSPACE", Path.cwd()))
    artifact_dir = workspace / "artifacts"
    
    return GitHubContext(
        workflow_name=os.environ.get("GITHUB_WORKFLOW", "unknown"),
        run_id=os.environ.get("GITHUB_RUN_ID", "0"),
        run_number=os.environ.get("GITHUB_RUN_NUMBER", "0"),
        job_name=os.environ.get("GITHUB_JOB", "unknown"),
        action=os.environ.get("GITHUB_ACTION", "unknown"),
        actor=os.environ.get("GITHUB_ACTOR", "unknown"),
        repository=os.environ.get("GITHUB_REPOSITORY", "unknown/unknown"),
        ref=os.environ.get("GITHUB_REF", "unknown"),
        sha=os.environ.get("GITHUB_SHA", "0" * 40),
        workspace=workspace,
        runner_os=os.environ.get("RUNNER_OS", "unknown"),
        runner_arch=os.environ.get("RUNNER_ARCH", "unknown"),
        artifact_dir=artifact_dir if artifact_dir.exists() else None,
    )


def workflow_command(command: str, value: str = "", parameters: Optional[Dict[str, str]] = None):
    """
    Send workflow command to GitHub Actions.
    
    Format: ::command param1=value1,param2=value2::value
    
    Args:
        command: Command name (e.g., 'error', 'warning', 'notice', 'set-output')
        value: Command value
        parameters: Command parameters
    """
    require_github_actions()
    
    param_str = ""
    if parameters:
        param_str = " " + ",".join(f"{k}={v}" for k, v in parameters.items())
    
    print(f"::{command}{param_str}::{value}", flush=True)


def set_output(name: str, value: str):
    """
    Set output variable for GitHub Actions.
    
    NOTE: As of GitHub Actions runner 2.298.0+, the preferred method is
    to write to $GITHUB_OUTPUT file. This function handles both methods.
    
    Args:
        name: Output variable name
        value: Output variable value
    """
    require_github_actions()
    
    github_output = os.getenv("GITHUB_OUTPUT")
    
    if github_output:
        # New method: Write to GITHUB_OUTPUT file
        with open(github_output, "a", encoding="utf-8") as f:
            # Escape newlines in value
            escaped_value = value.replace("\n", "%0A")
            f.write(f"{name}={escaped_value}\n")
    else:
        # Legacy method: Use workflow command
        workflow_command("set-output", value, {"name": name})


def set_env(name: str, value: str):
    """
    Set environment variable for subsequent steps.
    
    Args:
        name: Environment variable name
        value: Environment variable value
    """
    require_github_actions()
    
    github_env = os.getenv("GITHUB_ENV")
    
    if github_env:
        # Write to GITHUB_ENV file
        with open(github_env, "a", encoding="utf-8") as f:
            # For multiline values, use heredoc syntax
            if "\n" in value:
                delimiter = "EOF"
                f.write(f"{name}<<{delimiter}\n{value}\n{delimiter}\n")
            else:
                f.write(f"{name}={value}\n")
    
    # Also set for current process
    os.environ[name] = value


def add_to_path(path: str | Path):
    """
    Add directory to PATH for subsequent steps.
    
    Args:
        path: Directory to add to PATH
    """
    require_github_actions()
    
    path_str = str(Path(path).resolve())
    
    github_path = os.getenv("GITHUB_PATH")
    
    if github_path:
        # Write to GITHUB_PATH file
        with open(github_path, "a", encoding="utf-8") as f:
            f.write(f"{path_str}\n")
    
    # Also add to current process PATH
    os.environ["PATH"] = f"{path_str}{os.pathsep}{os.environ.get('PATH', '')}"


def log_error(message: str, file: Optional[str] = None, line: Optional[int] = None):
    """
    Log error annotation in GitHub Actions.
    
    Args:
        message: Error message
        file: File path (optional)
        line: Line number (optional)
    """
    require_github_actions()
    
    params = {}
    if file:
        params["file"] = file
    if line:
        params["line"] = str(line)
    
    workflow_command("error", message, params if params else None)


def log_warning(message: str, file: Optional[str] = None, line: Optional[int] = None):
    """
    Log warning annotation in GitHub Actions.
    
    Args:
        message: Warning message
        file: File path (optional)
        line: Line number (optional)
    """
    require_github_actions()
    
    params = {}
    if file:
        params["file"] = file
    if line:
        params["line"] = str(line)
    
    workflow_command("warning", message, params if params else None)


def log_notice(message: str, file: Optional[str] = None, line: Optional[int] = None):
    """
    Log notice annotation in GitHub Actions.
    
    Args:
        message: Notice message
        file: File path (optional)
        line: Line number (optional)
    """
    require_github_actions()
    
    params = {}
    if file:
        params["file"] = file
    if line:
        params["line"] = str(line)
    
    workflow_command("notice", message, params if params else None)


def start_group(title: str):
    """
    Start collapsible group in GitHub Actions logs.
    
    Args:
        title: Group title
    """
    require_github_actions()
    workflow_command("group", title)


def end_group():
    """End collapsible group in GitHub Actions logs."""
    require_github_actions()
    workflow_command("endgroup")


def mask_value(value: str):
    """
    Mask sensitive value in logs.
    
    Args:
        value: Value to mask in subsequent log output
    """
    require_github_actions()
    workflow_command("add-mask", value)


def add_job_summary(markdown: str, append: bool = True):
    """
    Add content to job summary (markdown supported).
    
    Args:
        markdown: Markdown content to add
        append: If True, append; if False, overwrite
    """
    require_github_actions()
    
    github_step_summary = os.getenv("GITHUB_STEP_SUMMARY")
    
    if github_step_summary:
        mode = "a" if append else "w"
        with open(github_step_summary, mode, encoding="utf-8") as f:
            f.write(markdown)
            f.write("\n")


def is_debug_enabled() -> bool:
    """
    Check if debug logging is enabled in GitHub Actions.
    
    Returns:
        True if RUNNER_DEBUG=1 or ACTIONS_STEP_DEBUG=true
    """
    return (
        os.getenv("RUNNER_DEBUG") == "1" or
        os.getenv("ACTIONS_STEP_DEBUG", "").lower() == "true"
    )


def get_artifact_upload_path() -> Path:
    """
    Get recommended path for artifacts to upload.
    
    Returns:
        Path to artifacts directory (creates if doesn't exist)
    """
    require_github_actions()
    
    context = get_github_context()
    artifact_dir = context.workspace / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    
    return artifact_dir


def setup_github_actions_env() -> Dict[str, str]:
    """
    Setup environment variables for GitHub Actions execution.
    
    Returns:
        Environment dictionary with GitHub Actions-specific settings
    """
    require_github_actions()
    
    env = os.environ.copy()
    
    # Force line buffering for real-time output
    env["PYTHONUNBUFFERED"] = "1"
    
    # Ensure UTF-8 encoding
    env.setdefault("PYTHONIOENCODING", "utf-8")
    
    # Add GitHub context
    context = get_github_context()
    env["REPO_ROOT"] = str(context.workspace)
    
    return env


def fail_job(message: str, exit_code: int = 1):
    """
    Fail the job with error message and exit.
    
    Args:
        message: Failure message
        exit_code: Exit code (default: 1)
    """
    require_github_actions()
    
    log_error(message)
    sys.exit(exit_code)


class GitHubGroup:
    """
    Context manager for GitHub Actions collapsible groups.
    
    Usage:
        with GitHubGroup("Building application"):
            # Build steps here
            pass
    """
    
    def __init__(self, title: str):
        self.title = title
    
    def __enter__(self):
        if is_github_actions():
            start_group(self.title)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if is_github_actions():
            end_group()
        return False
