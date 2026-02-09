#!/usr/bin/env python3
"""
Kubernetes deployment pipeline for local development.

Replaces:
- scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.ps1 (Windows)
- scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh (Unix)

Usage:
    python scripts/pipelines/deploy_k8s.py [--keep] [--prepull] [--cluster-name NAME] [--namespace NS]

Options:
    --keep        Preserve cluster on failure for debugging
    --prepull     Pre-pull infrastructure images (recommended for fresh machines, speeds up deployment)
    --cluster-name  Override kind cluster name (default: cs301-crm)
    --namespace   Kubernetes namespace (default: dev)
"""

import argparse
import sys
import subprocess
from pathlib import Path

# Add repo root to path
repo_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger


def check_dependencies(platform, logger):
    """
    Fail fast if required tools are missing or misconfigured.
    
    Checks:
    - docker, kubectl, kind, helm, make executables exist
    - Docker daemon is running
    - bash exists (Windows only, for make)
    """
    logger.info("Checking dependencies...")
    
    # Find required executables (fail fast if missing)
    docker = platform.find_executable("docker", required=True)
    kubectl = platform.find_executable("kubectl", required=True)
    kind = platform.find_executable("kind", required=True)
    helm = platform.find_executable("helm", required=True)
    make = platform.find_executable("make", required=True)
    
    # Windows: need bash for make recipes
    if is_windows():
        bash = platform.find_executable("bash", required=False)
        if not bash:
            logger.fail_fast(
                "Git Bash not found. Install Git for Windows so make recipes run correctly."
            )
    
    # Verify Docker daemon is running
    result = platform.run_command(
        ["docker", "info"],
        capture_output=True,
        check=False,
        timeout=10
    )
    if result.returncode != 0:
        logger.fail_fast(
            "Docker is not available or daemon is not running. "
            "Start Docker Desktop and retry."
        )
    
    logger.success("All dependencies available")


def get_kind_cluster_name(repo_root: Path) -> str:
    """
    Extract kind cluster name from platform/k8s/kind-cluster-config.yaml.
    
    Looks for: name: <cluster-name>
    Default: cs301-crm
    """
    config_file = repo_root / "platform" / "k8s" / "kind-cluster-config.yaml"
    if not config_file.exists():
        return "cs301-crm"
    
    import re
    content = config_file.read_text()
    match = re.search(r'^name:\s*(\S+)', content, re.MULTILINE)
    return match.group(1) if match else "cs301-crm"


def is_kind_cluster_reachable(cluster_name: str, platform) -> bool:
    """
    Check if kubectl can communicate with kind cluster.
    
    Returns:
        True if cluster is reachable, False otherwise
    """
    context_name = f"kind-{cluster_name}"
    result = platform.run_command(
        ["kubectl", "--context", context_name, "version", "--request-timeout=10s"],
        capture_output=True,
        check=False,
        timeout=15
    )
    return result.returncode == 0


def kind_cluster_exists(cluster_name: str, platform) -> bool:
    """Check if kind cluster exists."""
    result = platform.run_command(
        ["kind", "get", "clusters"],
        capture_output=True,
        check=False,
        timeout=10
    )
    if result.returncode != 0:
        return False
    
    clusters = result.stdout.strip().split('\n')
    return cluster_name in clusters


def initialize_kind_cluster(cluster_name: str, logger, platform, repo_root: Path):
    """
    Create/reuse/recreate kind cluster based on existence and reachability.
    
    Logic:
    - If doesn't exist: create it
    - If exists and reachable: reuse it
    - If exists but unreachable: delete and recreate
    """
    logger.info(f"Initializing kind cluster: {cluster_name}")
    
    if not kind_cluster_exists(cluster_name, platform):
        logger.info(f"Cluster '{cluster_name}' does not exist, creating...")
        run_make_target("kind-up", logger, platform, repo_root)
        return
    
    if is_kind_cluster_reachable(cluster_name, platform):
        logger.success(f"Cluster '{cluster_name}' exists and is reachable, reusing")
        return
    
    # Exists but unreachable - recreate
    logger.warning(f"Cluster '{cluster_name}' exists but is unreachable, recreating...")
    platform.run_command(
        ["kind", "delete", "cluster", "--name", cluster_name],
        capture_output=True,
        check=False,
        timeout=60
    )
    run_make_target("kind-up", logger, platform, repo_root)


def run_make_target(target: str, logger, platform, repo_root: Path):
    """
    Run make target with proper error handling.
    
    Args:
        target: Make target name (e.g., "kind-up", "deploy-dev")
        logger: Logger instance
        platform: Platform instance
        repo_root: Repository root path
    """
    logger.info(f"Running make target: {target}")
    
    # Build make command
    cmd = ["make", "-C", str(repo_root), "SHELL=bash", target]
    
    # Windows: ensure bash is used for make
    env = None
    if is_windows():
        bash = platform.find_executable("bash", required=False)
        if bash:
            env = {"SHELL": str(bash)}
    
    result = platform.run_command(
        cmd,
        cwd=repo_root,
        env=env,
        capture_output=False,  # Stream output to console
        check=False,
        timeout=1800  # 30 minutes max per target
    )
    
    if result.returncode != 0:
        raise RuntimeError(f"Make target '{target}' failed with exit code {result.returncode}")
    
    logger.success(f"Make target '{target}' completed")


def show_failure_diagnostics(cluster_name: str, namespace: str, logger, platform):
    """
    Display diagnostic information for failed deployments.
    
    Shows:
    - Pod status
    - Services and Ingress
    - Recent events
    - Failing pod descriptions and logs
    - Debug commands
    """
    logger.section("FAILURE DIAGNOSTICS")
    logger.info("Cluster preserved for debugging. Use commands below to investigate:")
    
    context_name = f"kind-{cluster_name}"
    
    # Pod status
    logger.info(f"\nPod status:")
    result = platform.run_command(
        ["kubectl", "--context", context_name, "get", "pods", "-n", namespace, "-o", "wide"],
        capture_output=True,
        check=False
    )
    if result.stdout:
        print(result.stdout)
    
    # Services and Ingress
    logger.info(f"\nServices and Ingress:")
    result = platform.run_command(
        ["kubectl", "--context", context_name, "get", "svc,ingress", "-n", namespace],
        capture_output=True,
        check=False
    )
    if result.stdout:
        print(result.stdout)
    
    # Events
    logger.info(f"\nRecent events (last 200):")
    result = platform.run_command(
        ["kubectl", "--context", context_name, "get", "events", "-n", namespace,
         "--sort-by=.metadata.creationTimestamp"],
        capture_output=True,
        check=False
    )
    if result.stdout:
        lines = result.stdout.strip().split('\n')
        for line in lines[-200:]:
            print(line)
    
    # Failing pods
    logger.info(f"\nDescribing failing pods:")
    result = platform.run_command(
        ["kubectl", "--context", context_name, "get", "pods", "-n", namespace, "-o", "json"],
        capture_output=True,
        check=False
    )
    if result.returncode == 0 and result.stdout:
        import json
        try:
            pods_data = json.loads(result.stdout)
            for pod in pods_data.get("items", []):
                phase = pod.get("status", {}).get("phase", "")
                if phase not in ["Running", "Succeeded"]:
                    pod_name = pod.get("metadata", {}).get("name", "")
                    if pod_name:
                        logger.info(f"\nkubectl describe pod {pod_name} -n {namespace}")
                        platform.run_command(
                            ["kubectl", "--context", context_name, "describe", "pod", pod_name, "-n", namespace],
                            capture_output=False,
                            check=False
                        )
                        
                        logger.info(f"\nkubectl logs {pod_name} -n {namespace} --tail=100 --all-containers=true")
                        platform.run_command(
                            ["kubectl", "--context", context_name, "logs", pod_name, "-n", namespace,
                             "--tail=100", "--all-containers=true"],
                            capture_output=False,
                            check=False
                        )
        except json.JSONDecodeError:
            pass
    
    # Debug commands
    logger.section("DEBUG COMMANDS")
    logger.info(f"kubectl get pods -n {namespace} -o wide")
    logger.info(f"kubectl get events -n {namespace} --sort-by=.metadata.creationTimestamp | tail -200")
    logger.info(f"kubectl describe pod <pod-name> -n {namespace}")
    logger.info(f"kubectl logs <pod-name> -n {namespace} --tail=100 --all-containers=true")
    logger.info(f"helm list -n {namespace}")
    logger.info(f"kubectl get ingress -n {namespace}")
    logger.info(f"\nTo iterate on fixes:")
    logger.info(f"  1. Fix issue in code/manifests")
    logger.info(f"  2. Rebuild: make build-images && make kind-load")
    logger.info(f"  3. Redeploy: make deploy-dev")
    logger.info(f"  4. Rerun smoke: make smoke")
    logger.info(f"\nTo cleanup when done:")
    logger.info(f"  kind delete cluster --name {cluster_name}")


def cleanup_cluster(cluster_name: str, namespace: str, logger, platform):
    """
    Teardown Kubernetes resources and delete kind cluster.
    
    Best-effort cleanup (ignores errors).
    """
    logger.info(f"Tearing down k8s resources and kind cluster '{cluster_name}'")
    
    context_name = f"kind-{cluster_name}"
    
    # Delete application resources
    platform.run_command(
        ["kubectl", "--context", context_name, "delete", "-k",
         "platform/k8s/apps/overlays/dev", "--ignore-not-found"],
        capture_output=True,
        check=False,
        timeout=120
    )
    
    # Uninstall Helm releases
    for release, ns in [("postgres", namespace), ("ingress-nginx", "ingress-nginx"),
                        ("metrics-server", "kube-system")]:
        platform.run_command(
            ["helm", "uninstall", release, "-n", ns],
            capture_output=True,
            check=False,
            timeout=60
        )
    
    # Delete kind cluster
    result = platform.run_command(
        ["kind", "delete", "cluster", "--name", cluster_name],
        capture_output=True,
        check=False,
        timeout=120
    )
    
    if result.returncode != 0:
        raise RuntimeError(f"Failed to delete kind cluster '{cluster_name}'")
    
    logger.success(f"Teardown complete: kind cluster '{cluster_name}' deleted")


def generate_summary_report(repo_root: Path, logger):
    """
    Generate HTML summary report using existing Python script.
    
    Calls: scripts/build-and-deploy-k8s/generate-k8s-deploy-summary.py
    """
    summary_script = repo_root / "scripts" / "build-and-deploy-k8s" / "generate-k8s-deploy-summary.py"
    
    if not summary_script.exists():
        logger.warning(f"Summary script not found: {summary_script}")
        return
    
    logger.info("Generating k8s deployment summary report...")
    result = subprocess.run(
        [sys.executable, str(summary_script)],
        capture_output=True,
        check=False,
        timeout=30
    )
    
    if result.returncode == 0:
        logger.success("Summary report generated")
    else:
        logger.warning("Summary report generation failed")


def main():
    """Main pipeline orchestration."""
    parser = argparse.ArgumentParser(
        description="Build and deploy to local kind cluster"
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Preserve cluster on failure for debugging"
    )
    parser.add_argument(
        "--cluster-name",
        default=None,
        help="Override kind cluster name (default: from config)"
    )
    parser.add_argument(
        "--namespace",
        default="dev",
        help="Kubernetes namespace (default: dev)"
    )
    parser.add_argument(
        "--no-prepull",
        action="store_true",
        help="Skip pre-pull (not recommended for fresh machines, may cause timeouts)"
    )
    args = parser.parse_args()
    
    # Setup platform
    platform = get_platform()
    repo_root = platform.get_repo_root()
    
    # Windows UTF-8 setup
    if is_windows():
        from scripts.platform.windows import setup_windows_encoding
        setup_windows_encoding()
    
    # Create logger with HTML report
    logger = create_logger(
        name="K8s Deployment Pipeline",
        log_dir=repo_root / "build-logs" / "build-and-deploy-k8s"
    )
    
    try:
        # Get cluster name
        cluster_name = args.cluster_name or get_kind_cluster_name(repo_root)
        namespace = args.namespace
        
        if args.keep:
            logger.info("Keep mode enabled: cluster will be preserved on success or failure")
        
        # Fail-fast dependency checks
        with logger.group("Dependency Checks"):
            check_dependencies(platform, logger)
        
        # K8s validation
        with logger.timer("K8s Validation"):
            run_make_target("k8s-validate", logger, platform, repo_root)
        
        # Initialize kind cluster
        with logger.timer("Kind Cluster Initialization"):
            initialize_kind_cluster(cluster_name, logger, platform, repo_root)
        
        # Switch kubectl context
        context_name = f"kind-{cluster_name}"
        result = platform.run_command(
            ["kubectl", "config", "use-context", context_name],
            capture_output=True,
            check=False
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to switch kubectl context to '{context_name}'")

        # Pre-pull infrastructure images by default (speeds up Helm deployments)
        if not args.no_prepull:
            logger.info("Pre-pulling infrastructure images (use --no-prepull to skip)")
            logger.info("This may take 5-10 minutes on first run with fresh images")
            try:
                with logger.timer("Pre-pull Infrastructure Images"):
                    run_make_target("prepull-infra-images", logger, platform, repo_root)
            except RuntimeError as e:
                logger.error(f"Pre-pull failed: {e}")
                logger.error("Deployment cannot continue without cached images")
                if not args.keep:
                    cleanup_cluster(cluster_name, logger, platform)
                return 1
        else:
            logger.warning("Skipping pre-pull (--no-prepull specified)")
            logger.warning("Helm will pull images during deployment - may timeout on fresh machines")

        # Run deployment targets
        targets = ["infra-up", "build-images", "kind-load", "deploy-dev", "smoke"]
        for target in targets:
            with logger.timer(f"Make {target}"):
                run_make_target(target, logger, platform, repo_root)
        
        # Success path
        generate_summary_report(repo_root, logger)
        
        if args.keep:
            logger.success("Keep mode: cluster preserved. Teardown skipped.")
            logger.info(f"To cleanup when done: kind delete cluster --name {cluster_name}")
        else:
            with logger.timer("Cluster Teardown"):
                cleanup_cluster(cluster_name, namespace, logger, platform)
        
        logger.success("Local Kubernetes build/deploy and smoke checks completed successfully")
        return 0
    
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        
        # Generate report on failure
        try:
            generate_summary_report(repo_root, logger)
        except Exception as report_err:
            logger.warning(f"Failed to generate summary report: {report_err}")
        
        # Show diagnostics
        try:
            cluster_name = args.cluster_name or get_kind_cluster_name(repo_root)
            show_failure_diagnostics(cluster_name, args.namespace, logger, platform)
        except Exception as diag_err:
            logger.warning(f"Failed to show diagnostics: {diag_err}")
        
        return 1


if __name__ == "__main__":
    sys.exit(main())
