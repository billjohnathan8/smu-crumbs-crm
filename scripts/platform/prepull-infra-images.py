#!/usr/bin/env python3
"""
prepull-infra-images.py: Pre-pull infrastructure images to speed up Helm deployments

This script pre-pulls Docker images and loads them into the kind cluster.
It's best-effort: if image pulls fail, we continue anyway (Helm will pull them later).

Cross-platform Python replacement for prepull-infra-images.sh
"""

import os
import sys
from pathlib import Path
from typing import List

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.utils import (
    create_logger,
    create_executable_finder,
    create_command_runner
)


class ImagePrePuller:
    """Pre-pulls and loads Docker images into kind cluster."""

    def __init__(self):
        self.logger = create_logger("prepull")
        self.finder = create_executable_finder()
        self.runner = create_command_runner(self.logger)

        # Get cluster name from environment or use default
        self.cluster_name = os.environ.get("KIND_CLUSTER_NAME", "cs301-crm")

        # Find required tools (best effort - may not be available)
        try:
            self.docker = self.finder.find("docker")
            self.kind = self.finder.find("kind")
        except Exception:
            self.docker = None
            self.kind = None

        # Define images used by Helm charts
        # These versions should match what the Helm charts will actually deploy
        self.images = [
            # ingress-nginx controller (largest image, ~800MB-1GB)
            "registry.k8s.io/ingress-nginx/controller:v1.14.3",
            "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v20250202-stable-patch1",
            # bitnami metrics-server
            "docker.io/bitnami/metrics-server:0.7.2-debian-12-r7",
            # bitnami postgresql
            "docker.io/bitnami/postgresql:17.2.0-debian-12-r10",
        ]

        # Track statistics
        self.pulled_count = 0
        self.failed_count = 0
        self.loaded_count = 0

    def pull_image(self, image: str) -> bool:
        """
        Pull a Docker image.

        Args:
            image: Docker image name with tag

        Returns:
            True if successful, False otherwise
        """
        if not self.docker:
            return False

        self.logger.info(f"Pulling: {image}")

        try:
            self.runner.run(
                [self.docker, "pull", image],
                check=True,
                capture_output=True
            )
            self.logger.success("Pulled successfully")
            return True
        except Exception:
            self.logger.warning("Failed to pull (will be pulled by Helm later)")
            return False

    def image_exists(self, image: str) -> bool:
        """
        Check if a Docker image exists locally.

        Args:
            image: Docker image name with tag

        Returns:
            True if exists, False otherwise
        """
        if not self.docker:
            return False

        try:
            self.runner.run(
                [self.docker, "image", "inspect", image],
                check=True,
                capture_output=True
            )
            return True
        except Exception:
            return False

    def load_image_to_kind(self, image: str) -> bool:
        """
        Load a Docker image into kind cluster.

        Args:
            image: Docker image name with tag

        Returns:
            True if successful, False otherwise
        """
        if not self.kind:
            return False

        self.logger.info(f"Loading: {image}")

        try:
            self.runner.run(
                [self.kind, "load", "docker-image", image,
                 "--name", self.cluster_name],
                check=True,
                capture_output=True
            )
            self.logger.success("Loaded into kind cluster")
            return True
        except Exception:
            self.logger.warning("Failed to load (will be pulled by Helm later)")
            return False

    def run(self) -> int:
        """
        Main execution flow.

        Always returns 0 (best-effort, never fails the pipeline).
        """
        # Check if required tools are available
        if not self.docker:
            self.logger.warning("Docker not found - skipping image pre-pull")
            return 0

        if not self.kind:
            self.logger.warning("Kind not found - skipping image loading")
            # Continue anyway - we can still pull images

        total_count = len(self.images)

        self.logger.info("Pre-pulling infrastructure images (best-effort)...")
        self.logger.info(f"This speeds up Helm deployments by caching large images (~1-2 GB total)")

        # Pull images with Docker
        self.logger.info(f"Pulling {total_count} images with Docker...")

        for image in self.images:
            if self.pull_image(image):
                self.pulled_count += 1
            else:
                self.failed_count += 1

        # Load successfully pulled images into kind cluster
        if self.kind:
            self.logger.info(f"Loading pulled images into kind cluster '{self.cluster_name}'...")

            for image in self.images:
                if self.image_exists(image):
                    if self.load_image_to_kind(image):
                        self.loaded_count += 1

        # Print summary
        self.logger.info("=" * 44)
        self.logger.info("Pre-pull Summary:")
        self.logger.info(f"  Total images:   {total_count}")
        self.logger.info(f"  Pulled:         {self.pulled_count}")
        self.logger.info(f"  Loaded to kind: {self.loaded_count}")
        self.logger.info(f"  Failed:         {self.failed_count}")
        self.logger.info("=" * 44)

        if self.loaded_count > 0:
            self.logger.success(f"Successfully pre-loaded {self.loaded_count} image(s)")
            self.logger.info("This should significantly speed up Helm deployments!")
        else:
            self.logger.warning("No images were pre-loaded")
            self.logger.info("Helm will pull images during deployment (may be slower)")

        # Always exit 0 (best-effort, never fail the pipeline)
        return 0


def main() -> int:
    """Main entry point."""
    prepuller = ImagePrePuller()
    return prepuller.run()


if __name__ == "__main__":
    sys.exit(main())
