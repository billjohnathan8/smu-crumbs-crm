#!/usr/bin/env python3
"""
Generate Terraform dependency graph outputs (DOT/SVG/PNG).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TERRAFORM_DIR = REPO_ROOT / "platform" / "terraform"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "infrastructure" / "generated" / "terraform-graph"
DEFAULT_BASENAME = "terraform-graph"


def run_checked(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        check=True,
        capture_output=True,
        text=True,
    )


def resolve_dot_binary() -> str | None:
    dot_bin = shutil.which("dot")
    if dot_bin:
        return dot_bin

    # Allow explicit override for non-standard installs.
    env_dot = os.environ.get("GRAPHVIZ_DOT")
    if env_dot and Path(env_dot).exists():
        return env_dot

    if not sys.platform.lower().startswith("win"):
        return None

    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local_appdata = os.environ.get("LOCALAPPDATA", "")
    choco = os.environ.get("ChocolateyInstall", r"C:\ProgramData\chocolatey")

    candidates = [
        Path(program_files) / "Graphviz" / "bin" / "dot.exe",
        Path(program_files_x86) / "Graphviz" / "bin" / "dot.exe",
        Path(local_appdata) / "Programs" / "Graphviz" / "bin" / "dot.exe",
        Path(choco) / "lib" / "graphviz" / "tools" / "graphviz" / "bin" / "dot.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return None


def build_graph_command(args: argparse.Namespace, terraform_bin: str) -> list[str]:
    command = [terraform_bin, "graph", f"-type={args.graph_type}"]

    if args.draw_cycles:
        command.append("-draw-cycles")

    if args.plan_file:
        command.append(f"-plan={args.plan_file}")

    if args.module_depth is not None:
        command.append(f"-module-depth={args.module_depth}")

    return command


def main() -> int:
    parser = argparse.ArgumentParser(description="Render Terraform graph output to DOT/SVG/PNG.")
    parser.add_argument(
        "--terraform-dir",
        default=str(DEFAULT_TERRAFORM_DIR),
        help="Directory containing Terraform configuration.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where graph files are written.",
    )
    parser.add_argument(
        "--basename",
        default=DEFAULT_BASENAME,
        help="Base file name for output files (without extension).",
    )
    parser.add_argument(
        "--graph-type",
        choices=["plan", "plan-refresh-only", "plan-destroy", "apply", "input", "refresh"],
        default="plan",
        help="Terraform graph type to generate.",
    )
    parser.add_argument(
        "--plan-file",
        help="Path to saved plan file; required for some graph types (for example apply).",
    )
    parser.add_argument(
        "--module-depth",
        type=int,
        help="Maximum depth of modules to expand in the graph.",
    )
    parser.add_argument(
        "--draw-cycles",
        action="store_true",
        help="Highlight graph cycles in red.",
    )
    args = parser.parse_args()

    terraform_dir = Path(args.terraform_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    dot_path = output_dir / f"{args.basename}.dot"
    svg_path = output_dir / f"{args.basename}.svg"
    png_path = output_dir / f"{args.basename}.png"

    terraform_bin = shutil.which("terraform")
    if terraform_bin is None:
        print("Error: terraform CLI not found on PATH.", file=sys.stderr)
        return 1

    if not terraform_dir.exists():
        print(f"Error: terraform directory does not exist: {terraform_dir}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    graph_command = build_graph_command(args, terraform_bin)
    try:
        result = run_checked(graph_command, cwd=terraform_dir)
    except subprocess.CalledProcessError as error:
        print("Error: terraform graph command failed.", file=sys.stderr)
        if error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        return error.returncode or 1

    dot_path.write_text(result.stdout, encoding="utf-8")
    print(f"Wrote DOT: {dot_path}")

    dot_bin = resolve_dot_binary()
    if dot_bin is None:
        print(
            "Graphviz 'dot' not found; skipping SVG/PNG rendering.\n"
            "Hint: add Graphviz bin to PATH or set GRAPHVIZ_DOT to dot.exe."
        )
        return 0

    for fmt, output_path in (("svg", svg_path), ("png", png_path)):
        try:
            run_checked([dot_bin, f"-T{fmt}", str(dot_path), "-o", str(output_path)])
            print(f"Wrote {fmt.upper()}: {output_path}")
        except subprocess.CalledProcessError as error:
            print(f"Warning: failed to render {fmt.upper()} with dot.", file=sys.stderr)
            if error.stderr:
                print(error.stderr.strip(), file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
