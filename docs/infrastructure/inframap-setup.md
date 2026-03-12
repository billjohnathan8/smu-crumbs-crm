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

## Troubleshooting

- If `inframap` is missing, rerun setup.
- If image files are missing but `.dot` exists, install Graphviz (`dot`).
- If Docker fallback is used, ensure Docker daemon is running.
