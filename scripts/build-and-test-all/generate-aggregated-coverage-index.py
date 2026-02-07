#!/usr/bin/env python3
"""
Generates an aggregated coverage report combining both backend and frontend services.

This script collects test results and code coverage data from:
- All backend services (Gradle Java and Python)
- Frontend service (crm-ui React/TypeScript)

It produces a unified HTML report showing test results and coverage metrics
across the entire application stack.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import html
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET


@dataclass
class CoverageCounts:
    covered: int
    missed: int

    @property
    def total(self) -> int:
        return self.covered + self.missed

    @property
    def pct(self) -> Optional[float]:
        if self.total <= 0:
            return None
        return 100.0 * (self.covered / self.total)


@dataclass
class TestCounts:
    tests: int
    failures: int
    errors: int
    skipped: int

    @property
    def passed(self) -> int:
        return max(0, self.tests - self.failures - self.errors)


@dataclass
class ServiceSummary:
    name: str
    runtime: str
    layer: str  # "backend" or "frontend"
    tests: Optional[TestCounts]
    line_cov: Optional[CoverageCounts]
    branch_cov: Optional[CoverageCounts]
    links: dict[str, Path]
    warnings: list[str]


def _repo_root() -> Path:
    # scripts/build-and-test-all/generate-aggregated-coverage-index.py -> repo root
    return Path(__file__).resolve().parents[2]


def _rel(from_dir: Path, to_path: Path) -> str:
    """Return a relative path from from_dir to to_path, using forward slashes."""
    try:
        return os.path.relpath(str(to_path), start=str(from_dir)).replace("\\", "/")
    except Exception:
        return str(to_path).replace("\\", "/")


# =======================
# Backend Parsing Functions (Gradle, Python)
# =======================

def _parse_junit_dir(test_results_dir: Path) -> Optional[TestCounts]:
    """Parse JUnit XML files from a directory (Gradle test results)."""
    if not test_results_dir.is_dir():
        return None

    tests = failures = errors = skipped = 0
    found = False
    for xml_file in sorted(test_results_dir.glob("*.xml")):
        try:
            root = ET.parse(xml_file).getroot()
        except Exception:
            continue

        suites = []
        if root.tag == "testsuite":
            suites = [root]
        elif root.tag == "testsuites":
            suites = list(root.findall("testsuite"))

        for suite in suites:
            found = True
            tests += int(suite.attrib.get("tests", "0"))
            failures += int(suite.attrib.get("failures", "0"))
            errors += int(suite.attrib.get("errors", "0"))
            skipped += int(suite.attrib.get("skipped", "0"))

    if not found:
        return None
    return TestCounts(tests=tests, failures=failures, errors=errors, skipped=skipped)


def _parse_junit_file(junit_xml: Path) -> Optional[TestCounts]:
    """Parse a single JUnit XML file (Python test results)."""
    if not junit_xml.is_file():
        return None

    try:
        root = ET.parse(junit_xml).getroot()
    except Exception:
        return None

    tests = failures = errors = skipped = 0
    found = False

    if root.tag == "testsuite":
        suites = [root]
    elif root.tag == "testsuites":
        suites = list(root.findall("testsuite"))
    else:
        suites = []

    for suite in suites:
        found = True
        tests += int(suite.attrib.get("tests", "0"))
        failures += int(suite.attrib.get("failures", "0"))
        errors += int(suite.attrib.get("errors", "0"))
        skipped += int(suite.attrib.get("skipped", "0"))

    if not found:
        return None
    return TestCounts(tests=tests, failures=failures, errors=errors, skipped=skipped)


def _parse_jacoco_xml(jacoco_xml: Path) -> tuple[Optional[CoverageCounts], Optional[CoverageCounts]]:
    """Parse JaCoCo coverage XML for line and branch coverage."""
    if not jacoco_xml.is_file():
        return None, None

    try:
        root = ET.parse(jacoco_xml).getroot()
    except Exception:
        return None, None

    line_cov = branch_cov = None
    for counter in root.findall("counter"):
        ctype = counter.attrib.get("type")
        missed = int(counter.attrib.get("missed", "0"))
        covered = int(counter.attrib.get("covered", "0"))
        if ctype == "LINE":
            line_cov = CoverageCounts(covered=covered, missed=missed)
        elif ctype == "BRANCH":
            branch_cov = CoverageCounts(covered=covered, missed=missed)

    return line_cov, branch_cov


def _parse_coveragepy_xml(cov_xml: Path) -> tuple[Optional[CoverageCounts], Optional[CoverageCounts]]:
    """Parse coverage.py XML (Cobertura format) for line and branch coverage."""
    if not cov_xml.is_file():
        return None, None

    try:
        root = ET.parse(cov_xml).getroot()
    except Exception:
        return None, None

    if root.tag != "coverage":
        return None, None

    lines_valid = root.attrib.get("lines-valid")
    lines_covered = root.attrib.get("lines-covered")
    branches_valid = root.attrib.get("branches-valid")
    branches_covered = root.attrib.get("branches-covered")

    line_cov = branch_cov = None
    try:
        if lines_valid is not None and lines_covered is not None:
            lv = int(lines_valid)
            lc = int(lines_covered)
            line_cov = CoverageCounts(covered=lc, missed=max(0, lv - lc))
    except Exception:
        line_cov = None

    try:
        if branches_valid is not None and branches_covered is not None:
            bv = int(branches_valid)
            bc = int(branches_covered)
            branch_cov = CoverageCounts(covered=bc, missed=max(0, bv - bc))
    except Exception:
        branch_cov = None

    return line_cov, branch_cov


def _detect_runtime(service_dir: Path) -> Optional[str]:
    """Detect the runtime/build system of a service directory."""
    if (service_dir / "gradlew").exists() or (service_dir / "gradlew.bat").exists():
        return "gradle"
    if (service_dir / "run-local-test-pipeline.py").exists():
        return "python"
    if (service_dir / "package.json").exists():
        return "node"
    return None


# =======================
# Frontend Parsing Functions (React/Vitest coverage)
# =======================

def _parse_vitest_coverage_summary(coverage_summary_json: Path) -> tuple[Optional[CoverageCounts], Optional[CoverageCounts]]:
    """
    Parse Vitest coverage-summary.json for line and branch coverage.
    
    Expected format (typical Vitest/Istanbul):
    {
      "total": {
        "lines": {"total": 100, "covered": 85, "skipped": 0, "pct": 85},
        "statements": {...},
        "functions": {...},
        "branches": {"total": 50, "covered": 40, "skipped": 0, "pct": 80}
      }
    }
    """
    if not coverage_summary_json.is_file():
        return None, None

    try:
        with open(coverage_summary_json, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None, None

    line_cov = branch_cov = None

    total_data = data.get("total", {})
    
    # Line coverage
    lines_data = total_data.get("lines", {})
    if lines_data:
        try:
            lines_total = int(lines_data.get("total", 0))
            lines_covered = int(lines_data.get("covered", 0))
            lines_missed = max(0, lines_total - lines_covered)
            line_cov = CoverageCounts(covered=lines_covered, missed=lines_missed)
        except Exception:
            line_cov = None

    # Branch coverage
    branches_data = total_data.get("branches", {})
    if branches_data:
        try:
            branches_total = int(branches_data.get("total", 0))
            branches_covered = int(branches_data.get("covered", 0))
            branches_missed = max(0, branches_total - branches_covered)
            branch_cov = CoverageCounts(covered=branches_covered, missed=branches_missed)
        except Exception:
            branch_cov = None

    return line_cov, branch_cov


def _parse_vitest_junit(junit_xml: Path) -> Optional[TestCounts]:
    """Parse Vitest JUnit XML output for test results."""
    return _parse_junit_file(junit_xml)


# =======================
# Service Summarization
# =======================

def _summarize_backend_service(service_dir: Path) -> Optional[ServiceSummary]:
    """Summarize a backend service (Gradle or Python)."""
    name = service_dir.name
    runtime = _detect_runtime(service_dir)
    
    if runtime not in ("gradle", "python"):
        return None
    
    warnings: list[str] = []
    links: dict[str, Path] = {}
    tests: Optional[TestCounts] = None
    line_cov: Optional[CoverageCounts] = None
    branch_cov: Optional[CoverageCounts] = None

    if runtime == "gradle":
        jacoco_xml = service_dir / "build" / "reports" / "jacoco" / "test" / "jacocoTestReport.xml"
        line_cov, branch_cov = _parse_jacoco_xml(jacoco_xml)

        test_results_dir = service_dir / "build" / "test-results" / "test"
        tests = _parse_junit_dir(test_results_dir)

        # Links
        checkstyle_main = service_dir / "build" / "reports" / "checkstyle" / "main.html"
        checkstyle_test = service_dir / "build" / "reports" / "checkstyle" / "test.html"
        tests_html = service_dir / "build" / "reports" / "tests" / "test" / "index.html"
        jacoco_html = service_dir / "build" / "reports" / "jacoco" / "test" / "html" / "index.html"

        if checkstyle_main.exists():
            links["checkstyleMain"] = checkstyle_main
        if checkstyle_test.exists():
            links["checkstyleTest"] = checkstyle_test
        if tests_html.exists():
            links["tests"] = tests_html
        if jacoco_html.exists():
            links["coverage"] = jacoco_html

        if line_cov is None:
            warnings.append("JaCoCo XML not found or unreadable")

    elif runtime == "python":
        cov_xml = service_dir / "build" / "reports" / "coverage" / "coverage.xml"
        line_cov, branch_cov = _parse_coveragepy_xml(cov_xml)

        junit_xml = service_dir / "build" / "reports" / "tests" / "junit.xml"
        tests = _parse_junit_file(junit_xml)

        cov_html = service_dir / "build" / "reports" / "coverage" / "html" / "index.html"
        if cov_html.exists():
            links["coverage"] = cov_html

        if junit_xml.exists():
            links["tests"] = junit_xml

        if line_cov is None:
            warnings.append("coverage.xml not found or unreadable")

    links["serviceRoot"] = service_dir

    return ServiceSummary(
        name=name,
        runtime=runtime,
        layer="backend",
        tests=tests,
        line_cov=line_cov,
        branch_cov=branch_cov,
        links=links,
        warnings=warnings,
    )


def _summarize_frontend_service(frontend_dir: Path) -> Optional[ServiceSummary]:
    """Summarize the frontend crm-ui service."""
    name = frontend_dir.name
    runtime = "node"
    warnings: list[str] = []
    links: dict[str, Path] = {}
    tests: Optional[TestCounts] = None
    line_cov: Optional[CoverageCounts] = None
    branch_cov: Optional[CoverageCounts] = None

    # Vitest/Istanbul coverage
    coverage_summary = frontend_dir / "coverage" / "coverage-summary.json"
    line_cov, branch_cov = _parse_vitest_coverage_summary(coverage_summary)

    # Vitest JUnit results (if generated)
    vitest_junit_xml = frontend_dir / "junit.xml"
    vitest_tests = _parse_vitest_junit(vitest_junit_xml)
    
    # Playwright JUnit results (e2e tests)
    playwright_junit_xml = frontend_dir / "test-results" / "junit.xml"
    playwright_tests = _parse_junit_file(playwright_junit_xml)
    
    # Combine test results from both Vitest and Playwright
    if vitest_tests and playwright_tests:
        tests = TestCounts(
            tests=vitest_tests.tests + playwright_tests.tests,
            failures=vitest_tests.failures + playwright_tests.failures,
            errors=vitest_tests.errors + playwright_tests.errors,
            skipped=vitest_tests.skipped + playwright_tests.skipped,
        )
    elif vitest_tests:
        tests = vitest_tests
    elif playwright_tests:
        tests = playwright_tests
    else:
        tests = None

    # Links
    coverage_html = frontend_dir / "coverage" / "index.html"
    if coverage_html.exists():
        links["vitestCoverage"] = coverage_html
    
    playwright_html = frontend_dir / "playwright-report" / "index.html"
    if playwright_html.exists():
        links["playwrightReport"] = playwright_html
    
    if vitest_junit_xml.exists():
        links["vitestTests"] = vitest_junit_xml
    
    if playwright_junit_xml.exists():
        links["playwrightTests"] = playwright_junit_xml
    
    # Warnings
    if not coverage_html.exists():
        warnings.append("Vitest coverage HTML report not found")
    
    if line_cov is None:
        warnings.append("coverage-summary.json not found or unreadable")
    
    if not playwright_html.exists():
        warnings.append("Playwright HTML report not found")

    links["serviceRoot"] = frontend_dir

    return ServiceSummary(
        name=name,
        runtime=runtime,
        layer="frontend",
        tests=tests,
        line_cov=line_cov,
        branch_cov=branch_cov,
        links=links,
        warnings=warnings,
    )


# =======================
# HTML Rendering
# =======================

def _fmt_pct(cov: Optional[CoverageCounts]) -> str:
    if cov is None or cov.pct is None:
        return "N/A"
    return f"{cov.pct:.1f}%"


def _bar_cov(label: str, cov: Optional[CoverageCounts]) -> str:
    if cov is None or cov.total <= 0:
        return f'<div class="na">{html.escape(label)}: N/A</div>'

    covered_pct = 100.0 * (cov.covered / cov.total)
    missed_pct = 100.0 - covered_pct
    title = f"{label}: covered={cov.covered}, missed={cov.missed}, total={cov.total}"
    pct_txt = f"{covered_pct:.1f}%"

    return (
        f'<div class="metric" title="{html.escape(title)}">'
        f'  <div class="metric-top"><span class="metric-label">{html.escape(label)}</span>'
        f'    <span class="metric-val">{html.escape(pct_txt)}</span></div>'
        f'  <div class="bar" aria-label="{html.escape(title)}">'
        f'    <div class="seg covered" style="width:{covered_pct:.2f}%"></div>'
        f'    <div class="seg missed" style="width:{missed_pct:.2f}%"></div>'
        f"  </div>"
        f'  <div class="metric-sub">{cov.covered} covered / {cov.missed} missed</div>'
        f"</div>"
    )


def _bar_tests(t: Optional[TestCounts]) -> str:
    if t is None or t.tests <= 0:
        return '<div class="na">N/A</div>'

    passed = t.passed
    failed = t.failures + t.errors
    skipped = t.skipped
    total = t.tests

    passed_pct = 100.0 * (passed / total)
    failed_pct = 100.0 * (failed / total)
    skipped_pct = 100.0 * (skipped / total)

    title = f"tests={total}, passed={passed}, failed={failed}, skipped={skipped}"
    label = f"{passed}/{total}"

    return (
        f'<div class="metric" title="{html.escape(title)}">'
        f'  <div class="metric-top"><span class="metric-label">Tests</span>'
        f'    <span class="metric-val">{html.escape(label)}</span></div>'
        f'  <div class="bar" aria-label="{html.escape(title)}">'
        f'    <div class="seg covered" style="width:{passed_pct:.2f}%"></div>'
        f'    <div class="seg warn" style="width:{skipped_pct:.2f}%"></div>'
        f'    <div class="seg missed" style="width:{failed_pct:.2f}%"></div>'
        f"  </div>"
        f'  <div class="metric-sub">fail={t.failures}, err={t.errors}, skip={t.skipped}</div>'
        f"</div>"
    )


def _render_html(services: list[ServiceSummary], build_log_dir: Path) -> str:
    """Render complete HTML report with aggregated coverage."""
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    repo_root = _repo_root()
    base_href = _rel(build_log_dir, repo_root).rstrip("/") + "/"

    # Calculate aggregates
    total_tests = total_failures = total_errors = total_skipped = 0
    total_line_cov = CoverageCounts(covered=0, missed=0)
    total_branch_cov = CoverageCounts(covered=0, missed=0)
    line_cov_counted = 0
    branch_cov_counted = 0

    for s in services:
        if s.tests is not None:
            total_tests += s.tests.tests
            total_failures += s.tests.failures
            total_errors += s.tests.errors
            total_skipped += s.tests.skipped
        if s.line_cov is not None:
            total_line_cov.covered += s.line_cov.covered
            total_line_cov.missed += s.line_cov.missed
            line_cov_counted += 1
        if s.branch_cov is not None:
            total_branch_cov.covered += s.branch_cov.covered
            total_branch_cov.missed += s.branch_cov.missed
            branch_cov_counted += 1

    total_tests_bar = _bar_tests(
        TestCounts(
            tests=total_tests,
            failures=total_failures,
            errors=total_errors,
            skipped=total_skipped,
        ) if total_tests > 0 else None
    )
    total_line_bar = _bar_cov("Line coverage", total_line_cov) if line_cov_counted else _bar_cov("Line coverage", None)
    total_branch_bar = _bar_cov("Branch coverage", total_branch_cov) if branch_cov_counted else _bar_cov("Branch coverage", None)

    # Group services by layer
    backend_services = [s for s in services if s.layer == "backend"]
    frontend_services = [s for s in services if s.layer == "frontend"]

    # Render service rows
    rows = []
    
    # Backend services
    if backend_services:
        rows.append(
            '<tr class="layer-header">'
            f'<td colspan="7" class="layer-title">Backend Services ({len(backend_services)})</td>'
            '</tr>'
        )
        for s in backend_services:
            rows.append(_render_service_row(s, repo_root))
    
    # Frontend services
    if frontend_services:
        rows.append(
            '<tr class="layer-header">'
            f'<td colspan="7" class="layer-title">Frontend Services ({len(frontend_services)})</td>'
            '</tr>'
        )
        for s in frontend_services:
            rows.append(_render_service_row(s, repo_root))

    rows_html = "\n".join(rows)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="{html.escape(base_href, quote=True)}" />
  <title>Full Pipeline Coverage Summary</title>
  <style>
    :root {{
      --bg: #0b0f14;
      --fg: #e8eef5;
      --muted: #9fb0c3;
      --border: #243241;
      --warn: #ffcc66;
      --link: #8bd5ff;
      --card: #111825;
      --green: #49c36b;
      --red: #d64b4b;
      --yellow: #e0c44c;
      --layer-bg: #1a2332;
    }}
    html, body {{ background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }}
    .wrap {{ max-width: 1200px; margin: 24px auto; padding: 0 16px; }}
    .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }}
    h1 {{ margin: 0 0 8px 0; font-size: 24px; }}
    .meta {{ color: var(--muted); font-size: 13px; margin-bottom: 12px; }}
    .table-wrap {{ overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 10px; border-top: 1px solid var(--border); }}
    table {{ width: 100%; border-collapse: collapse; min-width: 980px; }}
    th, td {{ border-top: 1px solid var(--border); padding: 10px 8px; vertical-align: top; }}
    th {{ text-align: left; color: var(--muted); font-weight: 600; }}
    .layer-header {{ background: var(--layer-bg); }}
    .layer-title {{ font-weight: 700; color: var(--fg); padding: 12px 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }}
    .summary {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }}
    @media (max-width: 900px) {{ .summary {{ grid-template-columns: 1fr; }} }}
    .pill {{ border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.02); }}
    .warn {{ color: var(--warn); }}
    .small {{ font-size: 12px; color: var(--muted); }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }}
    .metric {{ width: 100%; min-width: 0; }}
    .metric-top {{ display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; }}
    .metric-label {{ color: var(--muted); font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase; }}
    .metric-val {{ font-weight: 700; }}
    .metric-sub {{ color: var(--muted); font-size: 12px; margin-top: 6px; }}
    .bar {{ height: 12px; border-radius: 999px; overflow: hidden; border: 1px solid var(--border); background: rgba(255,255,255,0.03); display: flex; }}
    .seg {{ height: 100%; }}
    .seg.covered {{ background: linear-gradient(90deg, #2ea84f, var(--green)); }}
    .seg.missed {{ background: linear-gradient(90deg, #b83838, var(--red)); }}
    .seg.warn {{ background: linear-gradient(90deg, #b79d2a, var(--yellow)); }}
    .na {{ color: var(--muted); font-size: 13px; }}
    .paths {{ max-width: 420px; word-break: break-word; }}
    .path-key {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; }}
    .paths > div {{ margin: 0 0 6px 0; }}
    .paths > div:last-child {{ margin-bottom: 0; }}
    a {{ color: var(--link); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .legend {{ display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }}
    .dot {{ width: 10px; height: 10px; border-radius: 999px; border: 1px solid var(--border); }}
    .dot.green {{ background: var(--green); }}
    .dot.red {{ background: var(--red); }}
    .dot.yellow {{ background: var(--yellow); }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }}
    .badge.backend {{ background: #1e3a5f; color: #6eb5ff; }}
    .badge.frontend {{ background: #3e1e5f; color: #d89eff; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Full Pipeline: Aggregated Coverage Summary</h1>
      <div class="meta">Generated: {html.escape(now)} | Backend + Frontend services</div>
      <div class="summary">
        <div class="pill">{total_tests_bar}</div>
        <div class="pill">{total_line_bar}</div>
        <div class="pill">{total_branch_bar}</div>
      </div>
      <div class="legend">
        <span class="chip"><span class="dot green"></span> covered / passed</span>
        <span class="chip"><span class="dot yellow"></span> skipped</span>
        <span class="chip"><span class="dot red"></span> missed / failed</span>
      </div>
      <div class="small">Tip: click report paths to open detailed coverage and test reports (Vitest, Playwright, JaCoCo).</div>
      <div class="table-wrap" role="region" aria-label="Service coverage table">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Runtime</th>
              <th>Tests (pass/fail)</th>
              <th>Line Coverage</th>
              <th>Branch Coverage</th>
              <th>Report paths</th>
              <th>Warnings</th>
            </tr>
          </thead>
          <tbody>
{rows_html}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    (function () {{
      const href = String(window.location.href || "");
      const host = String(window.location.host || "");
      const protocol = String(window.location.protocol || "");
      const isVsCodePreview =
        href.includes("vscode-resource") ||
        href.includes("vscode-webview") ||
        host.includes("vscode-cdn.net") ||
        protocol === "vscode-webview:" ||
        protocol === "vscode-resource:";

      if (!isVsCodePreview) {{
        return;
      }}

      for (const anchor of document.querySelectorAll("a[data-file-uri]")) {{
        const fileUri = anchor.getAttribute("data-file-uri");
        if (fileUri) {{
          anchor.setAttribute("href", fileUri);
        }}
      }}
    }})();
  </script>
</body>
</html>
"""


def _render_service_row(s: ServiceSummary, repo_root: Path) -> str:
    """Render a single service row in the HTML table."""
    # Paths (repo-relative, with file URIs for VS Code)
    path_lines = []
    
    # Order of links to display
    link_order = [
        "coverage",           # Backend coverage
        "vitestCoverage",     # Frontend vitest coverage
        "playwrightReport",   # Frontend playwright report
        "tests",              # Backend tests
        "vitestTests",        # Frontend vitest tests
        "playwrightTests",    # Frontend playwright tests
        "checkstyleMain",     # Backend checkstyle
        "checkstyleTest",     # Backend checkstyle test
        "serviceRoot",        # Service root directory
    ]
    
    for key in link_order:
        if key not in s.links:
            continue
        rel_path = _rel(repo_root, s.links[key])
        file_uri = s.links[key].resolve().as_uri()
        path_lines.append(
            "<div>"
            f"<span class=\"path-key\">{html.escape(key)}:</span> "
            f"<a href=\"{html.escape(rel_path, quote=True)}\" "
            f"data-file-uri=\"{html.escape(file_uri, quote=True)}\" "
            f"target=\"_blank\" rel=\"noopener\">"
            f"<code class=\"mono\">{html.escape(rel_path)}</code>"
            "</a>"
            "</div>"
        )
    paths_html = "".join(path_lines) if path_lines else '<div class="na">N/A</div>'

    warn_str = "; ".join(s.warnings) if s.warnings else ""

    badge_class = "backend" if s.layer == "backend" else "frontend"

    return (
        "<tr>"
        f"<td class=\"mono\">{html.escape(s.name)} <span class=\"badge {badge_class}\">{html.escape(s.layer)}</span></td>"
        f"<td class=\"mono\">{html.escape(s.runtime)}</td>"
        f"<td>{_bar_tests(s.tests)}</td>"
        f"<td>{_bar_cov('Line', s.line_cov)}</td>"
        f"<td>{_bar_cov('Branch', s.branch_cov)}</td>"
        f"<td class=\"paths\">{paths_html}</td>"
        f"<td class=\"warn\">{html.escape(warn_str)}</td>"
        "</tr>"
    )


# =======================
# Main Function
# =======================

def main() -> int:
    parser = argparse.ArgumentParser(description="Generate aggregated coverage report.")
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for the report. Defaults to build-logs/build-and-test-all/.",
    )
    args = parser.parse_args()

    repo_root = _repo_root()
    backend_root = repo_root / "services" / "backend"
    frontend_root = repo_root / "services" / "frontend" / "crm-ui"
    if args.output_dir:
        build_log_dir = Path(args.output_dir).resolve()
    else:
        build_log_dir = repo_root / "build-logs" / "build-and-test-all"
    build_log_dir.mkdir(parents=True, exist_ok=True)

    services: list[ServiceSummary] = []

    # Collect backend services
    if backend_root.is_dir():
        for child in sorted(backend_root.iterdir()):
            if not child.is_dir():
                continue
            summary = _summarize_backend_service(child)
            if summary:
                services.append(summary)

    # Collect frontend service
    if frontend_root.is_dir():
        summary = _summarize_frontend_service(frontend_root)
        if summary:
            services.append(summary)

    # Generate HTML
    html_doc = _render_html(services, build_log_dir)
    out_file = build_log_dir / "index.html"
    out_file.write_text(html_doc, encoding="utf-8")
    print(f"[aggregated-coverage] Wrote {out_file}")
    print(f"[aggregated-coverage] Total services: {len(services)} (backend: {sum(1 for s in services if s.layer == 'backend')}, frontend: {sum(1 for s in services if s.layer == 'frontend')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
