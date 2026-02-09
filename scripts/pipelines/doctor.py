#!/usr/bin/env python3
"""
Doctor command - comprehensive environment diagnostics.

Prints a full health check of the developer environment:
- OS/platform detection (WSL, Git Bash, PowerShell, native)
- Python, Java, Node.js, npm, Make versions
- Docker daemon status and resource info
- kubectl, helm, kind, kubeconform versions (from .devtools/bin or global)
- Current kube context and cs301-crm cluster reachability
- Disk space warnings

Usage:
    python scripts/pipelines/doctor.py
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Add repo root to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.core.detect import get_platform, get_platform_info, is_windows

CLUSTER_NAME = "cs301-crm"


def _run(cmd, timeout=10):
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except FileNotFoundError:
        return -1, "", f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return -2, "", "timed out"
    except Exception as e:
        return -3, "", str(e)


def _version(cmd, flag="--version", timeout=10):
    """Get version string for a tool."""
    rc, out, err = _run([cmd, flag], timeout=timeout)
    if rc == 0:
        # Return first non-empty line
        for line in (out or err).splitlines():
            if line.strip():
                return line.strip()
    return None


def _which(name):
    """Find executable path."""
    return shutil.which(name)


def print_header(title):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def print_ok(msg):
    print(f"  [OK]    {msg}")


def print_warn(msg):
    print(f"  [WARN]  {msg}")


def print_fail(msg):
    print(f"  [FAIL]  {msg}")


def print_info(msg):
    print(f"  [INFO]  {msg}")


def check_platform():
    """Print platform detection results."""
    print_header("PLATFORM")
    info = get_platform_info()
    print_info(f"OS: {info.os_name} {info.os_version} ({info.architecture})")
    print_info(f"Platform type: {info.platform_type.value}")
    print_info(f"Shell: {info.shell}")
    print_info(f"Python: {info.python_version} ({sys.executable})")

    if info.is_wsl:
        print_info("Running inside WSL")
    if info.is_github_actions:
        print_info("Running in GitHub Actions")

    if is_windows():
        # Check if Git Bash is available
        git_bash_paths = [
            Path("C:/Program Files/Git/bin/bash.exe"),
            Path("C:/Program Files (x86)/Git/bin/bash.exe"),
        ]
        found_git_bash = None
        for p in git_bash_paths:
            if p.exists():
                found_git_bash = p
                break
        if found_git_bash:
            print_ok(f"Git Bash: {found_git_bash}")
        else:
            wsl_bash = _which("bash")
            if wsl_bash and "system32" in str(wsl_bash).lower():
                print_warn(f"Only WSL bash found: {wsl_bash}")
                print_warn("Install Git for Windows for reliable builds")
            elif wsl_bash:
                print_warn(f"Non-standard bash: {wsl_bash}")
            else:
                print_fail("bash not found - install Git for Windows")


def check_system_deps():
    """Check required system dependencies."""
    print_header("SYSTEM DEPENDENCIES")

    tools = [
        ("Docker", "docker", True),
        ("Git", "git", True),
        ("Java", "java", True),
        ("Node.js", "node", True),
        ("npm", "npm", True),
        ("Make", "make", True),
        ("Python", sys.executable, False),  # Already running
    ]

    all_ok = True
    for name, cmd, required in tools:
        if cmd == sys.executable:
            print_ok(f"{name}: {sys.version.split()[0]} ({sys.executable})")
            continue

        path = _which(cmd)
        if not path:
            # On Windows, try with extensions
            if is_windows():
                for ext in [".exe", ".cmd", ".bat"]:
                    path = _which(cmd + ext)
                    if path:
                        break

        if path:
            ver = _version(path)
            ver_str = ver if ver else "installed"
            # Truncate long version strings
            if len(ver_str) > 80:
                ver_str = ver_str[:77] + "..."
            print_ok(f"{name}: {ver_str}")

            # Version checks
            if name == "Java" and ver:
                import re
                m = re.search(r'(\d+)', ver)
                if m and int(m.group(1)) < 21:
                    print_warn(f"  Java 21+ required, found major version {m.group(1)}")
                    all_ok = False
            elif name == "Node.js" and ver:
                import re
                m = re.search(r'v?(\d+)', ver)
                if m and int(m.group(1)) < 18:
                    print_warn(f"  Node.js 18+ required, found major version {m.group(1)}")
                    all_ok = False
        else:
            if required:
                print_fail(f"{name}: NOT FOUND")
                all_ok = False
            else:
                print_warn(f"{name}: not found (optional)")

    return all_ok


def check_docker():
    """Check Docker daemon status and resources."""
    print_header("DOCKER")

    rc, out, err = _run(["docker", "info", "--format", "{{json .}}"], timeout=15)
    if rc != 0:
        print_fail("Docker daemon is NOT running")
        print_info("Start Docker Desktop and retry")
        return False

    print_ok("Docker daemon is running")

    try:
        info = json.loads(out)
        cpus = info.get("NCPU", "?")
        mem_bytes = info.get("MemTotal", 0)
        mem_gb = mem_bytes / (1024 ** 3) if mem_bytes else 0
        print_info(f"CPUs: {cpus}, Memory: {mem_gb:.1f} GB")

        if mem_gb < 4:
            print_warn("Docker has <4GB RAM - kind cluster may struggle")

        server_version = info.get("ServerVersion", "?")
        print_info(f"Docker version: {server_version}")
    except (json.JSONDecodeError, KeyError):
        # Fallback: just show docker version
        ver = _version("docker")
        if ver:
            print_info(f"Docker version: {ver}")

    return True


def check_portable_tools():
    """Check kubectl, helm, kind, kubeconform from .devtools/bin or global."""
    print_header("CLI TOOLS (portable)")

    devtools_bin = repo_root / ".devtools" / "bin"
    if devtools_bin.exists():
        print_info(f".devtools/bin exists: {devtools_bin}")
    else:
        print_info(".devtools/bin not found (tools must be globally installed)")

    tools = [
        ("kubectl", "--version"),
        ("helm", "version --short"),
        ("kind", "--version"),
        ("kubeconform", "-v"),
    ]

    all_ok = True
    for name, ver_flag in tools:
        path = _which(name)
        if not path and is_windows():
            path = _which(name + ".exe")

        if path:
            flags = ver_flag.split()
            ver = _version(path, *flags) if len(flags) == 1 else None
            if ver is None:
                rc, out, err = _run([path] + flags, timeout=10)
                ver = (out or err).splitlines()[0].strip() if rc == 0 else "installed"
            source = "(.devtools)" if ".devtools" in str(path) else "(global)"
            print_ok(f"{name}: {ver} {source}")
        else:
            print_fail(f"{name}: NOT FOUND")
            print_info(f"  Run: python scripts/pipelines/setup_dev_env.py")
            all_ok = False

    return all_ok


def check_kubernetes():
    """Check current kube context and cluster status."""
    print_header("KUBERNETES")

    # Current context
    rc, out, _ = _run(["kubectl", "config", "current-context"])
    if rc == 0:
        print_info(f"Current context: {out}")
    else:
        print_info("No current kube context set")

    # Check if cs301-crm cluster exists
    rc, out, _ = _run(["kind", "get", "clusters"])
    if rc == 0:
        clusters = [c.strip() for c in out.splitlines() if c.strip()]
        if CLUSTER_NAME in clusters:
            print_ok(f"kind cluster '{CLUSTER_NAME}' exists")

            # Check reachability
            rc2, _, _ = _run(
                ["kubectl", "--context", f"kind-{CLUSTER_NAME}",
                 "version", "--request-timeout=10s"],
                timeout=15
            )
            if rc2 == 0:
                print_ok(f"Cluster '{CLUSTER_NAME}' is reachable")

                # Check nodes
                rc3, nodes_out, _ = _run(
                    ["kind", "get", "nodes", "--name", CLUSTER_NAME]
                )
                if rc3 == 0 and nodes_out.strip():
                    print_ok(f"Cluster has nodes: {nodes_out.replace(chr(10), ', ')}")
                else:
                    print_warn("Cluster has no nodes (corrupted state)")
                    print_info("  Fix: kind delete cluster --name cs301-crm")

                # Pod summary
                rc4, pods_out, _ = _run(
                    ["kubectl", "--context", f"kind-{CLUSTER_NAME}",
                     "get", "pods", "-A", "--no-headers"],
                    timeout=15
                )
                if rc4 == 0 and pods_out.strip():
                    lines = pods_out.strip().splitlines()
                    running = sum(1 for l in lines if "Running" in l)
                    total = len(lines)
                    print_info(f"Pods: {running}/{total} running")
            else:
                print_warn(f"Cluster '{CLUSTER_NAME}' exists but is NOT reachable")
                print_info("  It may need recreation: kind delete cluster --name cs301-crm")
        else:
            print_info(f"kind cluster '{CLUSTER_NAME}' does not exist (will be created on deploy)")
            if clusters:
                print_info(f"  Existing clusters: {', '.join(clusters)}")
    else:
        print_info("kind not available or no clusters found")


def check_disk_space():
    """Warn if disk space is low."""
    print_header("DISK SPACE")
    try:
        usage = shutil.disk_usage(str(repo_root))
        free_gb = usage.free / (1024 ** 3)
        total_gb = usage.total / (1024 ** 3)
        used_pct = (usage.used / usage.total) * 100

        print_info(f"Free: {free_gb:.1f} GB / {total_gb:.1f} GB ({used_pct:.0f}% used)")

        if free_gb < 5:
            print_warn("Less than 5GB free - Docker images need ~2-3GB")
        elif free_gb < 10:
            print_info("Disk space is adequate")
        else:
            print_ok("Disk space is sufficient")
    except Exception as e:
        print_warn(f"Could not check disk space: {e}")


def main():
    print("=" * 60)
    print("  CS301 ITSA CRM - Environment Doctor")
    print(f"  Repository: {repo_root}")
    print("=" * 60)

    check_platform()
    sys_ok = check_system_deps()
    docker_ok = check_docker()
    tools_ok = check_portable_tools()
    check_kubernetes()
    check_disk_space()

    # Summary
    print_header("SUMMARY")
    if sys_ok and docker_ok and tools_ok:
        print_ok("Environment looks healthy!")
        print_info("Ready to run: python scripts/pipelines/deploy_k8s.py")
        return 0
    else:
        issues = []
        if not sys_ok:
            issues.append("missing system dependencies")
        if not docker_ok:
            issues.append("Docker not running")
        if not tools_ok:
            issues.append("missing CLI tools (run: python scripts/pipelines/setup_dev_env.py)")
        print_fail(f"Issues found: {'; '.join(issues)}")
        print_info("Fix the above issues and re-run: python scripts/pipelines/doctor.py")
        return 1


if __name__ == "__main__":
    sys.exit(main())
