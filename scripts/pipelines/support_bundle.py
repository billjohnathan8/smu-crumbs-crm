#!/usr/bin/env python3
"""
Support bundle generator - collect diagnostics for debugging failures.

Gathers:
- OS/platform info and tool versions
- Docker info and container list
- kind cluster state
- kubectl: pods, events, services, ingress, describe failing pods, logs
- helm: list, status for each release
- Recent build logs

Output: build-logs/support-bundle-<timestamp>/ directory + .zip archive

Usage:
    python scripts/pipelines/support_bundle.py
    python scripts/pipelines/support_bundle.py --cluster-name cs301-crm --namespace dev
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

# Add repo root to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root))

CLUSTER_NAME = "cs301-crm"
NAMESPACE = "dev"


def _run(cmd, timeout=30):
    """Run command, return (returncode, stdout, stderr). Never raises."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout
        )
        return r.returncode, r.stdout, r.stderr
    except FileNotFoundError:
        return -1, "", f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return -2, "", f"timed out after {timeout}s"
    except Exception as e:
        return -3, "", str(e)


def collect_to_file(bundle_dir, filename, cmd, timeout=30):
    """Run a command and save output to a file in the bundle directory."""
    rc, out, err = _run(cmd, timeout=timeout)
    filepath = bundle_dir / filename
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"# Command: {' '.join(str(c) for c in cmd)}\n")
        f.write(f"# Exit code: {rc}\n\n")
        if out:
            f.write(out)
        if err:
            f.write(f"\n--- STDERR ---\n{err}\n")
    return rc


def collect_text(bundle_dir, filename, text):
    """Save text content to a file in the bundle directory."""
    filepath = bundle_dir / filename
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(text)


def generate_bundle(cluster_name=CLUSTER_NAME, namespace=NAMESPACE):
    """Generate a support bundle and return the path to the zip file."""
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    bundle_name = f"support-bundle-{timestamp}"
    bundle_dir = repo_root / "build-logs" / bundle_name
    bundle_dir.mkdir(parents=True, exist_ok=True)

    context = f"kind-{cluster_name}"

    print(f"Collecting support bundle to: {bundle_dir}")
    print()

    # 1. Environment info
    print("  Collecting environment info...")
    env_lines = [
        f"Timestamp: {datetime.now().isoformat()}",
        f"OS: {sys.platform}",
        f"Python: {sys.version}",
        f"Python executable: {sys.executable}",
        f"CWD: {os.getcwd()}",
        f"Repo root: {repo_root}",
        f"PATH: {os.environ.get('PATH', '')}",
        "",
    ]
    collect_text(bundle_dir, "environment.txt", "\n".join(env_lines))

    # Run doctor and capture output
    doctor_script = repo_root / "scripts" / "pipelines" / "doctor.py"
    if doctor_script.exists():
        collect_to_file(bundle_dir, "doctor-output.txt",
                        [sys.executable, str(doctor_script)], timeout=60)

    # 2. Tool versions
    print("  Collecting tool versions...")
    version_cmds = {
        "docker-version.txt": ["docker", "version"],
        "git-version.txt": ["git", "--version"],
        "java-version.txt": ["java", "-version"],
        "node-version.txt": ["node", "--version"],
        "npm-version.txt": ["npm", "--version"],
        "make-version.txt": ["make", "--version"],
        "kubectl-version.txt": ["kubectl", "version", "--output=yaml"],
        "helm-version.txt": ["helm", "version"],
        "kind-version.txt": ["kind", "--version"],
    }
    for fname, cmd in version_cmds.items():
        collect_to_file(bundle_dir, fname, cmd, timeout=10)

    # 3. Docker diagnostics
    print("  Collecting Docker info...")
    collect_to_file(bundle_dir, "docker-info.txt", ["docker", "info"], timeout=15)
    collect_to_file(bundle_dir, "docker-ps.txt", ["docker", "ps", "-a"], timeout=10)
    collect_to_file(bundle_dir, "docker-images-kind.txt",
                    ["docker", "images", "--filter", f"reference=*{cluster_name}*"], timeout=10)

    # 4. Kind cluster
    print("  Collecting kind cluster info...")
    collect_to_file(bundle_dir, "kind-clusters.txt", ["kind", "get", "clusters"], timeout=10)
    collect_to_file(bundle_dir, "kind-nodes.txt",
                    ["kind", "get", "nodes", "--name", cluster_name], timeout=10)

    # 5. Kubernetes state
    print("  Collecting Kubernetes state...")
    kubectl_cmds = {
        "kubectl-pods-all.txt": ["kubectl", "--context", context, "get", "pods", "-A", "-o", "wide"],
        "kubectl-pods-dev.txt": ["kubectl", "--context", context, "get", "pods", "-n", namespace, "-o", "wide"],
        "kubectl-svc-dev.txt": ["kubectl", "--context", context, "get", "svc", "-n", namespace],
        "kubectl-ingress-dev.txt": ["kubectl", "--context", context, "get", "ingress", "-n", namespace],
        "kubectl-events-dev.txt": ["kubectl", "--context", context, "get", "events", "-n", namespace,
                                    "--sort-by=.metadata.creationTimestamp"],
        "kubectl-events-ingress.txt": ["kubectl", "--context", context, "get", "events",
                                        "-n", "ingress-nginx", "--sort-by=.metadata.creationTimestamp"],
        "kubectl-nodes.txt": ["kubectl", "--context", context, "get", "nodes", "-o", "wide"],
        "kubectl-ingress-nginx-pods.txt": ["kubectl", "--context", context, "get", "pods",
                                            "-n", "ingress-nginx", "-o", "wide"],
    }
    for fname, cmd in kubectl_cmds.items():
        collect_to_file(bundle_dir, fname, cmd, timeout=15)

    # 6. Describe failing pods
    print("  Collecting failing pod details...")
    rc, out, _ = _run(
        ["kubectl", "--context", context, "get", "pods", "-n", namespace, "-o", "json"],
        timeout=15
    )
    if rc == 0 and out:
        try:
            pods_data = json.loads(out)
            for pod in pods_data.get("items", []):
                phase = pod.get("status", {}).get("phase", "")
                pod_name = pod.get("metadata", {}).get("name", "")
                if phase not in ("Running", "Succeeded") and pod_name:
                    safe_name = pod_name.replace("/", "_")
                    collect_to_file(bundle_dir, f"pod-describe-{safe_name}.txt",
                                    ["kubectl", "--context", context, "describe", "pod",
                                     pod_name, "-n", namespace], timeout=15)
                    collect_to_file(bundle_dir, f"pod-logs-{safe_name}.txt",
                                    ["kubectl", "--context", context, "logs", pod_name,
                                     "-n", namespace, "--tail=200", "--all-containers=true"],
                                    timeout=15)
        except (json.JSONDecodeError, KeyError):
            pass

    # Also collect logs for all dev pods (tail 50 each)
    rc, out, _ = _run(
        ["kubectl", "--context", context, "get", "pods", "-n", namespace,
         "-o", "jsonpath={.items[*].metadata.name}"],
        timeout=15
    )
    if rc == 0 and out.strip():
        for pod_name in out.strip().split():
            safe_name = pod_name.replace("/", "_")
            collect_to_file(bundle_dir, f"pod-logs-tail-{safe_name}.txt",
                            ["kubectl", "--context", context, "logs", pod_name,
                             "-n", namespace, "--tail=50", "--all-containers=true"],
                            timeout=15)

    # 7. Helm releases
    print("  Collecting Helm info...")
    collect_to_file(bundle_dir, "helm-list.txt",
                    ["helm", "list", "-A"], timeout=15)
    for release, ns in [("postgres", namespace), ("ingress-nginx", "ingress-nginx"),
                        ("metrics-server", "kube-system")]:
        collect_to_file(bundle_dir, f"helm-status-{release}.txt",
                        ["helm", "status", release, "-n", ns], timeout=15)

    # 8. Copy recent build logs if they exist
    print("  Collecting recent build logs...")
    build_logs_dir = repo_root / "build-logs"
    for subdir_name in ["build-and-deploy-k8s", "first-time-setup", "dev-setup"]:
        src = build_logs_dir / subdir_name
        if src.exists():
            dest = bundle_dir / "build-logs" / subdir_name
            dest.mkdir(parents=True, exist_ok=True)
            # Copy only most recent log and html files (not all)
            files = sorted(src.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
            for f in files[:5]:  # Last 5 files
                if f.is_file():
                    shutil.copy2(f, dest / f.name)

    # 9. Zip the bundle
    print("  Creating zip archive...")
    zip_path = bundle_dir.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root_path, dirs, files in os.walk(bundle_dir):
            for file in files:
                file_path = Path(root_path) / file
                arcname = file_path.relative_to(bundle_dir.parent)
                zf.write(file_path, arcname)

    print()
    print(f"Support bundle created:")
    print(f"  Directory: {bundle_dir}")
    print(f"  Zip file:  {zip_path}")
    print()
    print("Share the zip file with the team for debugging assistance.")

    return str(zip_path)


def main():
    parser = argparse.ArgumentParser(description="Generate support bundle for debugging")
    parser.add_argument("--cluster-name", default=CLUSTER_NAME, help="kind cluster name")
    parser.add_argument("--namespace", default=NAMESPACE, help="Kubernetes namespace")
    args = parser.parse_args()

    try:
        zip_path = generate_bundle(args.cluster_name, args.namespace)
        return 0
    except Exception as e:
        print(f"Error generating support bundle: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
