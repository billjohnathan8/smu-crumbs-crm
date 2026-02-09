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

    def __init__(self, fail_fast: bool = True, image_timeout: int = 900, verbose: bool = False):
        """
        Initialize image pre-puller.

        Args:
            fail_fast: If True, exit 1 on errors (default). If False, best-effort mode.
            image_timeout: Timeout per image in seconds (default 900 = 15 minutes)
            verbose: If True, show detailed Docker command output and image info
        """
        self.logger = create_logger("prepull")
        self.finder = create_executable_finder()
        self.runner = create_command_runner(self.logger)

        self.fail_fast = fail_fast
        self.image_timeout = image_timeout
        self.verbose = verbose

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
            # metrics-server (using official k8s registry, not bitnami image)
            "registry.k8s.io/metrics-server/metrics-server:v0.8.0",
            # bitnami postgresql
            "docker.io/bitnami/postgresql:17.2.0-debian-12-r10",
        ]

        # Track statistics
        self.pulled_count = 0
        self.failed_count = 0
        self.loaded_count = 0

    def pull_image(self, image: str) -> bool:
        """
        Pull a Docker image with progress output and verification.

        Args:
            image: Docker image name with tag

        Returns:
            True if successful, False otherwise
        """
        if not self.docker:
            if self.fail_fast:
                self.logger.error("Docker not available")
            return False

        self.logger.info(f"Pulling: {image} (timeout: {self.image_timeout}s)")

        try:
            # Show progress output (capture_output=False)
            self.runner.run(
                [self.docker, "pull", image],
                check=True,
                capture_output=False,
                timeout=self.image_timeout
            )

            # Verify image was actually pulled
            if not self.verify_image_pulled(image):
                self.logger.error(f"Image not found after pull: {image}")
                return False

            self.logger.success("Pulled and verified successfully")

            # Show image details in verbose mode
            if self.verbose:
                self.show_image_details(image)

            return True

        except Exception as e:
            error_msg = str(e)
            if "timeout" in error_msg.lower():
                self.logger.error(f"Timeout after {self.image_timeout}s")
            else:
                self.logger.error(f"Failed to pull: {error_msg}")

            if not self.fail_fast:
                self.logger.warning("(will be pulled by Helm later)")
            return False

    def verify_image_pulled(self, image: str) -> bool:
        """
        Verify image exists locally using docker image inspect.

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
                capture_output=True,
                timeout=10
            )
            return True
        except Exception:
            return False

    def show_image_details(self, image: str) -> None:
        """
        Show detailed image information in verbose mode.

        Args:
            image: Docker image name with tag
        """
        if not self.docker or not self.verbose:
            return

        try:
            # Get image size and creation date
            result = self.runner.run(
                [self.docker, "image", "inspect", image,
                 "--format", "{{.Size}} {{.Created}}"],
                check=True,
                capture_output=True,
                timeout=10
            )

            if result.stdout:
                output = result.stdout.strip()
                parts = output.split()
                if len(parts) >= 2:
                    size_bytes = int(parts[0])
                    size_mb = size_bytes / (1024 * 1024)
                    created = parts[1]
                    self.logger.info(f"  Size: {size_mb:.1f} MB | Created: {created[:10]}")
        except Exception:
            pass  # Best effort in verbose mode

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
        Main execution flow with fail-fast or best-effort mode.

        Returns:
            0 on success, 1 on failure (in fail-fast mode)
        """
        # FAIL-FAST MODE: Docker REQUIRED
        if self.fail_fast and not self.docker:
            self.logger.error("Docker not found - pre-pull cannot continue")
            self.logger.error("Fix: Install Docker Desktop and ensure daemon is running")
            return 1

        # FAIL-FAST MODE: Kind REQUIRED
        if self.fail_fast and not self.kind:
            self.logger.error("Kind not found - pre-pull cannot continue")
            self.logger.error("Fix: Install kind or run in best-effort mode (--best-effort)")
            return 1

        # BEST-EFFORT MODE: Skip gracefully if tools unavailable
        if not self.fail_fast:
            if not self.docker:
                self.logger.warning("Docker not found - skipping image pre-pull")
                return 0
            if not self.kind:
                self.logger.warning("Kind not found - will skip image loading")
                # Continue anyway - we can still pull images

        total_count = len(self.images)

        self.logger.info("=" * 60)
        self.logger.info("Pre-pulling infrastructure images...")
        self.logger.info(f"Total: ~1-2 GB | Images: {total_count}")
        self.logger.info(f"Mode: {'FAIL-FAST' if self.fail_fast else 'BEST-EFFORT'}")
        if self.verbose:
            self.logger.info("Verbose: ENABLED (detailed output)")
        self.logger.info("This may take 5-10 minutes on first run with fresh images")
        self.logger.info("=" * 60)

        if self.verbose:
            self.logger.info("")
            self.logger.info("Images to pull:")
            for idx, image in enumerate(self.images, 1):
                self.logger.info(f"  {idx}. {image}")

        # Pull images with Docker
        self.logger.info(f"Pulling {total_count} images...")

        for idx, image in enumerate(self.images, 1):
            self.logger.info(f"[{idx}/{total_count}] {image}")

            if self.pull_image(image):
                self.pulled_count += 1
            else:
                self.failed_count += 1
                if self.fail_fast:
                    self.logger.error(f"Pre-pull failed on image {idx}/{total_count}")
                    return 1

        # Load successfully pulled images into kind cluster
        if self.kind:
            self.logger.info("")
            self.logger.info(f"Loading images into kind cluster '{self.cluster_name}'...")

            for image in self.images:
                if self.image_exists(image):
                    if self.load_image_to_kind(image):
                        self.loaded_count += 1
                    elif self.fail_fast:
                        self.logger.error(f"Failed to load {image} into kind")
                        return 1

        # Print summary
        self.logger.info("")
        self.logger.info("=" * 60)
        self.logger.info("Pre-pull Summary:")
        self.logger.info(f"  Total images:   {total_count}")
        self.logger.info(f"  Pulled:         {self.pulled_count}")
        self.logger.info(f"  Loaded to kind: {self.loaded_count}")
        self.logger.info(f"  Failed:         {self.failed_count}")
        self.logger.info("=" * 60)

        # FAIL-FAST: Require all images loaded successfully
        if self.fail_fast:
            if self.loaded_count < total_count:
                self.logger.error(f"Incomplete: {self.loaded_count}/{total_count} loaded")
                return 1
            self.logger.success(f"All {total_count} images loaded successfully!")
            return 0

        # BEST-EFFORT: Always succeed
        if self.loaded_count > 0:
            self.logger.success(f"Successfully pre-loaded {self.loaded_count} image(s)")
            self.logger.info("This should significantly speed up Helm deployments!")
        else:
            self.logger.warning("No images were pre-loaded")
            self.logger.info("Helm will pull images during deployment (may be slower)")

        return 0


def main() -> int:
    """Main entry point with CLI argument parsing."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Pre-pull infrastructure images to speed up Helm deployments"
    )
    parser.add_argument(
        "--best-effort",
        action="store_true",
        help="Never fail (always exit 0, old behavior). Default is fail-fast mode."
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=900,
        help="Timeout per image in seconds (default: 900 = 15 minutes)"
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed image information and Docker command output"
    )

    args = parser.parse_args()

    prepuller = ImagePrePuller(
        fail_fast=not args.best_effort,
        image_timeout=args.timeout,
        verbose=args.verbose
    )
    return prepuller.run()


if __name__ == "__main__":
    sys.exit(main())
