#!/usr/bin/env python3
"""
kind-up.py: Initialize kind cluster with retry logic

Cross-platform Python replacement for kind-up.sh
"""

import os
import sys
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.utils import (
    create_logger,
    create_executable_finder,
    create_command_runner,
    get_repo_root
)


class KindClusterManager:
    """Manages kind cluster creation and validation."""

    def __init__(self):
        self.logger = create_logger("kind-up")
        self.finder = create_executable_finder()
        self.runner = create_command_runner(self.logger)
        self.repo_root = get_repo_root()

        # Get cluster name from environment or use default
        self.cluster_name = os.environ.get("KIND_CLUSTER_NAME", "cs301-crm")

        # Find required tools
        try:
            self.kubectl = self.finder.require("kubectl")
            self.kind = self.finder.require("kind")
        except FileNotFoundError as e:
            self.logger.error(str(e))
            sys.exit(1)

    def cluster_exists(self) -> bool:
        """Check if the kind cluster already exists and is accessible."""
        context = f"kind-{self.cluster_name}"

        try:
            self.runner.run(
                [self.kubectl, "cluster-info", "--context", context],
                capture_output=True,
                check=True
            )
            return True
        except Exception:
            return False

    def delete_cluster(self):
        """Delete the kind cluster (used before retry)."""
        try:
            self.runner.run(
                [self.kind, "delete", "cluster", "--name", self.cluster_name],
                capture_output=True,
                check=False
            )
        except Exception:
            pass  # Ignore errors during cleanup

    def create_cluster(self) -> bool:
        """
        Create kind cluster with retry logic.

        Returns:
            True if successful, False otherwise
        """
        kind_config = self.repo_root / "platform" / "k8s" / "infra" / "kind-config.yaml"

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            self.logger.info(f"Attempt {attempt}/{max_attempts}: Creating kind cluster {self.cluster_name}...")

            try:
                self.runner.run(
                    [self.kind, "create", "cluster",
                     "--name", self.cluster_name,
                     "--config", str(kind_config)],
                    check=True
                )
                self.logger.success("Cluster created successfully")
                return True

            except Exception as e:
                if attempt < max_attempts:
                    self.logger.warning(f"Kind cluster creation failed, retrying in 5s...")
                    time.sleep(5)
                    self.delete_cluster()
                else:
                    self.logger.error(f"Kind cluster creation failed after {max_attempts} attempts")
                    return False

        return False

    def wait_for_cluster_ready(self) -> bool:
        """
        Wait for all cluster nodes to be ready.

        Returns:
            True if successful, False otherwise
        """
        self.logger.info("Waiting for cluster to be ready...")

        try:
            self.runner.run(
                [self.kubectl, "wait",
                 "--for=condition=Ready",
                 "nodes", "--all",
                 "--timeout=180s"],
                check=True
            )
            return True
        except Exception:
            self.logger.error("Cluster nodes did not become ready in time")
            return False

    def show_cluster_info(self):
        """Display cluster information."""
        self.logger.info("Cluster is ready:")
        try:
            self.runner.run(
                [self.kubectl, "cluster-info"],
                check=True
            )
        except Exception:
            pass  # Non-fatal

    def run(self) -> int:
        """
        Main execution flow.

        Returns:
            0 if successful, 1 if failed
        """
        # Check if cluster already exists
        if self.cluster_exists():
            self.logger.info(f"Cluster '{self.cluster_name}' already exists and is accessible")
            return 0

        # Create cluster with retry logic
        if not self.create_cluster():
            return 1

        # Wait for cluster to be ready
        if not self.wait_for_cluster_ready():
            return 1

        # Show cluster info
        self.show_cluster_info()

        self.logger.success(f"Kind cluster '{self.cluster_name}' is up and ready")
        return 0


def main() -> int:
    """Main entry point."""
    manager = KindClusterManager()
    return manager.run()


if __name__ == "__main__":
    sys.exit(main())
