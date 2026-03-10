# Terraform Infrastructure Visualization (InfraMap + Terraform Graph)

Use this guide to generate a local infrastructure diagram from the Terraform code in `platform/terraform`.

## What this generates

- `docs/infrastructure/generated/inframap/terraform-inframap.dot`
- `docs/infrastructure/generated/inframap/terraform-inframap.png` (if Graphviz installed)
- `docs/infrastructure/generated/inframap/terraform-inframap.svg` (if Graphviz installed)
- `docs/infrastructure/generated/terraform-graph/terraform-full.dot` (for `make inframap-full`)
- `docs/infrastructure/generated/terraform-graph/terraform-full.png` (if Graphviz installed)
- `docs/infrastructure/generated/terraform-graph/terraform-full.svg` (if Graphviz installed)
- `docs/infrastructure/generated/terraform-graph/terraform-graph.dot` (for `make terraform-graph`)
- `docs/infrastructure/generated/terraform-graph/terraform-graph.png` (if Graphviz installed)
- `docs/infrastructure/generated/terraform-graph/terraform-graph.svg` (if Graphviz installed)

## Which mode to use

- Use `make inframap` for topology-style diagrams from InfraMap.
- Use `make inframap-full` for one combined dependency graph generated via `terraform graph`.
- Use `make terraform-graph` when you want direct `terraform graph` options (graph type, module depth, cycles, plan file).

## Prerequisites

- `inframap` on your `PATH`
- `terraform` on your `PATH` (required for `make inframap-full` and `make terraform-graph`)
- Optional: Graphviz `dot` on your `PATH` (for PNG/SVG rendering)

## Install InfraMap

### Option A: Download binary from releases

1. Open: https://github.com/cycloidio/inframap/releases
2. Download the archive for your OS/architecture.
3. Extract the binary and add it to your `PATH`.

### Option B: Use Docker without local install

From repo root:

```bash
docker run --rm -v "${PWD}:/src" -w /src/platform/terraform cycloid/inframap:latest generate . > ../docs/infrastructure/generated/inframap/terraform-inframap.dot
```

Then render image files (requires Graphviz):

```bash
dot -Tpng docs/infrastructure/generated/inframap/terraform-inframap.dot -o docs/infrastructure/generated/inframap/terraform-inframap.png
dot -Tsvg docs/infrastructure/generated/inframap/terraform-inframap.dot -o docs/infrastructure/generated/inframap/terraform-inframap.svg
```

## Generate from this repository (recommended)

You can install InfraMap as part of team onboarding:

```bash
python scripts/pipelines/setup_dev_env.py
```

Important:
- `setup_dev_env.py` installs `inframap` as a portable binary from releases; Docker is not required for this install step.
- Docker Desktop (or Docker Engine) is only required when using Docker-based InfraMap fallback (`--engine docker`) or other Docker-based project workflows.

The setup script now:
- checks `inframap` and `dot`
- installs a portable `inframap` binary into `.devtools/bin` when missing
- prints OS-specific install hints for Graphviz `dot`

If you also want setup to install Graphviz automatically:

```bash
python scripts/pipelines/setup_dev_env.py --install-graphviz
```

From repo root:

```bash
make inframap
```

Or from `platform/terraform`:

```bash
make inframap
```

Behavior:
- Uses local `inframap` if available.
- If missing, tries to download a portable binary into `.devtools/bin`.
- If portable download fails, falls back to Docker image `cycloid/inframap:latest` (requires Docker daemon running).
- If the Terraform root is module-only and InfraMap returns an empty root graph, the script generates per-module diagrams like `terraform-inframap-network.*` and `terraform-inframap-ecs.*`.

This runs:

```bash
python scripts/pipelines/generate_inframap.py --install-portable
```

You can customize inputs:

```bash
python scripts/pipelines/generate_inframap.py --source platform/terraform --output-dir docs/infrastructure/generated/inframap --basename terraform-dev
```

`--source` accepts:
- Terraform directory (HCL)
- `terraform.tfstate`
- Terraform plan JSON file

## Full Infrastructure Diagram (single graph)

For a complete project-wide graph, use Terraform dependency graph mode:

```bash
make inframap-full
```

This writes:
- `docs/infrastructure/generated/terraform-graph/terraform-full.dot`
- `docs/infrastructure/generated/terraform-graph/terraform-full.png`
- `docs/infrastructure/generated/terraform-graph/terraform-full.svg`

Note: this mode uses `terraform graph` under the hood. It is typically much more complete for module-heavy roots than InfraMap HCL parsing.

## Terraform Graph (direct wrapper)

For direct control of `terraform graph`, use:

```bash
make terraform-graph
```

This runs:

```bash
python scripts/pipelines/generate_terraform_graph.py
```

Example with extra graph options:

```bash
python scripts/pipelines/generate_terraform_graph.py --graph-type apply --module-depth 2 --draw-cycles --basename terraform-apply
```

## Windows PowerShell examples

```powershell
python .\scripts\pipelines\generate_inframap.py
python .\scripts\pipelines\generate_inframap.py --source .\platform\terraform --basename terraform-dev
python .\scripts\pipelines\generate_terraform_graph.py --graph-type plan --basename terraform-plan
```

## Troubleshooting

If `make inframap` fails:

1. Check local binary:

```powershell
inframap --version
```

2. Check Docker daemon:

```powershell
docker info
```

3. Force portable install attempt:

```powershell
python .\scripts\pipelines\generate_inframap.py --install-portable --engine binary
```
