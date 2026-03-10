#!/usr/bin/env python3
"""
Generate Terraform infrastructure diagrams with InfraMap.

Default input is the Terraform HCL directory under platform/terraform so this
works without an initialized state backend.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = REPO_ROOT / "platform" / "terraform"
DEFAULT_OUTPUT_DIR_INFRAMAP = REPO_ROOT / "docs" / "infrastructure" / "generated" / "inframap"
DEFAULT_OUTPUT_DIR_TERRAFORM_GRAPH = REPO_ROOT / "docs" / "infrastructure" / "generated" / "terraform-graph"
DEFAULT_BASENAME = "terraform-inframap"
DEFAULT_DOCKER_IMAGE = "cycloid/inframap:latest"
DEFAULT_INFRAMAP_RELEASE_API = "https://api.github.com/repos/cycloidio/inframap/releases/latest"
DEVTOOLS_BIN = REPO_ROOT / ".devtools" / "bin"


def run_checked(
    command: list[str],
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def run_quiet(command: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, env=env, check=False, capture_output=True, text=True)


def detect_os_arch() -> tuple[str, str]:
    os_name = sys.platform.lower()
    if os_name.startswith("win"):
        os_token = "windows"
    elif os_name.startswith("darwin"):
        os_token = "darwin"
    else:
        os_token = "linux"

    machine = (
        os.environ.get("PROCESSOR_ARCHITECTURE", "").lower()
        or os.environ.get("PROCESSOR_ARCHITEW6432", "").lower()
        or platform.machine().lower()
    )
    if "arm64" in machine or "aarch64" in machine:
        arch_token = "arm64"
    else:
        arch_token = "amd64"

    return os_token, arch_token


def fetch_latest_inframap_asset() -> tuple[str, str]:
    os_token, arch_token = detect_os_arch()

    with urllib.request.urlopen(DEFAULT_INFRAMAP_RELEASE_API, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    assets = payload.get("assets", [])
    preferred_ext = (".zip", ".tar.gz", ".tgz", ".exe")
    candidates: list[dict] = []
    for asset in assets:
        name = str(asset.get("name", "")).lower()
        if os_token not in name or arch_token not in name:
            continue
        if not name.endswith(preferred_ext):
            continue
        if "checksums" in name or "sha256" in name:
            continue
        candidates.append(asset)

    if not candidates:
        raise RuntimeError(f"No release asset found for {os_token}/{arch_token}.")

    # Prefer packaged archives, then direct executable.
    candidates.sort(
        key=lambda a: (
            str(a.get("name", "")).lower().endswith(".exe"),
            str(a.get("name", "")).lower(),
        )
    )
    best = candidates[0]
    return str(best["browser_download_url"]), str(best["name"])


def pick_archive_member(member_names: list[str]) -> str | None:
    normalized = [n.replace("\\", "/") for n in member_names]
    for candidate in normalized:
        leaf = candidate.rsplit("/", 1)[-1].lower()
        if leaf in ("inframap", "inframap.exe"):
            return candidate
        if leaf.startswith("inframap") and leaf.endswith(".exe"):
            return candidate
        if leaf.startswith("inframap") and "." not in leaf:
            return candidate
    return None


def install_portable_inframap() -> Path:
    DEVTOOLS_BIN.mkdir(parents=True, exist_ok=True)
    download_url, asset_name = fetch_latest_inframap_asset()
    archive_path = DEVTOOLS_BIN / asset_name

    with urllib.request.urlopen(download_url, timeout=60) as response:
        archive_path.write_bytes(response.read())

    binary_name = "inframap.exe" if sys.platform.lower().startswith("win") else "inframap"
    binary_path = DEVTOOLS_BIN / binary_name

    if asset_name.lower().endswith(".exe"):
        binary_path.write_bytes(archive_path.read_bytes())
    elif asset_name.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as archive:
            member_name = pick_archive_member(archive.namelist())
            if member_name is None:
                raise RuntimeError("Downloaded archive does not contain inframap binary.")
            with archive.open(member_name) as source:
                binary_path.write_bytes(source.read())
    else:
        with tarfile.open(archive_path, "r:*") as archive:
            names = [m.name for m in archive.getmembers() if m.isfile()]
            member_name = pick_archive_member(names)
            member = next((m for m in archive.getmembers() if m.name == member_name), None)
            if member is None:
                raise RuntimeError("Downloaded archive does not contain inframap binary.")
            extracted = archive.extractfile(member)
            if extracted is None:
                raise RuntimeError("Failed to extract inframap binary from archive.")
            binary_path.write_bytes(extracted.read())

    if not sys.platform.lower().startswith("win"):
        binary_path.chmod(0o755)

    archive_path.unlink(missing_ok=True)
    return binary_path


def get_docker_mount_and_source(source: Path) -> tuple[Path, Path]:
    if source.is_relative_to(REPO_ROOT):
        mount_host = REPO_ROOT
        container_root = Path("/opt")
        container_source = container_root / source.relative_to(REPO_ROOT)
    else:
        mount_host = source.parent
        container_root = Path("/opt")
        container_source = container_root / source.name
    return mount_host, container_source


def build_docker_generate_command(source: Path, image: str, entrypoint: str | None = None) -> list[str]:
    mount_host, container_source = get_docker_mount_and_source(source)
    command = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{mount_host}:/opt",
    ]
    if entrypoint:
        command.extend(["--entrypoint", entrypoint])
    command.extend([image, "generate", str(container_source)])
    return command


def build_docker_shell_generate_command(source: Path, image: str) -> list[str]:
    mount_host, container_source = get_docker_mount_and_source(source)
    return [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{mount_host}:/opt",
        "--entrypoint",
        "/bin/ash",
        image,
        "-c",
        f"./inframap generate {container_source}",
    ]


def resolve_inframap_binary() -> str | None:
    found = shutil.which("inframap")
    if found:
        return found
    portable_name = "inframap.exe" if sys.platform.lower().startswith("win") else "inframap"
    portable_path = DEVTOOLS_BIN / portable_name
    if portable_path.exists():
        return str(portable_path)
    return None


def resolve_dot_binary() -> str | None:
    dot_bin = shutil.which("dot")
    if dot_bin:
        return dot_bin

    if sys.platform.lower().startswith("win"):
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local_appdata = os.environ.get("LOCALAPPDATA")

        candidates = [
            Path(program_files) / "Graphviz" / "bin" / "dot.exe",
            Path(program_files_x86) / "Graphviz" / "bin" / "dot.exe",
        ]
        if local_appdata:
            candidates.append(Path(local_appdata) / "Programs" / "Graphviz" / "bin" / "dot.exe")

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)

    return None


def build_inframap_env() -> dict[str, str]:
    env = os.environ.copy()
    cache_root = REPO_ROOT / ".devtools" / "cache"
    cache_root.mkdir(parents=True, exist_ok=True)
    env["XDG_CACHE_HOME"] = str(cache_root)
    if sys.platform.lower().startswith("win"):
        env["LOCALAPPDATA"] = str(cache_root)
    return env


def generate_dot(source: Path, engine: str, docker_image: str, install_portable: bool) -> str:
    inframap_bin = resolve_inframap_binary()
    docker_bin = shutil.which("docker")
    inframap_env = build_inframap_env()

    if engine in ("auto", "binary") and not inframap_bin and install_portable:
        try:
            print("InfraMap binary not found; installing portable copy to .devtools/bin...")
            portable = install_portable_inframap()
            inframap_bin = str(portable)
        except Exception as error:
            print(f"Portable install failed: {error}", file=sys.stderr)

    if engine in ("auto", "binary") and inframap_bin:
        result = run_checked([inframap_bin, "generate", str(source)], env=inframap_env)
        return result.stdout

    if engine == "binary":
        raise RuntimeError("Error: 'inframap' was not found on PATH.")

    if engine in ("auto", "docker"):
        if docker_bin is None:
            raise RuntimeError("Error: Docker is not available on PATH for InfraMap fallback.")
        docker_info = run_quiet([docker_bin, "info"])
        if docker_info.returncode != 0:
            stderr = docker_info.stderr.strip() if docker_info.stderr else "Unknown docker error"
            raise RuntimeError(
                "Error: Docker is installed but not usable for InfraMap fallback.\n"
                f"Docker info failed: {stderr}\n"
                "Start Docker Desktop (or daemon) and try again, or install inframap locally."
            )
        attempted_errors: list[str] = []

        # First try the documented invocation with the image default entrypoint.
        command = build_docker_generate_command(source, docker_image)
        result = run_quiet(command)
        if result.returncode == 0:
            return result.stdout
        if result.stderr:
            attempted_errors.append(f"[default] {result.stderr.strip()}")

        # Then try known explicit entrypoints.
        for entrypoint in ("inframap", "/usr/local/bin/inframap", "/inframap", "./inframap"):
            command = build_docker_generate_command(source, docker_image, entrypoint)
            result = run_quiet(command)
            if result.returncode == 0:
                return result.stdout
            stderr = (result.stderr or "").strip()
            if stderr:
                attempted_errors.append(f"[{entrypoint}] {stderr}")

        # Last fallback from upstream docs: shell entrypoint calling ./inframap.
        shell_command = build_docker_shell_generate_command(source, docker_image)
        shell_result = run_quiet(shell_command)
        if shell_result.returncode == 0:
            return shell_result.stdout
        if shell_result.stderr:
            attempted_errors.append(f"[/bin/ash -c ./inframap] {shell_result.stderr.strip()}")

        joined = "\n".join(attempted_errors[-4:]) if attempted_errors else "Unknown docker run error."
        raise RuntimeError(
            "Error: InfraMap Docker fallback failed across known entrypoints.\n"
            f"{joined}"
        )

    raise RuntimeError(f"Error: unsupported engine '{engine}'.")


def is_effectively_empty_dot(dot_text: str) -> bool:
    compact = "".join(dot_text.split())
    return compact in {"strictdigraphG{}", "digraphG{}"}


def render_dot(dot_text: str, dot_bin: str | None, output_dir: Path, basename: str) -> None:
    dot_path = output_dir / f"{basename}.dot"
    png_path = output_dir / f"{basename}.png"
    svg_path = output_dir / f"{basename}.svg"

    dot_path.write_text(dot_text, encoding="utf-8")
    print(f"Wrote DOT: {dot_path}")

    if dot_bin is None:
        print("Graphviz 'dot' not found; skipping PNG/SVG rendering.")
        return

    if not shutil.which("dot") and sys.platform.lower().startswith("win"):
        print(f"Using Graphviz dot from: {dot_bin}")

    for fmt, path in (("png", png_path), ("svg", svg_path)):
        try:
            run_checked([dot_bin, f"-T{fmt}", str(dot_path), "-o", str(path)])
            print(f"Wrote {fmt.upper()}: {path}")
        except subprocess.CalledProcessError as error:
            print(f"Warning: failed to render {fmt.upper()} with dot.", file=sys.stderr)
            if error.stderr:
                print(error.stderr.strip(), file=sys.stderr)


def generate_full_terraform_graph(source: Path) -> str:
    terraform_bin = shutil.which("terraform")
    if terraform_bin is None:
        raise RuntimeError("Error: terraform is required for --full-graph mode but was not found on PATH.")
    result = run_checked([terraform_bin, "graph"], cwd=source)
    return result.stdout


def generate_module_diagrams(source: Path, engine: str, docker_image: str, output_dir: Path) -> int:
    modules_dir = source / "modules"
    if not modules_dir.exists():
        print("No modules directory found for fallback module rendering.")
        return 0

    dot_bin = resolve_dot_binary()
    generated = 0
    for module_dir in sorted(p for p in modules_dir.iterdir() if p.is_dir()):
        try:
            module_dot = generate_dot(module_dir, engine, docker_image, install_portable=False)
        except subprocess.CalledProcessError as error:
            detail = (error.stderr or "").strip().splitlines()
            summary = detail[0] if detail else str(error)
            print(f"Skipping module {module_dir.name}: {summary}", file=sys.stderr)
            continue
        except Exception as error:  # best-effort fallback
            print(f"Skipping module {module_dir.name}: {error}", file=sys.stderr)
            continue

        if is_effectively_empty_dot(module_dot):
            continue

        render_dot(module_dot, dot_bin, output_dir, f"terraform-inframap-{module_dir.name}")
        generated += 1

    return generated


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate InfraMap diagram files for Terraform.")
    parser.add_argument(
        "--source",
        default=str(DEFAULT_SOURCE),
        help="Terraform source path (directory, .tfstate, or plan json).",
    )
    parser.add_argument(
        "--output-dir",
        help="Directory where output files are written. Defaults to generated/inframap or generated/terraform-graph when --full-graph is used.",
    )
    parser.add_argument(
        "--basename",
        default=DEFAULT_BASENAME,
        help="Output file basename (without extension).",
    )
    parser.add_argument(
        "--engine",
        choices=["auto", "binary", "docker"],
        default="auto",
        help="InfraMap execution engine: local binary, Docker, or auto-detect.",
    )
    parser.add_argument(
        "--docker-image",
        default=DEFAULT_DOCKER_IMAGE,
        help="Docker image used when --engine docker or auto fallback is needed.",
    )
    parser.add_argument(
        "--install-portable",
        action="store_true",
        help="If inframap is missing, download a portable copy into .devtools/bin.",
    )
    parser.add_argument(
        "--full-graph",
        action="store_true",
        help="Generate a full Terraform dependency graph via `terraform graph` (single combined diagram).",
    )
    args = parser.parse_args()

    source = Path(args.source).resolve()
    if args.output_dir:
        output_dir = Path(args.output_dir).resolve()
    elif args.full_graph:
        output_dir = DEFAULT_OUTPUT_DIR_TERRAFORM_GRAPH
    else:
        output_dir = DEFAULT_OUTPUT_DIR_INFRAMAP
    if not source.exists():
        print(f"Error: source path does not exist: {source}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    dot_bin = resolve_dot_binary()

    if args.full_graph:
        if not source.is_dir():
            print("Error: --full-graph requires --source to be a Terraform directory.", file=sys.stderr)
            return 1
        try:
            full_dot = generate_full_terraform_graph(source)
        except subprocess.CalledProcessError as error:
            print("Error: terraform graph failed.", file=sys.stderr)
            if error.stderr:
                print(error.stderr.strip(), file=sys.stderr)
            return error.returncode or 1
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            return 1

        render_dot(full_dot, dot_bin, output_dir, args.basename)
        return 0

    try:
        dot_text = generate_dot(source, args.engine, args.docker_image, args.install_portable)
    except subprocess.CalledProcessError as error:
        print("Error: InfraMap generate failed.", file=sys.stderr)
        if error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        if args.engine == "auto":
            print(
                "Hint: install 'inframap' locally or ensure Docker can pull/run the InfraMap image.",
                file=sys.stderr,
            )
        return error.returncode or 1
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        if args.engine == "auto":
            print("Hint: install 'inframap' or use --engine docker after installing Docker.", file=sys.stderr)
        return 1

    if is_effectively_empty_dot(dot_text) and source.is_dir():
        print(
            "InfraMap produced an empty root graph. This Terraform root appears to be module-only "
            "(no direct resource blocks). Falling back to per-module diagrams."
        )
        generated = generate_module_diagrams(source, args.engine, args.docker_image, output_dir)
        if generated == 0:
            render_dot(dot_text, dot_bin, output_dir, args.basename)
            print(
                "No non-empty module diagrams were generated. "
                "Use a tfstate/plan file as --source for a full expanded graph."
            )
        else:
            summary_dot = (
                "digraph G {\n"
                "  graph [label=\"InfraMap root graph is empty for module-only Terraform roots.\", labelloc=t, fontsize=18];\n"
                "  note [shape=note, fontsize=12, label=\"Open terraform-inframap-network.* and terraform-inframap-ecs.*. "
                "For a full unified graph, use a tfstate/plan file as --source.\"];\n"
                "}\n"
            )
            render_dot(summary_dot, dot_bin, output_dir, args.basename)
            print(f"Generated {generated} module diagram(s) in {output_dir}")
            print(
                "Open files named terraform-inframap-<module>.png/svg. "
                "Some modules may be skipped due InfraMap HCL parser limitations."
            )
        return 0

    render_dot(dot_text, dot_bin, output_dir, args.basename)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
