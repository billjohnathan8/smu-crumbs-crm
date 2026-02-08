#!/usr/bin/env python3
"""
Generate HTML reports from GitHub Actions workflow test results.

This script parses workflow results from JSON and creates a comprehensive,
visually appealing HTML report with summary statistics, status tables,
and failure details.

Usage:
    python generate-ci-test-report.py
    python generate-ci-test-report.py --input results.json --output report.html
    python generate-ci-test-report.py --repo owner/repo
"""

from __future__ import annotations

import argparse
import datetime
import html
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

WorkflowConclusion = Literal["success", "failure", "cancelled", "skipped", "timed_out"]
WorkflowStatus = Literal["completed", "in_progress", "queued"]


@dataclass
class WorkflowResult:
    """Represents a single workflow test result."""
    branch: str
    workflow: str
    run_id: str
    status: WorkflowStatus
    conclusion: WorkflowConclusion
    duration_seconds: float
    url: str
    started_at: str
    completed_at: str
    test_type: str = "component"  # component, branch_policy, integration, main

    @property
    def duration_formatted(self) -> str:
        """Format duration as MM:SS or HH:MM:SS."""
        seconds = int(self.duration_seconds)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        return f"{minutes:02d}:{secs:02d}"

    @property
    def status_class(self) -> str:
        """Return CSS class for status badge."""
        if self.conclusion == "success":
            return "success"
        elif self.conclusion == "failure":
            return "danger"
        elif self.conclusion == "cancelled":
            return "warning"
        elif self.conclusion == "skipped":
            return "secondary"
        return "info"

    @property
    def status_icon(self) -> str:
        """Return icon for status."""
        if self.conclusion == "success":
            return "✓"
        elif self.conclusion == "failure":
            return "✗"
        elif self.conclusion == "cancelled":
            return "⊗"
        elif self.conclusion == "skipped":
            return "⊘"
        return "●"

    @classmethod
    def from_dict(cls, data: dict) -> WorkflowResult:
        """Create WorkflowResult from dictionary."""
        return cls(
            branch=data.get("branch", "unknown"),
            workflow=data.get("workflow", "unknown"),
            run_id=str(data.get("run_id", "")),
            status=data.get("status", "completed"),
            conclusion=data.get("conclusion", "failure"),
            duration_seconds=float(data.get("duration_seconds", 0)),
            url=data.get("url", ""),
            started_at=data.get("started_at", ""),
            completed_at=data.get("completed_at", ""),
            test_type=data.get("test_type", "component")
        )


@dataclass
class TestSummary:
    """Summary statistics for test results."""
    total: int
    passed: int
    failed: int
    cancelled: int
    skipped: int
    total_duration: float
    generated_at: str

    @property
    def success_rate(self) -> float:
        """Calculate success rate percentage."""
        if self.total == 0:
            return 0.0
        return (self.passed / self.total) * 100

    @property
    def total_duration_formatted(self) -> str:
        """Format total duration as HH:MM:SS."""
        seconds = int(self.total_duration)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def load_workflow_results(input_path: Path) -> list[WorkflowResult]:
    """Load and parse workflow results from JSON file."""
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            logger.error("Input JSON must be a list of workflow results")
            sys.exit(1)

        results = [WorkflowResult.from_dict(item) for item in data]
        logger.info(f"Loaded {len(results)} workflow results from {input_path}")
        return results

    except FileNotFoundError:
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in input file: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error loading workflow results: {e}")
        sys.exit(1)


def calculate_summary(results: list[WorkflowResult]) -> TestSummary:
    """Calculate summary statistics from workflow results."""
    passed = sum(1 for r in results if r.conclusion == "success")
    failed = sum(1 for r in results if r.conclusion == "failure")
    cancelled = sum(1 for r in results if r.conclusion == "cancelled")
    skipped = sum(1 for r in results if r.conclusion == "skipped")
    total_duration = sum(r.duration_seconds for r in results)

    return TestSummary(
        total=len(results),
        passed=passed,
        failed=failed,
        cancelled=cancelled,
        skipped=skipped,
        total_duration=total_duration,
        generated_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )


def generate_summary_html(summary: TestSummary) -> str:
    """Generate HTML for summary statistics section."""
    success_rate_class = "success" if summary.success_rate >= 90 else "warning" if summary.success_rate >= 70 else "danger"

    return f"""
    <div class="summary-section">
        <h2>📊 Test Summary</h2>
        <div class="row">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-value">{summary.total}</div>
                    <div class="stat-label">Total Workflows</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card stat-success">
                    <div class="stat-value">{summary.passed}</div>
                    <div class="stat-label">✓ Passed</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card stat-danger">
                    <div class="stat-value">{summary.failed}</div>
                    <div class="stat-label">✗ Failed</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card stat-warning">
                    <div class="stat-value">{summary.cancelled + summary.skipped}</div>
                    <div class="stat-label">⊗ Cancelled/Skipped</div>
                </div>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="stat-value">{summary.total_duration_formatted}</div>
                    <div class="stat-label">Total Runtime</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="stat-card stat-{success_rate_class}">
                    <div class="stat-value">{summary.success_rate:.1f}%</div>
                    <div class="stat-label">Success Rate</div>
                </div>
            </div>
        </div>
        <p class="text-muted mt-3"><small>Generated: {html.escape(summary.generated_at)}</small></p>
    </div>
    """


def generate_results_table_html(
    results: list[WorkflowResult],
    title: str,
    section_id: str
) -> str:
    """Generate HTML table for workflow results."""
    if not results:
        return ""

    rows = []
    for result in results:
        branch_escaped = html.escape(result.branch)
        workflow_escaped = html.escape(result.workflow)
        conclusion_escaped = html.escape(result.conclusion.upper())

        rows.append(f"""
        <tr>
            <td>{branch_escaped}</td>
            <td>{workflow_escaped}</td>
            <td>
                <span class="badge bg-{result.status_class}">
                    {result.status_icon} {conclusion_escaped}
                </span>
            </td>
            <td>{result.duration_formatted}</td>
            <td>
                <a href="{html.escape(result.url)}" target="_blank" class="btn btn-sm btn-outline-primary">
                    View Run →
                </a>
            </td>
        </tr>
        """)

    rows_html = "\n".join(rows)

    return f"""
    <div class="results-section" id="{section_id}">
        <h2>{html.escape(title)}</h2>
        <table class="table table-striped table-hover">
            <thead>
                <tr>
                    <th>Branch</th>
                    <th>Workflow</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
    </div>
    """


def generate_failures_html(results: list[WorkflowResult]) -> str:
    """Generate HTML for failures section."""
    failed = [r for r in results if r.conclusion == "failure"]
    if not failed:
        return ""

    failure_items = []
    for result in failed:
        branch_escaped = html.escape(result.branch)
        workflow_escaped = html.escape(result.workflow)

        failure_items.append(f"""
        <div class="failure-item">
            <h5 class="failure-title">
                <span class="badge bg-danger">✗</span>
                {branch_escaped} - {workflow_escaped}
            </h5>
            <p class="failure-details">
                <strong>Run ID:</strong> {html.escape(result.run_id)}<br>
                <strong>Duration:</strong> {result.duration_formatted}<br>
                <strong>Started:</strong> {html.escape(result.started_at)}<br>
                <strong>Completed:</strong> {html.escape(result.completed_at)}
            </p>
            <a href="{html.escape(result.url)}" target="_blank" class="btn btn-sm btn-danger">
                View Failed Run →
            </a>
        </div>
        """)

    failures_html = "\n".join(failure_items)

    return f"""
    <div class="failures-section">
        <h2>🚨 Failed Workflows ({len(failed)})</h2>
        <div class="failures-container">
            {failures_html}
        </div>
    </div>
    """


def generate_html_report(
    results: list[WorkflowResult],
    output_path: Path,
    repo_name: str
) -> None:
    """Generate complete HTML report."""
    summary = calculate_summary(results)

    # Group results by test type
    component_results = [r for r in results if r.test_type == "component"]
    branch_policy_results = [r for r in results if r.test_type == "branch_policy"]
    integration_results = [r for r in results if r.test_type == "integration"]
    main_results = [r for r in results if r.test_type == "main"]

    # Generate sections
    summary_html = generate_summary_html(summary)

    component_html = generate_results_table_html(
        component_results,
        "🔧 Component Trunk Results",
        "component-results"
    )

    branch_policy_html = generate_results_table_html(
        branch_policy_results,
        "📋 Branch Policy Results",
        "branch-policy-results"
    )

    integration_html = generate_results_table_html(
        integration_results,
        "🔗 Integration Results",
        "integration-results"
    )

    main_html = generate_results_table_html(
        main_results,
        "🎯 Main Branch Results",
        "main-results"
    )

    failures_html = generate_failures_html(results)

    # Generate full HTML document
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI/CD Test Report - {html.escape(repo_name)}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem 0;
        }}
        .container {{
            max-width: 1400px;
        }}
        .report-header {{
            background: white;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        .report-header h1 {{
            color: #2c3e50;
            margin: 0;
            font-size: 2rem;
            font-weight: 700;
        }}
        .report-header .repo-name {{
            color: #7f8c8d;
            font-size: 1rem;
            margin-top: 0.5rem;
        }}
        .summary-section, .results-section, .failures-section {{
            background: white;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        h2 {{
            color: #2c3e50;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #e0e0e0;
        }}
        .stat-card {{
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            border: 2px solid #e0e0e0;
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .stat-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }}
        .stat-card.stat-success {{
            border-color: #28a745;
            background: #d4edda;
        }}
        .stat-card.stat-danger {{
            border-color: #dc3545;
            background: #f8d7da;
        }}
        .stat-card.stat-warning {{
            border-color: #ffc107;
            background: #fff3cd;
        }}
        .stat-value {{
            font-size: 2.5rem;
            font-weight: 700;
            color: #2c3e50;
            line-height: 1;
        }}
        .stat-label {{
            font-size: 0.9rem;
            color: #6c757d;
            margin-top: 0.5rem;
            font-weight: 500;
        }}
        table {{
            border-radius: 8px;
            overflow: hidden;
        }}
        thead {{
            background: #6c5ce7;
            color: white;
        }}
        thead th {{
            font-weight: 600;
            padding: 1rem;
            border: none;
        }}
        tbody tr:hover {{
            background: #f8f9fa;
        }}
        tbody td {{
            padding: 1rem;
            vertical-align: middle;
        }}
        .badge {{
            font-size: 0.875rem;
            padding: 0.5rem 0.75rem;
            font-weight: 600;
        }}
        .btn-outline-primary {{
            font-size: 0.875rem;
            font-weight: 500;
        }}
        .failures-container {{
            display: grid;
            gap: 1rem;
        }}
        .failure-item {{
            background: #fff5f5;
            border: 2px solid #fc8181;
            border-radius: 8px;
            padding: 1.5rem;
        }}
        .failure-title {{
            color: #c53030;
            margin-bottom: 1rem;
            font-size: 1.1rem;
        }}
        .failure-details {{
            color: #4a5568;
            margin-bottom: 1rem;
            line-height: 1.6;
        }}
        .text-muted {{
            text-align: right;
        }}
        @media (max-width: 768px) {{
            .report-header h1 {{
                font-size: 1.5rem;
            }}
            .stat-value {{
                font-size: 2rem;
            }}
            table {{
                font-size: 0.875rem;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="report-header">
            <h1>🚀 CI/CD Test Report</h1>
            <div class="repo-name">{html.escape(repo_name)}</div>
        </div>

        {summary_html}

        {component_html}

        {branch_policy_html}

        {integration_html}

        {main_html}

        {failures_html}

        <div class="text-center mt-4">
            <p class="text-muted">
                <small>Generated by generate-ci-test-report.py</small>
            </p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
"""

    # Write HTML file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

    logger.info(f"HTML report generated successfully: {output_path}")


def main() -> None:
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Generate HTML reports from GitHub Actions workflow test results",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s
  %(prog)s --input results.json --output report.html
  %(prog)s --repo owner/repo --input custom-results.json
        """
    )

    parser.add_argument(
        "--input",
        type=Path,
        default=Path("build-logs/test-ci-cd-github/workflow-results.json"),
        help="Path to input JSON file with workflow results (default: %(default)s)"
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=Path("build-logs/test-ci-cd-github/workflow-test-report.html"),
        help="Path to output HTML report file (default: %(default)s)"
    )

    parser.add_argument(
        "--repo",
        type=str,
        default="cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3",
        help="GitHub repository name (default: %(default)s)"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    logger.info("Starting CI test report generation")
    logger.info(f"Input file: {args.input}")
    logger.info(f"Output file: {args.output}")
    logger.info(f"Repository: {args.repo}")

    # Load workflow results
    results = load_workflow_results(args.input)

    if not results:
        logger.warning("No workflow results found in input file")
        logger.info("Generating empty report")

    # Generate HTML report
    generate_html_report(results, args.output, args.repo)

    # Print summary
    summary = calculate_summary(results)
    logger.info("=" * 60)
    logger.info("REPORT SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total Workflows: {summary.total}")
    logger.info(f"Passed: {summary.passed}")
    logger.info(f"Failed: {summary.failed}")
    logger.info(f"Cancelled/Skipped: {summary.cancelled + summary.skipped}")
    logger.info(f"Success Rate: {summary.success_rate:.1f}%")
    logger.info(f"Total Runtime: {summary.total_duration_formatted}")
    logger.info("=" * 60)
    logger.info(f"Report available at: {args.output.absolute()}")


if __name__ == "__main__":
    main()
