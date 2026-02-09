#!/usr/bin/env python3
"""
infra-up.py: Deploy infrastructure components with retry logic

Deploys:
- ingress-nginx (Ingress controller)
- metrics-server (Metrics collection)
- postgresql (Database)

Cross-platform Python replacement for infra-up.sh
"""

import sys
import time
from pathlib import Path
from typing import List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.utils import (
    create_logger,
    create_platform_info,
    create_executable_finder,
    create_command_runner,
    get_repo_root
)


class InfraDeployer:
    """Deploys Kubernetes infrastructure components using Helm."""

    def __init__(self):
        self.logger = create_logger("infra-up")
        self.platform_info = create_platform_info()
        self.finder = create_executable_finder()
        self.runner = create_command_runner(self.logger)
        self.repo_root = get_repo_root()

        # Find required tools
        try:
            self.kubectl = self.finder.require("kubectl")
            self.helm = self.finder.require("helm")
        except FileNotFoundError as e:
            self.logger.error(str(e))
            sys.exit(1)

    def add_helm_repos(self) -> bool:
        """Add required Helm repositories."""
        self.logger.info("Adding helm repositories...")

        repos = [
            ("ingress-nginx", "https://kubernetes.github.io/ingress-nginx"),
            ("bitnami", "https://charts.bitnami.com/bitnami"),
        ]

        for name, url in repos:
            try:
                # Ignore errors if repo already exists
                self.runner.run(
                    [self.helm, "repo", "add", name, url],
                    check=False,
                    capture_output=True
                )
            except Exception:
                pass  # Best effort

        return True

    def update_helm_repos(self) -> bool:
        """Update Helm repositories with retry logic."""
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            self.logger.info(f"Attempt {attempt}/{max_attempts}: Updating helm repos...")

            try:
                self.runner.run(
                    [self.helm, "repo", "update"],
                    check=True
                )
                self.logger.success("Helm repos updated successfully")
                return True
            except Exception:
                if attempt < max_attempts:
                    self.logger.warning("Helm repo update failed, retrying in 3s...")
                    time.sleep(3)
                else:
                    self.logger.error(f"Helm repo update failed after {max_attempts} attempts")
                    return False

        return False

    def deploy_chart(
        self,
        release_name: str,
        chart: str,
        namespace: str,
        values_file: str = None,
        timeout: str = "7m",
        max_attempts: int = 2
    ) -> bool:
        """
        Deploy a Helm chart with retry logic.

        Args:
            release_name: Helm release name
            chart: Chart reference (e.g., "bitnami/postgresql")
            namespace: Kubernetes namespace
            values_file: Optional values file path (relative to repo root)
            timeout: Helm timeout (e.g., "7m")
            max_attempts: Number of retry attempts

        Returns:
            True if successful, False otherwise
        """
        self.logger.info(f"Deploying {release_name}...")

        for attempt in range(1, max_attempts + 1):
            self.logger.info(f"Attempt {attempt}/{max_attempts}: Installing {release_name}...")

            # Build command
            cmd = [
                self.helm, "upgrade", "--install",
                release_name, chart,
                "--namespace", namespace,
                "--create-namespace",
                "--timeout", timeout,
                "--wait"
            ]

            # Add values file if specified
            if values_file:
                values_path = self.repo_root / values_file

                # Convert to native path for Windows executables in WSL
                if self.platform_info.is_wsl and self.helm.endswith(".exe"):
                    values_path_str = self.platform_info.to_native_path(values_path)
                else:
                    values_path_str = str(values_path)

                cmd.extend(["-f", values_path_str])

            # Execute deployment
            try:
                self.runner.run(cmd, check=True)
                self.logger.success(f"{release_name} deployed successfully")
                return True
            except Exception as e:
                if attempt < max_attempts:
                    self.logger.warning(f"{release_name} deployment failed, retrying in 5s...")
                    if "timeout" in str(e).lower() or "image" in str(e).lower():
                        self.logger.info("(This may be due to slow image pull on first deployment)")
                    time.sleep(5)
                else:
                    self.logger.error(f"{release_name} deployment failed after {max_attempts} attempts")
                    return False

        return False

    def wait_for_pods(self, namespace: str, label: str, timeout: str = "180s") -> bool:
        """
        Wait for pods to be ready.

        Args:
            namespace: Kubernetes namespace
            label: Label selector (e.g., "app.kubernetes.io/component=controller")
            timeout: Wait timeout

        Returns:
            True if successful, False otherwise
        """
        self.logger.info(f"Waiting for pods with label '{label}' to be ready...")

        try:
            self.runner.run(
                [self.kubectl, "wait",
                 "--namespace", namespace,
                 "--for=condition=ready", "pod",
                 "-l", label,
                 f"--timeout={timeout}"],
                check=True
            )
            return True
        except Exception:
            self.logger.error(f"Pods did not become ready in time")
            return False

    def run(self) -> int:
        """
        Main execution flow.

        Returns:
            0 if successful, 1 if failed
        """
        # Add Helm repositories
        if not self.add_helm_repos():
            return 1

        # Update Helm repositories
        if not self.update_helm_repos():
            return 1

        # Deploy ingress-nginx
        # Note: ingress-nginx image is ~800MB-1GB; first pull can exceed 5m on slower networks
        if not self.deploy_chart(
            release_name="ingress-nginx",
            chart="ingress-nginx/ingress-nginx",
            namespace="ingress-nginx",
            values_file=None,
            timeout="10m",  # Extended timeout for large image
            max_attempts=2
        ):
            return 1

        # Deploy metrics-server
        if not self.deploy_chart(
            release_name="metrics-server",
            chart="bitnami/metrics-server",
            namespace="kube-system",
            values_file="platform/k8s/infra/helm-values/metrics-server-values.yaml",
            timeout="7m",
            max_attempts=2
        ):
            return 1

        # Deploy PostgreSQL
        if not self.deploy_chart(
            release_name="postgres",
            chart="bitnami/postgresql",
            namespace="dev",
            values_file="platform/k8s/infra/helm-values/postgresql-values.yaml",
            timeout="7m",
            max_attempts=2
        ):
            return 1

        # Wait for ingress-nginx controller to be ready
        if not self.wait_for_pods(
            namespace="ingress-nginx",
            label="app.kubernetes.io/component=controller"
        ):
            return 1

        # Wait for PostgreSQL to be ready
        if not self.wait_for_pods(
            namespace="dev",
            label="app.kubernetes.io/name=postgresql"
        ):
            return 1

        self.logger.success("Infrastructure deployment completed successfully")
        return 0


def main() -> int:
    """Main entry point."""
    deployer = InfraDeployer()
    return deployer.run()


if __name__ == "__main__":
    sys.exit(main())
