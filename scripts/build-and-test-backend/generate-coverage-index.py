#!/usr/bin/env python3
from __future__ import annotations

import datetime as _dt
import html
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
    tests: Optional[TestCounts]
    line_cov: Optional[CoverageCounts]
    branch_cov: Optional[CoverageCounts]
    links: dict[str, Path]
    warnings: list[str]


def _repo_root() -> Path:
    # scripts/build-and-test-backend/generate-coverage-index.py -> repo root
    return Path(__file__).resolve().parents[2]


def _rel(from_dir: Path, to_path: Path) -> str:
    try:
        return os.path.relpath(str(to_path), start=str(from_dir)).replace("\\", "/")
    except Exception:
        return str(to_path).replace("\\", "/")


def _parse_junit_dir(test_results_dir: Path) -> Optional[TestCounts]:
    if not test_results_dir.is_dir():
        return None

    tests = failures = errors = skipped = 0
    found = False
    for xml_file in sorted(test_results_dir.glob("*.xml")):
        try:
            root = ET.parse(xml_file).getroot()
        except Exception:
            continue

        # Root is usually <testsuite> or <testsuites>
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
    # coverage.py can emit Cobertura XML (<coverage ... lines-valid=".." lines-covered="..">)
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
    if (service_dir / "gradlew").exists() or (service_dir / "gradlew.bat").exists():
        return "gradle"
    if (service_dir / "run-local-test-pipeline.py").exists():
        return "python"
    return None


def _summarize_service(service_dir: Path, build_log_dir: Path) -> ServiceSummary:
    name = service_dir.name
    runtime = _detect_runtime(service_dir) or "unknown"
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

        # Links (best effort)
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

    else:
        warnings.append("unknown runtime (no reports discovered)")

    # Always include service root link for convenience
    links["serviceRoot"] = service_dir

    return ServiceSummary(
        name=name,
        runtime=runtime,
        tests=tests,
        line_cov=line_cov,
        branch_cov=branch_cov,
        links=links,
        warnings=warnings,
    )


def _fmt_pct(cov: Optional[CoverageCounts]) -> str:
    if cov is None or cov.pct is None:
        return "N/A"
    return f"{cov.pct:.1f}%"


def _fmt_tests(t: Optional[TestCounts]) -> str:
    if t is None:
        return "N/A"
    return f"{t.passed}/{t.tests} (fail={t.failures}, err={t.errors}, skip={t.skipped})"


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
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    repo_root = _repo_root()
    base_href = _rel(build_log_dir, repo_root).rstrip("/") + "/"

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

    total_passed = max(0, total_tests - total_failures - total_errors)
    total_tests_bar = _bar_tests(
        TestCounts(
            tests=total_tests,
            failures=total_failures,
            errors=total_errors,
            skipped=total_skipped,
        )
    )
    total_line_bar = _bar_cov("Line coverage", total_line_cov) if line_cov_counted else _bar_cov("Line coverage", None)
    total_branch_bar = _bar_cov("Branch coverage", total_branch_cov) if branch_cov_counted else _bar_cov("Branch coverage", None)

    rows = []
    for s in services:
        # Paths (repo-relative, so they can be copy/pasted reliably even when HTML previews block file links)
        path_lines = []
        # Provide predictable ordering
        for key in ("coverage", "tests", "checkstyleMain", "checkstyleTest", "serviceRoot"):
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

        rows.append(
            "<tr>"
            f"<td class=\"mono\">{html.escape(s.name)}</td>"
            f"<td class=\"mono\">{html.escape(s.runtime)}</td>"
            f"<td>{_bar_tests(s.tests)}</td>"
            f"<td>{_bar_cov('Line', s.line_cov)}</td>"
            f"<td>{_bar_cov('Branch', s.branch_cov)}</td>"
            f"<td class=\"paths\">{paths_html}</td>"
            f"<td class=\"warn\">{html.escape(warn_str)}</td>"
            "</tr>"
        )

    rows_html = "\n".join(rows)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="{html.escape(base_href, quote=True)}" />
  <title>Backend Coverage Summary</title>
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
    }}
    html, body {{ background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }}
    .wrap {{ max-width: 1100px; margin: 24px auto; padding: 0 16px; }}
    .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }}
    h1 {{ margin: 0 0 8px 0; font-size: 22px; }}
    .meta {{ color: var(--muted); font-size: 13px; margin-bottom: 12px; }}
    .table-wrap {{ overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 10px; border-top: 1px solid var(--border); }}
    table {{ width: 100%; border-collapse: collapse; min-width: 980px; }}
    th, td {{ border-top: 1px solid var(--border); padding: 10px 8px; vertical-align: top; }}
    th {{ text-align: left; color: var(--muted); font-weight: 600; }}
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
    @media (max-width: 900px) {{
      .table-wrap {{ border-top: 0; }}
      table {{ min-width: 820px; }}
    }}
    @media (max-width: 640px) {{
      table {{ min-width: 740px; }}
      th, td {{ padding: 10px 6px; }}
      h1 {{ font-size: 20px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Backend Local Pipeline: Coverage Summary</h1>
      <div class="meta">Generated: {html.escape(now)} (from reports under each service directory)</div>
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
      <div class="small">Tip: click a per-service <code>coverage</code> path to open the HTML report.</div>
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


def main() -> int:
    repo_root = _repo_root()
    backend_root = repo_root / "services" / "backend"
    build_log_dir_env = os.environ.get("BUILD_LOG_DIR")
    if build_log_dir_env:
        build_log_dir = Path(build_log_dir_env)
        if not build_log_dir.is_absolute():
            build_log_dir = repo_root / build_log_dir
    else:
        build_log_dir = repo_root / "build-logs"
    build_log_dir.mkdir(parents=True, exist_ok=True)

    services: list[ServiceSummary] = []
    if backend_root.is_dir():
        for child in sorted(backend_root.iterdir()):
            if not child.is_dir():
                continue
            runtime = _detect_runtime(child)
            if runtime is None:
                continue
            services.append(_summarize_service(child, build_log_dir))

    html_doc = _render_html(services, build_log_dir)
    out_file = build_log_dir / "index.html"
    out_file.write_text(html_doc, encoding="utf-8")
    print(f"[coverage-index] Wrote {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
