#!/usr/bin/env python3
"""Run local Infracost and generate a markdown cost report.

The report highlights:
- Project and overall monthly/hourly/per-minute estimates
- Top hourly and monthly cost drivers
- Usage-dependent rate cards that are not fully costed without usage data
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TERRAFORM_PATH = REPO_ROOT / "platform" / "terraform"
DEFAULT_ARTIFACT_DIR = DEFAULT_TERRAFORM_PATH / ".infracost"
DEFAULT_JSON_REPORT = DEFAULT_ARTIFACT_DIR / "infracost-report.json"
DEFAULT_TABLE_REPORT = DEFAULT_ARTIFACT_DIR / "infracost-report.txt"
DEFAULT_MARKDOWN_REPORT = DEFAULT_ARTIFACT_DIR / "infracost-report.md"
DEFAULT_TERRAFORM_VAR_FILE = "env/prod.tfvars"
DEFAULT_USAGE_FILE_RELATIVE = ".infracost/usage-prod.yml"

HOURS_PER_MONTH = Decimal("730")
MINUTES_PER_MONTH = Decimal("43800")


@dataclass
class ProjectSummary:
    name: str
    monthly_cost: Decimal | None
    hourly_cost: Decimal | None
    minute_cost: Decimal | None
    usage_based_monthly_cost: Decimal | None


@dataclass
class ResourceSummary:
    project: str
    name: str
    resource_type: str
    resource_key: str | None
    monthly_cost: Decimal | None
    hourly_cost: Decimal | None
    minute_cost: Decimal | None
    usage_only_components: int
    component_count: int
    source_file: str | None
    source_line: int | None


@dataclass
class UsageRate:
    project: str
    resource: str
    component: str
    unit_price: Decimal | None
    unit: str | None
    monthly_quantity: Decimal | None
    monthly_cost: Decimal | None
    hourly_cost: Decimal | None


@dataclass
class TerraformBlock:
    resource_type: str
    resource_name: str
    file: str
    line: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run infracost breakdown for Terraform and write a markdown report with "
            "monthly/hourly/per-minute cost highlights."
        )
    )
    parser.add_argument(
        "--terraform-path",
        default=str(DEFAULT_TERRAFORM_PATH),
        help="Path to the Terraform directory. Default: platform/terraform",
    )
    parser.add_argument(
        "--api-key",
        default="",
        help=(
            "Infracost API key. Optional if INFRACOST_API_KEY is already set in environment."
        ),
    )
    parser.add_argument(
        "--usage-file",
        default="",
        help="Optional Infracost usage YAML file to improve usage-based estimates.",
    )
    parser.add_argument(
        "--output-json",
        default=str(DEFAULT_JSON_REPORT),
        help="Output JSON file path for raw Infracost breakdown.",
    )
    parser.add_argument(
        "--output-table",
        default=str(DEFAULT_TABLE_REPORT),
        help="Output text table file path for raw Infracost breakdown.",
    )
    parser.add_argument(
        "--output-markdown",
        default=str(DEFAULT_MARKDOWN_REPORT),
        help="Output markdown report path.",
    )
    parser.add_argument(
        "--top-resources",
        type=int,
        default=20,
        help="How many top resources to include in ranking sections. Default: 20",
    )
    parser.add_argument(
        "--show-skipped",
        action="store_true",
        help="Pass --show-skipped to infracost breakdown commands.",
    )
    parser.add_argument(
        "--skip-breakdown",
        action="store_true",
        help="Skip running infracost and only render markdown from --output-json.",
    )
    return parser.parse_args()


def parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))

    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"null", "none", "-", "not found"}:
        return None

    normalized = text.replace(",", "").replace("$", "")
    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def money_or_dash(value: Decimal | None) -> str:
    if value is None:
        return "-"

    abs_value = abs(value)
    if abs_value >= Decimal("1"):
        return f"${value:,.2f}"
    if abs_value >= Decimal("0.01"):
        return f"${value:,.4f}"
    return f"${value:,.6f}"


def quantity_or_dash(value: Decimal | None) -> str:
    if value is None:
        return "-"
    if value == value.to_integral_value():
        return f"{value:,}"
    return f"{value:,.4f}"


def safe_share(numerator: Decimal | None, denominator: Decimal | None) -> str:
    if numerator is None or denominator is None or denominator == 0:
        return "-"
    pct = (numerator / denominator) * Decimal("100")
    return f"{pct:.1f}%"


def normalize_path(value: str) -> str:
    return value.replace("\\", "/").lower().strip()


def extract_resource_key(resource_type: str, resource_name: str) -> str | None:
    if resource_type == "subresource":
        return None
    match = re.search(rf"{re.escape(resource_type)}\.([A-Za-z0-9_]+)", resource_name)
    if not match:
        return None
    return f"{resource_type}.{match.group(1)}"


def parse_terraform_resource_blocks(terraform_path: Path) -> list[TerraformBlock]:
    resource_regex = re.compile(r'^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{')
    blocks: list[TerraformBlock] = []

    for tf_file in terraform_path.rglob("*.tf"):
        if ".terraform" in tf_file.parts:
            continue
        rel_path = tf_file.relative_to(REPO_ROOT).as_posix()
        lines = tf_file.read_text(encoding="utf-8").splitlines()
        for line_no, line in enumerate(lines, start=1):
            match = resource_regex.match(line)
            if not match:
                continue
            blocks.append(
                TerraformBlock(
                    resource_type=match.group(1),
                    resource_name=match.group(2),
                    file=rel_path,
                    line=line_no,
                )
            )

    blocks.sort(key=lambda b: (b.file.lower(), b.line, b.resource_type, b.resource_name))
    return blocks


def resource_pricing_status(resource: ResourceSummary) -> str:
    if (resource.hourly_cost is not None and resource.hourly_cost > 0) or (
        resource.monthly_cost is not None and resource.monthly_cost > 0
    ):
        return "Costed"
    if resource.usage_only_components > 0:
        return "Usage-based only"
    if resource.component_count > 0:
        return "No price / zero"
    return "No cost components"


def run_checked(command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        if result.stdout:
            print(result.stdout, file=sys.stderr)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"Command failed with exit code {result.returncode}: {' '.join(command)}")


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def md_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def unit_rate_note(unit: str | None, unit_price: Decimal | None) -> str:
    if unit is None or unit_price is None:
        return "-"
    normalized = unit.lower().strip()

    if normalized in {"hour", "hours"}:
        return f"{money_or_dash(unit_price)} per hour"
    if normalized in {"minute", "minutes"}:
        return f"{money_or_dash(unit_price)} per minute"
    if normalized in {"second", "seconds"}:
        per_hour = unit_price * Decimal("3600")
        per_minute = unit_price * Decimal("60")
        return f"{money_or_dash(per_hour)} per hour, {money_or_dash(per_minute)} per minute"
    if normalized in {"gb-seconds", "gb-second"}:
        per_gb_hour = unit_price * Decimal("3600")
        per_gb_min = unit_price * Decimal("60")
        return f"{money_or_dash(per_gb_hour)} per GB-hour, {money_or_dash(per_gb_min)} per GB-minute"
    return "-"


def inferred_hourly(monthly: Decimal | None, hourly: Decimal | None) -> Decimal | None:
    if hourly is not None:
        return hourly
    if monthly is None:
        return None
    return monthly / HOURS_PER_MONTH


def inferred_minute(monthly: Decimal | None, hourly: Decimal | None) -> Decimal | None:
    if hourly is not None:
        return hourly / Decimal("60")
    if monthly is not None:
        return monthly / MINUTES_PER_MONTH
    return None


def collect_summaries(payload: dict[str, Any]) -> tuple[list[ProjectSummary], list[ResourceSummary], list[UsageRate]]:
    projects = payload.get("projects") or []
    project_rows: list[ProjectSummary] = []
    resource_rows: list[ResourceSummary] = []
    usage_rates: list[UsageRate] = []

    def walk_resource(project_name: str, resource: dict[str, Any]) -> None:
        resource_name = str(resource.get("name") or resource.get("resourceType") or "unknown_resource")
        resource_type = str(resource.get("resourceType") or "subresource")
        resource_key = extract_resource_key(resource_type, resource_name)
        monthly_cost = parse_decimal(resource.get("monthlyCost"))
        hourly_cost = inferred_hourly(monthly_cost, parse_decimal(resource.get("hourlyCost")))
        minute_cost = inferred_minute(monthly_cost, hourly_cost)
        metadata = resource.get("metadata") or {}
        source_file_value = metadata.get("filename")
        source_line_value = metadata.get("startLine")
        source_file = str(source_file_value) if source_file_value is not None else None
        source_line = int(source_line_value) if isinstance(source_line_value, int) else None

        components = resource.get("costComponents") or []
        usage_only = 0
        for component in components:
            component_name = str(component.get("name") or "unknown_component")
            c_monthly = parse_decimal(component.get("monthlyCost"))
            c_hourly = inferred_hourly(c_monthly, parse_decimal(component.get("hourlyCost")))
            unit_price = parse_decimal(component.get("price"))
            unit = str(component.get("unit")).strip() if component.get("unit") is not None else None
            monthly_quantity = parse_decimal(component.get("monthlyQuantity"))

            if c_monthly is None and c_hourly is None and unit_price is not None:
                usage_only += 1

            usage_rates.append(
                UsageRate(
                    project=project_name,
                    resource=resource_name,
                    component=component_name,
                    unit_price=unit_price,
                    unit=unit,
                    monthly_quantity=monthly_quantity,
                    monthly_cost=c_monthly,
                    hourly_cost=c_hourly,
                )
            )

        resource_rows.append(
            ResourceSummary(
                project=project_name,
                name=resource_name,
                resource_type=resource_type,
                resource_key=resource_key,
                monthly_cost=monthly_cost,
                hourly_cost=hourly_cost,
                minute_cost=minute_cost,
                usage_only_components=usage_only,
                component_count=len(components),
                source_file=source_file,
                source_line=source_line,
            )
        )

        for sub_resource in resource.get("subResources") or []:
            walk_resource(project_name, sub_resource)

    for project in projects:
        project_name = str(project.get("name") or "unnamed_project")
        breakdown = project.get("breakdown") or {}
        p_monthly = parse_decimal(breakdown.get("totalMonthlyCost"))
        p_hourly = inferred_hourly(p_monthly, parse_decimal(breakdown.get("totalHourlyCost")))
        p_minute = inferred_minute(p_monthly, p_hourly)
        p_usage = parse_decimal(breakdown.get("totalUsageBasedCost"))

        project_rows.append(
            ProjectSummary(
                name=project_name,
                monthly_cost=p_monthly,
                hourly_cost=p_hourly,
                minute_cost=p_minute,
                usage_based_monthly_cost=p_usage,
            )
        )

        for resource in breakdown.get("resources") or []:
            walk_resource(project_name, resource)

    return project_rows, resource_rows, usage_rates


def build_markdown(
    *,
    terraform_path: Path,
    json_path: Path,
    table_path: Path,
    payload: dict[str, Any],
    projects: list[ProjectSummary],
    resources: list[ResourceSummary],
    usage_rates: list[UsageRate],
    top_n: int,
    usage_file: Path | None,
) -> str:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    currency = str(payload.get("currency") or "USD")
    payload_summary = payload.get("summary") or {}
    detected_resources = payload_summary.get("totalDetectedResources")
    supported_resources = payload_summary.get("totalSupportedResources")
    unsupported_resources = payload_summary.get("totalUnsupportedResources")
    no_price_resources = payload_summary.get("totalNoPriceResources")

    overall_monthly = parse_decimal(payload.get("totalMonthlyCost"))
    overall_hourly = inferred_hourly(overall_monthly, parse_decimal(payload.get("totalHourlyCost")))
    overall_minute = inferred_minute(overall_monthly, overall_hourly)
    overall_usage = parse_decimal(payload.get("totalUsageBasedCost"))

    if overall_monthly is None:
        monthly_values = [p.monthly_cost for p in projects if p.monthly_cost is not None]
        overall_monthly = sum(monthly_values, Decimal("0")) if monthly_values else None
    if overall_hourly is None:
        hourly_values = [p.hourly_cost for p in projects if p.hourly_cost is not None]
        overall_hourly = sum(hourly_values, Decimal("0")) if hourly_values else inferred_hourly(overall_monthly, None)
    if overall_minute is None:
        overall_minute = inferred_minute(overall_monthly, overall_hourly)

    costed_resources = [r for r in resources if r.monthly_cost is not None and r.monthly_cost > 0]
    top_by_hour = sorted(
        [r for r in resources if r.hourly_cost is not None and r.hourly_cost > 0],
        key=lambda x: x.hourly_cost or Decimal("0"),
        reverse=True,
    )[:top_n]
    top_by_month = sorted(costed_resources, key=lambda x: x.monthly_cost or Decimal("0"), reverse=True)[:top_n]
    all_resources_sorted = sorted(
        resources,
        key=lambda x: (
            x.hourly_cost is None,
            -(x.hourly_cost or Decimal("0")),
            x.name.lower(),
        ),
    )
    terraform_blocks = parse_terraform_resource_blocks(terraform_path)
    location_map: dict[tuple[str, int], list[ResourceSummary]] = {}
    key_map: dict[str, list[ResourceSummary]] = {}
    for resource in resources:
        if resource.source_file and resource.source_line:
            location_key = (normalize_path(resource.source_file), resource.source_line)
            location_map.setdefault(location_key, []).append(resource)
        if resource.resource_key:
            key_map.setdefault(resource.resource_key, []).append(resource)

    usage_only_rates = [
        u
        for u in usage_rates
        if u.unit_price is not None and u.monthly_cost is None and u.hourly_cost is None
    ]
    usage_only_rates.sort(key=lambda x: (x.unit_price or Decimal("0")), reverse=True)

    lines: list[str] = []
    lines.append("# Infracost Local Cost Report")
    lines.append("")
    lines.append(f"- Generated: {generated_at}")
    lines.append(f"- Terraform path: `{terraform_path}`")
    lines.append(f"- Terraform var file: `{DEFAULT_TERRAFORM_VAR_FILE}`")
    lines.append(f"- Raw JSON report: `{json_path}`")
    lines.append(f"- Raw table report: `{table_path}`")
    lines.append(f"- Currency: `{currency}`")
    if usage_file:
        lines.append(f"- Usage file: `{usage_file}`")
    else:
        lines.append("- Usage file: _not provided_")
    lines.append("")

    lines.append("## Overall Cost Snapshot")
    lines.append("")
    lines.append(f"- Estimated monthly baseline: **{money_or_dash(overall_monthly)}**")
    lines.append(f"- Estimated hourly baseline: **{money_or_dash(overall_hourly)}**")
    lines.append(f"- Estimated per-minute baseline: **{money_or_dash(overall_minute)}**")
    lines.append(f"- Usage-based monthly (if modeled): **{money_or_dash(overall_usage)}**")
    lines.append("")

    lines.append("## Project Breakdown")
    lines.append("")
    lines.append("| Project | Monthly | Hourly | Per minute | Usage-based monthly |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    for project in projects:
        lines.append(
            "| "
            + " | ".join(
                [
                    md_escape(project.name),
                    money_or_dash(project.monthly_cost),
                    money_or_dash(project.hourly_cost),
                    money_or_dash(project.minute_cost),
                    money_or_dash(project.usage_based_monthly_cost),
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append(f"## Top {len(top_by_hour)} Hourly Cost Drivers")
    lines.append("")
    lines.append("| # | Resource | Project | Monthly | Hourly | Per minute | Share of monthly baseline |")
    lines.append("| ---: | --- | --- | ---: | ---: | ---: | ---: |")
    for idx, resource in enumerate(top_by_hour, start=1):
        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    md_escape(resource.name),
                    md_escape(resource.project),
                    money_or_dash(resource.monthly_cost),
                    money_or_dash(resource.hourly_cost),
                    money_or_dash(resource.minute_cost),
                    safe_share(resource.monthly_cost, overall_monthly),
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append(f"## Top {len(top_by_month)} Monthly Cost Drivers")
    lines.append("")
    lines.append("| # | Resource | Project | Monthly | Hourly | Per minute | Usage-only components |")
    lines.append("| ---: | --- | --- | ---: | ---: | ---: | ---: |")
    for idx, resource in enumerate(top_by_month, start=1):
        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    md_escape(resource.name),
                    md_escape(resource.project),
                    money_or_dash(resource.monthly_cost),
                    money_or_dash(resource.hourly_cost),
                    money_or_dash(resource.minute_cost),
                    str(resource.usage_only_components),
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append("## Infracost-Supported Resource Table")
    lines.append("")
    lines.append(
        "This table lists resources that Infracost returned in its priced/supported breakdown."
    )
    lines.append("")
    lines.append(f"Infracost-supported resources in this table: **{len(all_resources_sorted)}**")
    if isinstance(detected_resources, int):
        lines.append(f"Total resources detected by Infracost: **{detected_resources}**")
    if isinstance(supported_resources, int):
        lines.append(f"Supported with cost model: **{supported_resources}**")
    if isinstance(no_price_resources, int):
        lines.append(f"No-price/free/unpriced resources: **{no_price_resources}**")
    if isinstance(unsupported_resources, int):
        lines.append(f"Unsupported resources: **{unsupported_resources}**")
    lines.append("For full Terraform code inventory, see the next section.")
    lines.append("")
    lines.append("| # | Resource | Type | Project | Hourly | Monthly | Per minute | Pricing status | Usage-only components | Components |")
    lines.append("| ---: | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |")
    for idx, resource in enumerate(all_resources_sorted, start=1):
        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    md_escape(resource.name),
                    md_escape(resource.resource_type),
                    md_escape(resource.project),
                    money_or_dash(resource.hourly_cost),
                    money_or_dash(resource.monthly_cost),
                    money_or_dash(resource.minute_cost),
                    resource_pricing_status(resource),
                    str(resource.usage_only_components),
                    str(resource.component_count),
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append("## Terraform Resource Inventory (From `.tf` Code)")
    lines.append("")
    lines.append(
        "This section lists all Terraform `resource` blocks in this repository and "
        "maps them to Infracost hourly/monthly estimates when available."
    )
    lines.append("")
    lines.append(f"Total Terraform resource blocks: **{len(terraform_blocks)}**")
    lines.append("")
    lines.append("| # | Terraform block | File | Line | Matched instances | Hourly (sum) | Monthly (sum) | Pricing status |")
    lines.append("| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |")
    for idx, block in enumerate(terraform_blocks, start=1):
        location_key = (normalize_path(block.file), block.line)
        matches = location_map.get(location_key)
        if not matches:
            block_key = f"{block.resource_type}.{block.resource_name}"
            matches = key_map.get(block_key, [])

        hourly_values = [m.hourly_cost for m in matches if m.hourly_cost is not None]
        monthly_values = [m.monthly_cost for m in matches if m.monthly_cost is not None]
        hourly_sum = sum(hourly_values, Decimal("0")) if hourly_values else None
        monthly_sum = sum(monthly_values, Decimal("0")) if monthly_values else None

        if not matches:
            status = "Not priced / unsupported"
        elif any(resource_pricing_status(m) == "Costed" for m in matches):
            status = "Costed"
        elif any(resource_pricing_status(m) == "Usage-based only" for m in matches):
            status = "Usage-based only"
        elif any(resource_pricing_status(m) == "No price / zero" for m in matches):
            status = "No price / zero"
        else:
            status = "No cost components"

        lines.append(
            "| "
            + " | ".join(
                [
                    str(idx),
                    md_escape(f"{block.resource_type}.{block.resource_name}"),
                    md_escape(block.file),
                    str(block.line),
                    str(len(matches)),
                    money_or_dash(hourly_sum),
                    money_or_dash(monthly_sum),
                    status,
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append("## Usage-Dependent Rate Card (Not Fully Costed Without Usage Inputs)")
    lines.append("")
    lines.append(
        "These entries are usage-priced (for example requests, GB, GB-seconds). "
        "They become more realistic when you provide an Infracost usage file."
    )
    lines.append("")
    lines.append("| Resource | Project | Component | Unit price | Unit | Monthly quantity | Time-normalized hint |")
    lines.append("| --- | --- | --- | ---: | --- | ---: | --- |")
    for rate in usage_only_rates[: max(top_n * 3, 30)]:
        lines.append(
            "| "
            + " | ".join(
                [
                    md_escape(rate.resource),
                    md_escape(rate.project),
                    md_escape(rate.component),
                    money_or_dash(rate.unit_price),
                    md_escape(rate.unit or "-"),
                    quantity_or_dash(rate.monthly_quantity),
                    md_escape(unit_rate_note(rate.unit, rate.unit_price)),
                ]
            )
            + " |"
        )
    if not usage_only_rates:
        lines.append("| _None detected_ | - | - | - | - | - | - |")
    lines.append("")

    lines.append("## Notes")
    lines.append("")
    lines.append("- Hourly and per-minute values are derived from Infracost hourly values when available.")
    lines.append("- If hourly is not present, this report uses monthly / 730 hours and monthly / 43,800 minutes.")
    lines.append("- Usage-priced resources can dominate actual spend; provide `--usage-file` for better realism.")
    lines.append("- Pricing status legend: Costed, Usage-based only, No price / zero, No cost components.")
    lines.append("- `Not priced / unsupported` means Terraform defines the resource but Infracost has no direct mapped hourly estimate.")
    lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def validate_prerequisites(skip_breakdown: bool) -> None:
    if skip_breakdown:
        return
    if shutil.which("infracost") is None:
        raise RuntimeError("infracost CLI not found in PATH.")


def run_infracost(
    *,
    terraform_path: Path,
    output_json: Path,
    output_table: Path,
    usage_file: Path | None,
    show_skipped: bool,
    env: dict[str, str],
) -> None:
    ensure_parent(output_json)
    ensure_parent(output_table)

    base_args = [
        "infracost",
        "breakdown",
        f"--path={terraform_path}",
        f"--terraform-var-file={DEFAULT_TERRAFORM_VAR_FILE}",
    ]
    if usage_file:
        base_args.append(f"--usage-file={usage_file}")
    if show_skipped:
        base_args.append("--show-skipped")

    json_cmd = [*base_args, "--format=json", f"--out-file={output_json}"]
    table_cmd = [*base_args, "--format=table", f"--out-file={output_table}"]

    print(f"[INFO] Running: {' '.join(json_cmd)}")
    run_checked(json_cmd, cwd=REPO_ROOT, env=env)
    print(f"[INFO] Running: {' '.join(table_cmd)}")
    run_checked(table_cmd, cwd=REPO_ROOT, env=env)


def main() -> int:
    args = parse_args()

    terraform_path = Path(args.terraform_path).resolve()
    output_json = Path(args.output_json).resolve()
    output_table = Path(args.output_table).resolve()
    output_markdown = Path(args.output_markdown).resolve()
    usage_file = Path(args.usage_file).resolve() if args.usage_file else None
    if usage_file is None:
        candidate_usage_file = terraform_path / DEFAULT_USAGE_FILE_RELATIVE
        if candidate_usage_file.exists():
            usage_file = candidate_usage_file.resolve()
    if not terraform_path.exists():
        print(f"[FAIL] Terraform path does not exist: {terraform_path}", file=sys.stderr)
        return 1
    if usage_file and not usage_file.exists():
        print(f"[FAIL] Usage file does not exist: {usage_file}", file=sys.stderr)
        return 1
    terraform_var_file_path = terraform_path / DEFAULT_TERRAFORM_VAR_FILE
    if not terraform_var_file_path.exists():
        print(
            (
                "[FAIL] Terraform var file does not exist relative to terraform path: "
                f"{terraform_var_file_path}"
            ),
            file=sys.stderr,
        )
        return 1

    env = os.environ.copy()
    if args.api_key:
        env["INFRACOST_API_KEY"] = args.api_key

    if not env.get("INFRACOST_API_KEY"):
        print("[WARN] INFRACOST_API_KEY is not set; proceeding with local CLI authentication context.")

    try:
        validate_prerequisites(skip_breakdown=args.skip_breakdown)
        if not args.skip_breakdown:
            run_infracost(
                terraform_path=terraform_path,
                output_json=output_json,
                output_table=output_table,
                usage_file=usage_file,
                show_skipped=args.show_skipped,
                env=env,
            )

        if not output_json.exists():
            print(f"[FAIL] JSON report does not exist: {output_json}", file=sys.stderr)
            return 1

        payload = json.loads(output_json.read_text(encoding="utf-8"))
        project_rows, resource_rows, usage_rates = collect_summaries(payload)

        markdown = build_markdown(
            terraform_path=terraform_path,
            json_path=output_json,
            table_path=output_table,
            payload=payload,
            projects=project_rows,
            resources=resource_rows,
            usage_rates=usage_rates,
            top_n=max(1, args.top_resources),
            usage_file=usage_file,
        )

        ensure_parent(output_markdown)
        output_markdown.write_text(markdown, encoding="utf-8")

        print(f"[OK] Infracost JSON: {output_json}")
        print(f"[OK] Infracost table: {output_table}")
        print(f"[OK] Markdown report: {output_markdown}")
        return 0
    except RuntimeError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"[FAIL] Could not parse Infracost JSON at {output_json}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
