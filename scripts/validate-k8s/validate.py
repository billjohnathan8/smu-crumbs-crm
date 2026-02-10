#!/usr/bin/env python3
"""
Minimal Kubernetes manifest validation for local/dev checks.
"""
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str]) -> int:
    result = subprocess.run(cmd, check=False)
    return result.returncode


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    overlay = repo_root / "platform" / "k8s" / "apps" / "overlays" / "dev"

    kubectl = shutil.which("kubectl")
    if not kubectl:
        print("[validate] kubectl not found on PATH")
        return 1

    print(f"[validate] Rendering kustomize overlay: {overlay}")
    render = subprocess.run([kubectl, "kustomize", str(overlay)], capture_output=True, text=True)
    if render.returncode != 0:
        print(render.stdout)
        print(render.stderr, file=sys.stderr)
        return render.returncode

    kubeconform = shutil.which("kubeconform")
    if not kubeconform:
        print("[validate] kubeconform not found; skipping schema checks")
        return 0

    print("[validate] Validating with kubeconform")
    validate = subprocess.run(
        [kubeconform, "-strict", "-summary"],
        input=render.stdout,
        text=True,
        check=False,
    )
    return validate.returncode


if __name__ == "__main__":
    sys.exit(main())
#!/usr/bin/env python3
"""
validate.py: Kubernetes manifest validation script

This script validates Kubernetes manifests by:
1. Checking required tools (helm, kubectl, kubeconform)
2. Validating kind config YAML
3. Rendering Helm charts and validating with kubeconform
4. Rendering Kustomize overlays and validating with kubeconform

Cross-platform compatible (Windows, WSL, Linux, macOS).
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.utils import (
    create_logger,
    create_platform_info,
    create_executable_finder,
    create_command_runner,
    get_repo_root,
    validate_yaml
)


class K8sValidator:
    """Kubernetes manifest validator."""

    def __init__(self):
        self.logger = create_logger("k8s-validate")
        self.platform_info = create_platform_info()
        self.repo_root = get_repo_root()
        self.finder = create_executable_finder(self.repo_root)
        self.runner = create_command_runner(self.logger)

        # Create temporary directory for rendered manifests
        self.tmpdir = Path(tempfile.mkdtemp(prefix="k8s-validate-"))
        self.validated_files: List[Path] = []

        # Find required tools
        self.helm = None
        self.kubectl = None
        self.kubeconform = None

    def cleanup(self):
        """Clean up temporary directory."""
        if self.tmpdir.exists():
            shutil.rmtree(self.tmpdir)
            self.logger.info(f"Cleaned up temp dir: {self.tmpdir}")

    def check_required_tools(self) -> bool:
        """
        Check for required tools: helm, kubectl, kubeconform.

        Returns:
            True if all tools found, False otherwise
        """
        self.logger.info("Checking required tools...")

        missing = []
        required_tools = ["helm", "kubectl", "kubeconform"]

        for tool in required_tools:
            exe = self.finder.find(tool)
            if exe:
                self.logger.info(f"Found: {tool} -> {exe}")
                # Store the executable path
                if tool == "helm":
                    self.helm = exe
                elif tool == "kubectl":
                    self.kubectl = exe
                elif tool == "kubeconform":
                    self.kubeconform = exe
            else:
                missing.append(tool)

        if missing:
            self.logger.error(f"Missing required tool(s): {', '.join(missing)}")
            self.logger.error("")
            self.logger.error("Install hints:")
            self.logger.error("  helm         -> https://helm.sh/docs/intro/install/")
            self.logger.error("  kubectl      -> https://kubernetes.io/docs/tasks/tools/")
            self.logger.error("  kubeconform  -> https://github.com/yannh/kubeconform#installation")
            return False

        self.logger.success("All required tools found.")
        return True

    def validate_kind_config(self) -> bool:
        """
        Validate kind config YAML file.

        Returns:
            True if valid or not found, False if invalid
        """
        kind_config = self.repo_root / "platform" / "k8s" / "infra" / "kind-config.yaml"

        self.logger.info("Validating kind config YAML...")

        if not kind_config.exists():
            self.logger.warning(f"kind-config.yaml not found at {kind_config}; skipping.")
            return True

        # Try to validate YAML
        if validate_yaml(kind_config):
            self.logger.success("kind-config.yaml parsed successfully.")
            return True
        else:
            self.logger.error(f"kind-config.yaml is not valid YAML: {kind_config}")
            return False

    def ensure_helm_repos(self) -> bool:
        """
        Ensure required Helm repositories are added.

        Returns:
            True if successful, False otherwise
        """
        self.logger.info("Ensuring Helm repos are added...")

        repos = [
            ("ingress-nginx", "https://kubernetes.github.io/ingress-nginx"),
            ("bitnami", "https://charts.bitnami.com/bitnami"),
            ("prometheus-community", "https://prometheus-community.github.io/helm-charts"),
            ("kubeview", "https://benc-uk.github.io/kubeview/deploy/helm"),
        ]

        for name, url in repos:
            try:
                # Try to add repo (ignore if already exists)
                self.runner.run(
                    [self.helm, "repo", "add", name, url],
                    check=False,
                    capture_output=True
                )
                self.logger.info(f"Added Helm repo: {name}")
            except Exception as e:
                self.logger.warning(f"Could not add Helm repo {name}: {e}")

        # Update only required repos to avoid failures from unrelated repos
        update_failed = False
        for name, _url in repos:
            try:
                self.logger.info(f"Updating Helm repo: {name}...")
                self.runner.run(
                    [self.helm, "repo", "update", name],
                    capture_output=True,
                )
                self.logger.success(f"Helm repo updated: {name}")
            except subprocess.CalledProcessError as e:
                update_failed = True
                self.logger.error(f"Failed to update Helm repo {name}: {e}")
                if e.stderr:
                    self.logger.error(e.stderr)
        return not update_failed

    def validate_helm_charts(self) -> bool:
        """
        Render and validate Helm charts.

        Returns:
            True if all charts validated, False otherwise
        """
        helm_charts = [
            ("infra-ingress", "ingress-nginx", "ingress-nginx/ingress-nginx", "ingress-nginx", None),
            ("infra-metrics", "metrics-server", "bitnami/metrics-server", "kube-system",
             self.repo_root / "platform" / "k8s" / "infra" / "helm-values" / "metrics-server-values.yaml"),
            ("infra-postgres", "postgres", "bitnami/postgresql", "dev",
             self.repo_root / "platform" / "k8s" / "infra" / "helm-values" / "postgresql-values.yaml"),
            ("infra-observability", "kube-prometheus-stack", "prometheus-community/kube-prometheus-stack", "observability",
             self.repo_root / "platform" / "k8s" / "infra" / "helm-values" / "kube-prometheus-stack-values.yaml"),
            ("infra-kubeview", "kubeview", "kubeview/kubeview", "observability",
             self.repo_root / "platform" / "k8s" / "infra" / "helm-values" / "kubeview-values.yaml"),
        ]

        for filename, release, chart, namespace, values_file in helm_charts:
            outfile = self.tmpdir / f"{filename}.yaml"

            self.logger.info(f"Rendering Helm chart: {chart} (release={release}, namespace={namespace})...")

            # Build helm template command
            cmd = [
                self.helm, "template", release, chart,
                "--namespace", namespace,
                "--include-crds"
            ]

            # Add values file if specified
            if values_file:
                # Convert to native path for Windows executables in WSL
                if self.platform_info.is_wsl and self.helm.endswith(".exe"):
                    values_path = self.platform_info.to_native_path(values_file)
                else:
                    values_path = str(values_file)
                cmd.extend(["-f", values_path])

            # Render the chart
            try:
                result = self.runner.run(
                    cmd,
                    capture_output=True,
                    check=True
                )
                # Write output to file
                outfile.write_text(result.stdout)
                self.logger.info(f"Rendered {filename}.yaml")
            except subprocess.CalledProcessError as e:
                self.logger.error(f"helm template failed for {chart}.")
                self.logger.error(f"Command: {' '.join(cmd)}")
                if e.stdout:
                    self.logger.error(f"Output: {e.stdout}")
                if e.stderr:
                    self.logger.error(f"Error: {e.stderr}")
                return False

            # Validate with kubeconform
            if not self._validate_with_kubeconform(outfile, filename):
                return False

            self.validated_files.append(outfile)

        return True

    def validate_kustomize_overlay(self) -> bool:
        """
        Render and validate Kustomize overlay.

        Returns:
            True if validated, False otherwise
        """
        kustomize_dir = self.repo_root / "platform" / "k8s" / "apps" / "overlays" / "dev"
        apps_outfile = self.tmpdir / "apps-dev.yaml"

        self.logger.info(f"Rendering Kustomize overlay: {kustomize_dir}...")

        # Handle WSL + kubectl.exe path issues by using relative path
        if self.platform_info.is_wsl and self.kubectl.endswith(".exe"):
            # Change to directory and kustomize current dir
            try:
                result = self.runner.run(
                    [self.kubectl, "kustomize", "."],
                    cwd=kustomize_dir,
                    capture_output=True,
                    check=True
                )
                apps_outfile.write_text(result.stdout)
                self.logger.info("Rendered apps-dev.yaml")
            except subprocess.CalledProcessError as e:
                self.logger.error("kubectl kustomize failed.")
                if e.stdout:
                    self.logger.error(f"Output: {e.stdout}")
                if e.stderr:
                    self.logger.error(f"Error: {e.stderr}")
                return False
        else:
            # Native kubectl or non-WSL: use path directly
            try:
                result = self.runner.run(
                    [self.kubectl, "kustomize", str(kustomize_dir)],
                    capture_output=True,
                    check=True
                )
                apps_outfile.write_text(result.stdout)
                self.logger.info("Rendered apps-dev.yaml")
            except subprocess.CalledProcessError as e:
                self.logger.error("kubectl kustomize failed.")
                if e.stdout:
                    self.logger.error(f"Output: {e.stdout}")
                if e.stderr:
                    self.logger.error(f"Error: {e.stderr}")
                return False

        # Validate with kubeconform
        if not self._validate_with_kubeconform(apps_outfile, "apps-dev"):
            return False

        self.validated_files.append(apps_outfile)
        return True

    def _validate_with_kubeconform(self, yaml_file: Path, description: str) -> bool:
        """
        Validate a YAML file with kubeconform.

        Args:
            yaml_file: Path to YAML file
            description: Description for logging

        Returns:
            True if valid, False otherwise
        """
        self.logger.info(f"Validating {description}.yaml with kubeconform...")

        # Convert to native path for Windows executables in WSL
        if self.platform_info.is_wsl and self.kubeconform.endswith(".exe"):
            validate_path = self.platform_info.to_native_path(yaml_file)
        else:
            validate_path = str(yaml_file)

        try:
            self.runner.run(
                [
                    self.kubeconform,
                    "-summary",
                    "-strict",
                    "-ignore-missing-schemas",
                    validate_path
                ],
                check=True
            )
            self.logger.success(f"Validation passed for {description}.yaml")
            return True
        except subprocess.CalledProcessError as e:
            self.logger.error(f"kubeconform validation failed for {description}.yaml")
            return False

    def print_summary(self):
        """Print validation summary."""
        self.logger.info("")
        self.logger.success("=== K8s Validation Passed ===")
        self.logger.info("Validated outputs:")
        for f in self.validated_files:
            self.logger.info(f"  - {f}")
        self.logger.info(f"Temp dir: {self.tmpdir}")
        self.logger.info("")

    def run(self) -> int:
        """
        Run the validation process.

        Returns:
            0 if successful, 1 if any validation fails
        """
        try:
            # 1) Check required tools
            if not self.check_required_tools():
                return 1

            # 2) Validate kind config YAML
            if not self.validate_kind_config():
                return 1

            # 3) Ensure Helm repos and update
            if not self.ensure_helm_repos():
                return 1

            # 4) Validate Helm charts
            if not self.validate_helm_charts():
                return 1

            # 5) Validate Kustomize overlay
            if not self.validate_kustomize_overlay():
                return 1

            # 6) Print summary
            self.print_summary()

            return 0

        except KeyboardInterrupt:
            self.logger.error("\nValidation interrupted by user")
            return 130
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            return 1
        finally:
            # Cleanup is optional - keep temp files for debugging
            # Uncomment to auto-cleanup:
            # self.cleanup()
            pass


def main() -> int:
    """Main entry point."""
    validator = K8sValidator()
    return validator.run()


if __name__ == "__main__":
    sys.exit(main())
