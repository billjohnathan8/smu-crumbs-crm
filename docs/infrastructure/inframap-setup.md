# InfraMap and Terraform Graph

Use these commands to generate architecture diagrams from `platform/terraform`.

## Commands

From repository root:

```bash
make inframap
make inframap-full
make terraform-graph
```

## Output Paths

- `docs/infrastructure/generated/inframap/`
- `docs/infrastructure/generated/terraform-graph/`

## Requirements

- `terraform`
- `inframap` (optional for `terraform-graph`, required for `inframap`)
- `dot` from Graphviz (optional, for PNG/SVG rendering)

## Installing InfraMap

Recommended:

```bash
python scripts/pipelines/setup_dev_env.py
```

The setup script can install a portable `inframap` binary under `.devtools/bin`.

## Direct Script Entry Points

```bash
python scripts/pipelines/generate_inframap.py --install-portable
python scripts/pipelines/generate_terraform_graph.py
```

## Brainboard (Interactive Visual Editor)

[Brainboard](https://app.brainboard.co) provides an interactive drag-and-drop diagram generated directly from your Terraform files. Unlike InfraMap, it lets you edit and annotate the architecture visually.

### Export Terraform files for Brainboard

From the repository root (PowerShell):

```powershell
.\scripts\export-tf-for-brainboard.ps1
```

This collects all 80 `.tf` files from `platform/terraform/` (flattened with path-prefixed names to avoid collisions) into `tf-import/`.

### Import into Brainboard

1. Go to Brainboard → **New architecture** → **Import source** → **Upload your files**
2. Select all files from `tf-import/` (Ctrl+A) and upload
3. Brainboard generates an interactive architecture diagram

> **Note:** `tf-import/` is gitignored — regenerate it locally whenever needed.

## Troubleshooting

- If `inframap` is missing, rerun setup.
- If image files are missing but `.dot` exists, install Graphviz (`dot`).
- If Docker fallback is used, ensure Docker daemon is running.
